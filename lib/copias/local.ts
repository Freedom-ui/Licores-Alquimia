// Copias de seguridad en la PC y restauración. Solo servidor.
//
// La copia se hace con `VACUUM INTO` desde una conexión propia de solo lectura
// (es consistente aunque la app esté guardando algo en ese momento), se escribe
// primero con otro nombre y solo queda como copia si pasa `PRAGMA
// integrity_check`: un archivo con nombre de copia siempre está verificado.
//
// Restaurar no pisa la base en uso (en Windows no se puede reemplazar un archivo
// abierto): deja la copia elegida como `restaurar-pendiente.db` y la app se
// reinicia; al arrancar, `aplicarRestauracionPendiente` la pone en su lugar
// antes de abrir la base (ver lib/arranque.ts).

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { archivoBase, archivoRestauracionPendiente, carpetaCopias, carpetaMigraciones } from "@/lib/datos/rutas";
import { leerMigraciones, migracionesDesconocidas } from "@/lib/datos/migrar";
import { copiasABorrar, leerNombre, nombreCopia, type InfoCopia, type Motivo } from "./nombres";

export type CopiaLocal = InfoCopia & { tamano: number; ruta: string };

const comillas = (ruta: string) => `'${ruta.replace(/\\/g, "/").replace(/'/g, "''")}'`;

/** Copias de la carpeta, de la más nueva a la más vieja (los archivos con otro nombre se ignoran). */
export function listarCopias(): CopiaLocal[] {
  const carpeta = carpetaCopias();
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta)
    .map((nombre) => {
      const info = leerNombre(nombre);
      if (!info || nombre.endsWith(".gz")) return null;
      const ruta = path.join(carpeta, nombre);
      return { ...info, ruta, tamano: statSync(ruta).size };
    })
    .filter((c): c is CopiaLocal => c !== null)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

export function buscarCopia(nombre: string): CopiaLocal | undefined {
  return listarCopias().find((c) => c.nombre === nombre);
}

export type Verificacion = { ok: true } | { ok: false; motivo: string };

/** Que el archivo sea una base de Licores Alquimia sana y que esta versión de la app la pueda abrir. */
export function verificarBase(archivo: string): Verificacion {
  let db: Database.Database | undefined;
  try {
    db = new Database(archivo, { readonly: true, fileMustExist: true });
    const integridad = db.pragma("integrity_check", { simple: true });
    if (integridad !== "ok") return { ok: false, motivo: "El archivo está dañado (no pasa la verificación de integridad)." };
    const tablas = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name));
    if (!tablas.has("_prisma_migrations") || !tablas.has("Usuario") || !tablas.has("Operacion")) {
      return { ok: false, motivo: "El archivo no es una copia de Licores Alquimia." };
    }
    const desconocidas = migracionesDesconocidas(db, leerMigraciones(carpetaMigraciones()));
    if (desconocidas.length) {
      return { ok: false, motivo: "La copia es de una versión más nueva de Licores Alquimia: actualizá la app antes de restaurarla." };
    }
    return { ok: true };
  } catch {
    return { ok: false, motivo: "El archivo no es una copia de Licores Alquimia o está dañado." };
  } finally {
    db?.close();
  }
}

/** Hace una copia verificada de la base. Tira un error con mensaje para el usuario si no se pudo. */
export function hacerCopia(motivo: Motivo, ahora = new Date()): CopiaLocal {
  const carpeta = carpetaCopias();
  mkdirSync(carpeta, { recursive: true });
  let nombre = nombreCopia(ahora, motivo);
  // Dos copias en el mismo segundo (ej. "antes de importar" justo después de una manual).
  for (let s = 1; existsSync(path.join(carpeta, nombre)); s++) nombre = nombreCopia(new Date(ahora.getTime() + s * 1000), motivo);
  const destino = path.join(carpeta, nombre);
  const parcial = `${destino}.parcial`;
  rmSync(parcial, { force: true });

  const db = new Database(archivoBase(), { readonly: true, fileMustExist: true, timeout: 15_000 });
  try {
    db.exec(`VACUUM INTO ${comillas(parcial)}`);
  } finally {
    db.close();
  }
  const v = verificarBase(parcial);
  if (!v.ok) {
    rmSync(parcial, { force: true });
    throw new Error(`La copia de seguridad salió mal: ${v.motivo}`);
  }
  renameSync(parcial, destino);
  const info = leerNombre(nombre)!;
  return { ...info, ruta: destino, tamano: statSync(destino).size };
}

/** Borra las copias que ya no hace falta conservar (ver copiasABorrar). Devuelve sus nombres. */
export function rotarCopias(ahora = new Date()): string[] {
  const borrar = copiasABorrar(listarCopias(), ahora);
  for (const c of borrar) rmSync(c.ruta, { force: true });
  return borrar.map((c) => c.nombre);
}

/** Última modificación de la base (incluye el diario de escritura si lo hay). */
export function ultimoCambioBase(): Date {
  const base = archivoBase();
  // turbopackIgnore: ruta dinámica (sin la marca, el build mete todo el proyecto en el servidor empaquetado).
  const fechas = [base, `${base}-wal`, `${base}-journal`]
    .filter((a) => existsSync(/*turbopackIgnore: true*/ a))
    .map((a) => statSync(/*turbopackIgnore: true*/ a).mtimeMs);
  return new Date(Math.max(0, ...fechas));
}

/** ¿Hubo cambios desde la última copia? (sin copias, sí). */
export function hayCambiosSinCopia(): boolean {
  const ultima = listarCopias()[0];
  return !ultima || ultimoCambioBase().getTime() > ultima.fecha.getTime() + 999;
}

/**
 * Deja `datos` (una base completa) lista para reemplazar a la actual en el
 * próximo arranque, después de verificarla y de copiar lo actual. Tira un error
 * con mensaje para el usuario si la copia no sirve.
 */
export function prepararRestauracion(datos: Buffer | string): void {
  const pendiente = archivoRestauracionPendiente();
  const parcial = `${pendiente}.parcial`;
  rmSync(parcial, { force: true });
  if (typeof datos === "string") {
    // Copia por SQLite (no por archivo) para no arrastrar un diario a medias.
    const db = new Database(datos, { readonly: true, fileMustExist: true });
    try {
      db.exec(`VACUUM INTO ${comillas(parcial)}`);
    } finally {
      db.close();
    }
  } else {
    writeFileSync(parcial, new Uint8Array(datos));
  }
  const v = verificarBase(parcial);
  if (!v.ok) {
    rmSync(parcial, { force: true });
    throw new Error(v.motivo);
  }
  hacerCopia("antes-de-restaurar");
  rmSync(pendiente, { force: true });
  renameSync(parcial, pendiente);
}

/** Si hay una restauración pendiente, la pone en lugar de la base. Llamar antes de abrir la base. */
export function aplicarRestauracionPendiente(): boolean {
  const pendiente = archivoRestauracionPendiente();
  if (!existsSync(pendiente)) return false;
  const base = archivoBase();
  for (const sufijo of ["-wal", "-shm", "-journal", ""]) rmSync(`${base}${sufijo}`, { force: true });
  mkdirSync(path.dirname(base), { recursive: true });
  renameSync(pendiente, base);
  return true;
}
