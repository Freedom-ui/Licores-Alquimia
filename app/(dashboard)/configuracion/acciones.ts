"use server";

// Acciones de Configuración: datos del establecimiento, copias de seguridad,
// Google Drive y restauración. Todas validan la sesión (las server actions son
// públicas).

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { obtenerSesion } from "@/lib/auth/sesion";
import { validarEmpresa, type Empresa } from "@/app/empresa";
import type { Errores } from "@/app/components/data-table/validacion";
import { buscarCopia, hacerCopia, prepararRestauracion, rotarCopias } from "@/lib/copias/local";
import { enFila, subirPendientes } from "@/lib/copias/programador";
import { estadoCopias, type EstadoCopias } from "@/lib/copias/estado";
import { bajarCopia, desconectar, ErrorDrive, listarCopiasDrive, urlDeConexion } from "@/lib/copias/drive";
import type { Motivo } from "@/lib/copias/nombres";
import { pedirReinicio } from "@/lib/escritorio";

const SIN_SESION = { ok: false as const, error: "Tu sesión terminó: volvé a iniciar sesión.", sinSesion: true as const };
const mensaje = (e: unknown, porDefecto: string) => (e instanceof Error && e.message ? e.message : porDefecto);

// ── Datos del establecimiento ───────────────────────────────

export type ResultadoEmpresa = { ok: true; empresa: Empresa } | { ok: false; error?: string; errores?: Errores; sinSesion?: true };

export async function guardarEmpresa(v: unknown): Promise<ResultadoEmpresa> {
  if (!(await obtenerSesion())) return SIN_SESION;
  const r = validarEmpresa(v);
  if (!r.ok) return { ok: false, errores: r.errores };
  try {
    await prisma.empresa.upsert({ where: { id: 1 }, create: { id: 1, ...r.valor }, update: r.valor });
    return { ok: true, empresa: r.valor };
  } catch (e) {
    console.error("No se pudieron guardar los datos del establecimiento:", e);
    return { ok: false, error: "No se pudieron guardar los datos. Probá de nuevo." };
  }
}

// ── Copias ──────────────────────────────────────────────────

export type ResultadoCopias = { ok: true; estado: EstadoCopias; aviso?: string } | { ok: false; error: string; sinSesion?: true };

export async function consultarCopias(): Promise<ResultadoCopias> {
  if (!(await obtenerSesion({ tocar: false }))) return SIN_SESION;
  return { ok: true, estado: estadoCopias() };
}

export async function copiarAhora(): Promise<ResultadoCopias> {
  if (!(await obtenerSesion())) return SIN_SESION;
  try {
    await enFila(() => {
      hacerCopia("manual");
      rotarCopias();
    });
  } catch (e) {
    return { ok: false, error: mensaje(e, "No se pudo hacer la copia de seguridad.") };
  }
  // La subida a Drive puede tardar: sigue sola y la pantalla consulta el estado.
  void enFila(subirPendientes);
  return { ok: true, estado: estadoCopias() };
}

// ── Google Drive ────────────────────────────────────────────

/** URL de Google para conectar la cuenta (la pantalla la abre en el navegador). */
export async function conectarDrive(): Promise<{ ok: true; url: string } | { ok: false; error: string; sinSesion?: true }> {
  if (!(await obtenerSesion())) return SIN_SESION;
  try {
    const h = await headers();
    const host = h.get("host") ?? "127.0.0.1";
    return { ok: true, url: urlDeConexion(`http://${host}/api/drive/callback`) };
  } catch (e) {
    return { ok: false, error: mensaje(e, "No se pudo empezar la conexión con Google Drive.") };
  }
}

export async function desconectarDrive(): Promise<ResultadoCopias> {
  if (!(await obtenerSesion())) return SIN_SESION;
  await desconectar();
  return { ok: true, estado: estadoCopias() };
}

/** Sube ya lo que falte (después de conectar o con "Reintentar"). */
export async function subirAhora(): Promise<ResultadoCopias> {
  if (!(await obtenerSesion())) return SIN_SESION;
  await enFila(subirPendientes);
  return { ok: true, estado: estadoCopias() };
}

export type CopiaDriveVista = { id: string; nombre: string; fecha: string; motivo: Motivo; tamano: number };

export async function listarDrive(): Promise<{ ok: true; copias: CopiaDriveVista[] } | { ok: false; error: string; sinSesion?: true }> {
  if (!(await obtenerSesion({ tocar: false }))) return SIN_SESION;
  try {
    const copias = await listarCopiasDrive();
    return { ok: true, copias: copias.map((c) => ({ id: c.id, nombre: c.nombre.replace(/\.gz$/, ""), fecha: c.fecha.toISOString(), motivo: c.motivo, tamano: c.tamano })) };
  } catch (e) {
    return { ok: false, error: e instanceof ErrorDrive ? e.message : "No se pudo leer la lista de copias de Google Drive." };
  }
}

// ── Restaurar ───────────────────────────────────────────────

/** reinicio: la app se reinicia sola (escritorio); si no, hay que reiniciar el servidor a mano (desarrollo). */
export type ResultadoRestaurar = { ok: true; reinicio: boolean } | { ok: false; error: string; sinSesion?: true };

async function restaurar(obtener: () => Promise<Buffer | string>): Promise<ResultadoRestaurar> {
  if (!(await obtenerSesion())) return SIN_SESION;
  try {
    const datos = await obtener();
    await enFila(() => prepararRestauracion(datos));
  } catch (e) {
    return { ok: false, error: mensaje(e, "No se pudo preparar la restauración.") };
  }
  return { ok: true, reinicio: pedirReinicio() };
}

export async function restaurarLocal(nombre: unknown): Promise<ResultadoRestaurar> {
  return restaurar(async () => {
    const c = typeof nombre === "string" ? buscarCopia(nombre) : undefined;
    if (!c) throw new Error("Esa copia ya no está en la PC.");
    return c.ruta;
  });
}

export async function restaurarDrive(id: unknown): Promise<ResultadoRestaurar> {
  return restaurar(async () => {
    if (typeof id !== "string" || !/^[\w-]+$/.test(id)) throw new Error("Copia desconocida.");
    return bajarCopia(id);
  });
}

// Límite de las server actions (next.config.ts): una base de muchos años pesa unos pocos MB.
const TAMANO_MAX = 19 * 1024 * 1024;

export async function restaurarArchivo(form: FormData): Promise<ResultadoRestaurar> {
  return restaurar(async () => {
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Elegí el archivo de la copia (.db o .db.gz).");
    if (archivo.size > TAMANO_MAX) throw new Error("El archivo es demasiado grande para ser una copia de la app.");
    const datos = Buffer.from(await archivo.arrayBuffer());
    // Las copias de Google Drive vienen comprimidas (.gz).
    if (datos[0] === 0x1f && datos[1] === 0x8b) {
      const { gunzipSync } = await import("node:zlib");
      try {
        return gunzipSync(datos);
      } catch {
        throw new Error("El archivo comprimido está dañado.");
      }
    }
    return datos;
  });
}
