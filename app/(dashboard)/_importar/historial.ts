// Historial de subidas de planillas: qué se guarda de cada una y cómo se arma.
// Puro (sin base de datos): lo usan la pantalla y la server action.
//
// Cada subida se registra al analizarla (estado "revision", o "sinNovedades"
// si ya estaba todo en la app con los mismos datos) o al fallar la
// lectura ("noLeida"), y se actualiza al importar ("importada",
// "sinNovedades" o "fallo"). Si el usuario sale sin importar, queda en
// "revision" y se muestra como "No se importó".

import { seccionDef } from "./secciones";
import type { EstadoCotejo, Plan } from "./planificar";
import type { Deteccion, Hoja } from "./tipos";

export type EstadoSubida = "revision" | "importada" | "sinNovedades" | "fallo" | "noLeida";

export type DetalleSubida = {
  archivos: { nombre: string; tamano: number }[];
  hojas: number;
  /** Tablas reconocidas y a qué sección se asignaron. */
  tablas: { seccion: string; hoja: string; titulo: string; filas: number }[];
  /** Tablas de la planilla que no se importan (contabilidad, bancos…). */
  tablasNoImportadas: number;
  resumen: { nombre: string; total: number; existentes: number; modificados: number; importados: number; conError: number }[];
  /** Registros que ya estaban y cambiaron en la planilla: qué dato se cambió y cuál se dejó. */
  modificaciones: {
    seccion: string;
    nombre: string;
    hoja: string;
    fila: number;
    cambios: { etiqueta: string; antes: string; despues: string; conflicto: boolean; eleccion: "app" | "planilla" | null; aplicado: boolean }[];
  }[];
  /** Filas que no se importaron por un error (las primeras MAX_ERRORES). */
  errores: { seccion: string; hoja: string; fila: number; mensaje: string }[];
  /** Cuántos errores había en total (puede haber más que los guardados). */
  totalErrores: number;
  avisos: string[];
  cotejo: { concepto: string; planilla: number | null; app: number; formato: "moneda" | "numero"; estado: EstadoCotejo; detalle: string }[];
};

export type Subida = {
  id: number;
  /** ISO (se muestra con la hora local de la PC). */
  fecha: string;
  usuario: string;
  archivo: string;
  estado: EstadoSubida;
  agregados: number;
  existentes: number;
  conError: number;
  avisos: number;
  respaldo: string | null;
  error: string | null;
  detalle: DetalleSubida;
};

export const MAX_ERRORES = 1000;
export const MAX_MODIFICACIONES = 1000;
export const MAX_AVISOS = 300;
const MAX_TEXTO = 500;

export const DETALLE_VACIO: DetalleSubida = {
  archivos: [],
  hojas: 0,
  tablas: [],
  tablasNoImportadas: 0,
  resumen: [],
  modificaciones: [],
  errores: [],
  totalErrores: 0,
  avisos: [],
  cotejo: [],
};

/** Lo que se sabe al leer el archivo: archivos, hojas y tablas reconocidas. */
export function detalleDeLectura(archivos: { nombre: string; tamano: number }[], hojas: Hoja[], detecciones: Deteccion[]): DetalleSubida {
  const usadas = detecciones.filter((d) => d.seccion !== null);
  return {
    ...DETALLE_VACIO,
    archivos,
    hojas: hojas.length,
    tablas: usadas.map((d) => ({ seccion: seccionDef(d.seccion!).nombre, hoja: d.bloque.hoja, titulo: d.titulo, filas: d.cantidadFilas })),
    tablasNoImportadas: detecciones.length - usadas.length,
  };
}

