"use server";

// Importación de la planilla: el navegador lee el Excel, detecta las tablas y
// manda los registros ya extraídos (no el archivo). Acá se vuelve a armar el
// plan con las reglas de la app (no se confía en lo que calculó la pantalla),
// partiendo de lo que ya hay en la base: solo se agregan los registros nuevos
// y lo que ya estaba no se toca (ver planificar.ts). Todo en una transacción;
// reimportar el mismo archivo no duplica nada. Si la base ya tenía datos,
// antes se guarda una copia en respaldos/.
//
// Cada subida queda en el historial (SubidaPlanilla): se registra al
// analizarla en la pantalla y se actualiza con el resultado de la importación.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { obtenerSesion } from "@/lib/auth/sesion";
import type { Estado } from "../_dominio/acciones";
import { UNIDADES_MEDIDA, type UnidadMedida } from "../materia-prima/data";
import { hayCambios, planificar, type Eleccion, type Plan, type ResumenSeccion } from "../_importar/planificar";
import { detalleConPlan, leerDetalle, totalesDePlan, type EstadoSubida, type Subida } from "../_importar/historial";
import type { Extraccion, Registro, SeccionRegistro, Valor } from "../_importar/tipos";
import { cargarEstado, guardarCambios } from "./repositorio";

export type ResultadoImportacion =
  | { ok: true; estado: Estado; resumen: ResumenSeccion[]; respaldo: string | null; agregados: number; modificados: number; subida: Subida | null }
  | { ok: false; error: string; sinSesion?: true; subida?: Subida | null };

const SECCIONES: SeccionRegistro[] = [
  "materiaPrima",
  "productos",
  "proveedores",
  "clientes",
  "existenciaMP",
  "existenciaPT",
  "compras",
  "ordenes",
  "ventas",
];
const MAX_REGISTROS = 100_000;

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const esValor = (x: unknown): x is Valor => x === null || typeof x === "string" || (typeof x === "number" && Number.isFinite(x));
const esOrigen = (x: unknown) => esObjeto(x) && typeof x.hoja === "string" && typeof x.fila === "number";
const esValores = (x: unknown): x is Record<string, Valor> => esObjeto(x) && Object.values(x).every(esValor);

function esRegistro(x: unknown): x is Registro {
  if (!esObjeto(x)) return false;
  if (!SECCIONES.includes(x.seccion as SeccionRegistro) || typeof x.clave !== "string" || !esOrigen(x.origen) || !esValores(x.v)) return false;
  return x.insumos === undefined || (Array.isArray(x.insumos) && x.insumos.every((i) => esObjeto(i) && esOrigen(i.origen) && esValores(i.v)));
}