/** Le suma al detalle lo que resultó del plan (en la pantalla o, al importar, en el servidor). */
export function detalleConPlan(d: DetalleSubida, plan: Plan): DetalleSubida {
  const errores = plan.problemas.filter((p) => p.tipo === "error");
  return {
    ...d,
    resumen: plan.resumen.map(({ nombre, total, existentes, modificados, importados, conError }) => ({ nombre, total, existentes, modificados, importados, conError })),
    modificaciones: plan.modificaciones.slice(0, MAX_MODIFICACIONES).map((m) => ({
      seccion: m.seccion,
      nombre: m.nombre.slice(0, MAX_TEXTO),
      hoja: m.origen.hoja,
      fila: m.origen.fila,
      cambios: m.cambios.map(({ etiqueta, antes, despues, conflicto, eleccion, aplicado }) => ({
        etiqueta,
        antes: antes.slice(0, MAX_TEXTO),
        despues: despues.slice(0, MAX_TEXTO),
        conflicto,
        eleccion,
        aplicado,
      })),
    })),
    errores: errores.slice(0, MAX_ERRORES).map((p) => ({
      seccion: p.seccion,
      hoja: p.origen?.hoja ?? "",
      fila: p.origen?.fila ?? 0,
      mensaje: p.mensaje.slice(0, MAX_TEXTO),
    })),
    totalErrores: errores.length,
    avisos: plan.problemas
      .filter((p) => p.tipo === "aviso")
      .slice(0, MAX_AVISOS)
      .map((p) => (p.origen && p.origen.fila > 0 ? `${p.origen.hoja}, fila ${p.origen.fila}: ` : "") + p.mensaje.slice(0, MAX_TEXTO)),
    cotejo: plan.cotejo.map(({ concepto, planilla, app, formato, estado, detalle }) => ({ concepto, planilla, app, formato, estado, detalle })),
  };
}

/** Totales que se guardan en columnas (para la lista). */
export function totalesDePlan(plan: Plan) {
  const suma = (k: "existentes" | "importados" | "conError") => plan.resumen.reduce((s, r) => s + r[k], 0);
  return {
    agregados: plan.nuevos.length,
    existentes: suma("existentes"),
    conError: suma("conError"),
    avisos: plan.problemas.filter((p) => p.tipo === "aviso").length,
  };
}

// ── Lectura segura (de la base o de lo que manda el navegador) ──────────────

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown, max = MAX_TEXTO) => (typeof x === "string" ? x.slice(0, max) : "");
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const lista = <T>(x: unknown, max: number, f: (o: Record<string, unknown>) => T): T[] =>
  Array.isArray(x) ? x.filter(esObjeto).slice(0, max).map(f) : [];
const ESTADOS_COTEJO: EstadoCotejo[] = ["coincide", "yaEstaba", "otrosDatos", "conErrores", "distinto"];

/** Detalle desde JSON: lo que no tiene la forma esperada se descarta. */
export function leerDetalle(x: unknown): DetalleSubida {
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return DETALLE_VACIO;
    }
  }
  if (!esObjeto(x)) return DETALLE_VACIO;
  return {
    archivos: lista(x.archivos, 50, (a) => ({ nombre: texto(a.nombre, 200), tamano: num(a.tamano) })),
    hojas: num(x.hojas),
    tablas: lista(x.tablas, 500, (t) => ({ seccion: texto(t.seccion, 100), hoja: texto(t.hoja, 100), titulo: texto(t.titulo, 200), filas: num(t.filas) })),
    tablasNoImportadas: num(x.tablasNoImportadas),
    resumen: lista(x.resumen, 20, (r) => ({
      nombre: texto(r.nombre, 100),
      total: num(r.total),
      existentes: num(r.existentes),
      modificados: num(r.modificados),
      importados: num(r.importados),
      conError: num(r.conError),
    })),
    modificaciones: lista(x.modificaciones, MAX_MODIFICACIONES, (m) => ({
      seccion: texto(m.seccion, 50),
      nombre: texto(m.nombre),
      hoja: texto(m.hoja, 100),
      fila: num(m.fila),
      cambios: lista(m.cambios, 30, (c) => ({
        etiqueta: texto(c.etiqueta, 100),
        antes: texto(c.antes),
        despues: texto(c.despues),
        conflicto: c.conflicto === true,
        eleccion: c.eleccion === "app" || c.eleccion === "planilla" ? c.eleccion : null,
        aplicado: c.aplicado === true,
      })),
    })),
    errores: lista(x.errores, MAX_ERRORES, (e) => ({ seccion: texto(e.seccion, 50), hoja: texto(e.hoja, 100), fila: num(e.fila), mensaje: texto(e.mensaje) })),
    totalErrores: num(x.totalErrores),
    avisos: Array.isArray(x.avisos) ? x.avisos.slice(0, MAX_AVISOS).map((a) => texto(a)).filter(Boolean) : [],
    cotejo: lista(x.cotejo, 200, (c) => ({
      concepto: texto(c.concepto, 200),
      planilla: typeof c.planilla === "number" && Number.isFinite(c.planilla) ? c.planilla : null,
      app: num(c.app),
      formato: c.formato === "moneda" ? "moneda" : "numero",
      estado: ESTADOS_COTEJO.includes(c.estado as EstadoCotejo) ? (c.estado as EstadoCotejo) : "distinto",
      detalle: texto(c.detalle),
    })),
  };
}