/** Lo que llega es cualquier cosa (las server actions son públicas): solo pasa la forma esperada; los datos los valida planificar. */
function leerEntrada(
  x: unknown
): { extraccion: Extraccion; unidades: Record<string, UnidadMedida>; elecciones: Record<string, Eleccion>; subidaId: number | null } | null {
  if (!esObjeto(x) || !esObjeto(x.extraccion) || !esObjeto(x.unidades)) return null;
  const { registros, referencias } = x.extraccion;
  if (!Array.isArray(registros) || registros.length > MAX_REGISTROS || !registros.every(esRegistro)) return null;
  if (!esObjeto(referencias) || !Array.isArray(referencias.saldosMP)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const saldosMP = referencias.saldosMP
    .filter((s): s is { materia: string; saldo: number } => esObjeto(s) && typeof s.materia === "string" && num(s.saldo) !== null)
    .map((s) => ({ materia: s.materia, saldo: s.saldo }));
  const unidades: Record<string, UnidadMedida> = {};
  for (const [k, u] of Object.entries(x.unidades)) if ((UNIDADES_MEDIDA as unknown[]).includes(u)) unidades[k] = u as UnidadMedida;
  return {
    extraccion: {
      registros,
      referencias: {
        totalCompras: num(referencias.totalCompras),
        totalVentas: num(referencias.totalVentas),
        unidadesVendidas: num(referencias.unidadesVendidas),
        saldosMP,
      },
    },
    unidades,
    elecciones: Object.fromEntries(
      Object.entries(esObjeto(x.elecciones) ? x.elecciones : {}).filter((par): par is [string, Eleccion] => par[1] === "app" || par[1] === "planilla")
    ),
    subidaId: typeof x.subidaId === "number" && Number.isInteger(x.subidaId) ? x.subidaId : null,
  };
}

/** Copia de la base con VACUUM INTO (consistente aunque esté en uso). Devuelve el nombre del archivo. */
async function respaldar(): Promise<string> {
  const carpeta = path.join(process.cwd(), "respaldos");
  mkdirSync(carpeta, { recursive: true });
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  const nombre = `antes-de-importar-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}.db`;
  const destino = path.join(carpeta, nombre).replace(/\\/g, "/").replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${destino}'`);
  return nombre;
}

export async function importarPlanilla(entrada: unknown): Promise<ResultadoImportacion> {
  const sesion = await obtenerSesion();
  if (!sesion) return { ok: false, error: "Tu sesión terminó: volvé a iniciar sesión.", sinSesion: true };
  const datos = leerEntrada(entrada);
  if (!datos) return { ok: false, error: "Los datos de la planilla llegaron incompletos. Volvé a cargar el archivo." };
  const anotar = (estado: EstadoSubida, plan: Plan | null, extra: { respaldo?: string | null; error?: string } = {}) =>
    anotarResultado(datos.subidaId, sesion.username, estado, plan, extra);

  const sinNada = "No hay nada nuevo para agregar ni datos que cambien: todo lo de la planilla ya está en la app.";
  const opciones = (base: Estado) => ({ unidades: datos.unidades, elecciones: datos.elecciones, base });
  try {
    // Primero se mira si hay algo nuevo (así no se hace una copia de seguridad de más).
    const actual = await cargarEstado(prisma);
    const previo = planificar(datos.extraccion, opciones(actual));
    if (!hayCambios(previo)) return { ok: false, error: sinNada, subida: await anotar("sinNovedades", previo) };
    const conDatos = actual.clientes.length + actual.productos.length + actual.compras.length + actual.operaciones.length;
    const respaldo = conDatos > 0 ? await respaldar() : null;
    const resultado = await prisma.$transaction(
      async (tx) => {
        const antes = await cargarEstado(tx);
        const plan = planificar(datos.extraccion, opciones(antes));
        if (hayCambios(plan)) await guardarCambios(tx, antes, plan.estado);
        return { estado: await cargarEstado(tx), plan };
      },
      { timeout: 120_000 }
    );
    const { plan } = resultado;
    if (!hayCambios(plan)) return { ok: false, error: sinNada, subida: await anotar("sinNovedades", plan) };
    const subida = await anotar("importada", plan, { respaldo });
    const modificados = plan.modificaciones.filter((m) => m.aplicada).length;
    return { ok: true, estado: resultado.estado, resumen: plan.resumen, respaldo, agregados: plan.nuevos.length, modificados, subida };
  } catch (err) {
    console.error("No se pudo importar la planilla:", err);
    const error = "No se pudo guardar la importación en la base de datos. No se cambió nada: probá de nuevo.";
    return { ok: false, error, subida: await anotar("fallo", null, { error }) };
  }
}

// ── Historial de subidas ────────────────────────────────────────────────────

type FilaSubida = {
  id: number;
  fecha: Date;
  usuario: string;
  archivo: string;
  estado: string;
  agregados: number;
  existentes: number;
  conError: number;
  avisos: number;
  respaldo: string | null;
  error: string | null;
  detalle: string;
};

const ESTADOS: EstadoSubida[] = ["revision", "importada", "sinNovedades", "fallo", "noLeida"];

function aSubida(f: FilaSubida): Subida {
  return {
    id: f.id,
    fecha: f.fecha.toISOString(),
    usuario: f.usuario,
    archivo: f.archivo,
    estado: ESTADOS.includes(f.estado as EstadoSubida) ? (f.estado as EstadoSubida) : "revision",
    agregados: f.agregados,
    existentes: f.existentes,
    conError: f.conError,
    avisos: f.avisos,
    respaldo: f.respaldo,
    error: f.error,
    detalle: leerDetalle(f.detalle),
  };
}

/** Anota el resultado de la importación en su subida (o la crea si no estaba). Si falla, no frena la importación. */
async function anotarResultado(
  id: number | null,
  usuario: string,
  estado: EstadoSubida,
  plan: Plan | null,
  extra: { respaldo?: string | null; error?: string }
): Promise<Subida | null> {
  try {
    const previa = id === null ? null : await prisma.subidaPlanilla.findUnique({ where: { id } });
    const datos = {
      estado,
      ...(plan ? { ...totalesDePlan(plan), detalle: JSON.stringify(detalleConPlan(leerDetalle(previa?.detalle ?? "{}"), plan)) } : {}),
      ...(estado === "importada" ? {} : { agregados: 0 }),
      respaldo: extra.respaldo ?? null,
      error: extra.error ?? null,
    };
    const fila = previa
      ? await prisma.subidaPlanilla.update({ where: { id: previa.id }, data: datos })
      : await prisma.subidaPlanilla.create({ data: { usuario, archivo: "(sin nombre)", ...datos } });
    return aSubida(fila);
  } catch (err) {
    console.error("No se pudo anotar la subida en el historial:", err);
    return null;
  }
}

const MAX_DETALLE = 2_000_000;

/**
 * Anota una subida: al terminar de analizarla en la pantalla ("revision", con
 * lo que se encontró) o si no se pudo leer ("noLeida", con el motivo).
 */
export async function registrarSubida(entrada: unknown): Promise<{ ok: true; subida: Subida } | { ok: false; error: string; sinSesion?: true }> {
  const sesion = await obtenerSesion();
  if (!sesion) return { ok: false, error: "Tu sesión terminó: volvé a iniciar sesión.", sinSesion: true };
  if (!esObjeto(entrada)) return { ok: false, error: "Los datos de la subida llegaron incompletos." };
  const estado: EstadoSubida = entrada.estado === "noLeida" || entrada.estado === "sinNovedades" ? entrada.estado : "revision";
  const archivo = typeof entrada.archivo === "string" && entrada.archivo.trim() ? entrada.archivo.trim().slice(0, 500) : "(sin nombre)";
  const detalle = leerDetalle(typeof entrada.detalle === "string" && entrada.detalle.length <= MAX_DETALLE ? entrada.detalle : "{}");
  const totales = esObjeto(entrada.totales) ? entrada.totales : {};
  const n = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : 0);
  try {
    const fila = await prisma.subidaPlanilla.create({
      data: {
        usuario: sesion.username,
        archivo,
        estado,
        // En revisión todavía no se agregó nada: los nuevos se anotan al importar.
        existentes: n(totales.existentes),
        conError: n(totales.conError),
        avisos: n(totales.avisos),
        error: estado === "noLeida" && typeof entrada.error === "string" ? entrada.error.slice(0, 500) : null,
        detalle: JSON.stringify(detalle),
      },
    });
    return { ok: true, subida: aSubida(fila) };
  } catch (err) {
    console.error("No se pudo anotar la subida en el historial:", err);
    return { ok: false, error: "No se pudo guardar la subida en el historial." };
  }
}

/** Las últimas subidas, de la más nueva a la más vieja. */
export async function listarSubidas(): Promise<Subida[]> {
  if (!(await obtenerSesion({ tocar: false }))) return [];
  const filas = await prisma.subidaPlanilla.findMany({ orderBy: { fecha: "desc" }, take: 100 });
  return filas.map(aSubida);
}
