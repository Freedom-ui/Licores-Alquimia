// Migraciones de la base sin la CLI de Prisma. Solo servidor.
//
// En la PC del cliente no hay Node, npm ni `prisma migrate`: la app aplica sola
// las migraciones pendientes al arrancar (instrumentation.ts). Lee las mismas
// carpetas de prisma/migrations y las anota en `_prisma_migrations` con el
// formato de Prisma (checksum = SHA-256 del migration.sql), así en desarrollo
// `prisma migrate deploy` sigue viendo la base al día.
//
// Cada migración corre en una transacción con las claves foráneas apagadas (las
// migraciones de SQLite de Prisma recrean tablas) y se revisa la integridad
// referencial antes de confirmarla: si algo falla, la base queda como estaba.

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const TABLA = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

/** La base tiene migraciones que esta versión de la app no conoce (viene de una versión más nueva). */
export class BaseMasNueva extends Error {
  constructor(readonly desconocidas: string[]) {
    super(
      "Estos datos son de una versión más nueva de Licores Alquimia. Actualizá la app para poder abrirlos " +
        `(migraciones desconocidas: ${desconocidas.join(", ")}).`
    );
  }
}

export type Migracion = { nombre: string; sql: string; checksum: string };

/** Migraciones de la carpeta, en orden (cada una es una subcarpeta con migration.sql). */
export function leerMigraciones(carpeta: string): Migracion[] {
  return readdirSync(carpeta, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(carpeta, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort()
    .map((nombre) => {
      const contenido = readFileSync(path.join(carpeta, nombre, "migration.sql"));
      return { nombre, sql: contenido.toString("utf8"), checksum: createHash("sha256").update(contenido).digest("hex") };
    });
}

/** Nombres de las migraciones ya aplicadas (vacío si la base es nueva o no es de la app). */
export function migracionesAplicadas(db: Database.Database): string[] {
  const hay = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'").get();
  if (!hay) return [];
  return (
    db
      .prepare("SELECT migration_name AS nombre FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
      .all() as { nombre: string }[]
  ).map((f) => f.nombre);
}

/** Las aplicadas que no están en la carpeta: si hay, la base es de una versión más nueva. */
export function migracionesDesconocidas(db: Database.Database, migraciones: Migracion[]): string[] {
  const conocidas = new Set(migraciones.map((m) => m.nombre));
  return migracionesAplicadas(db).filter((n) => !conocidas.has(n));
}

export type ResultadoMigracion = { aplicadas: string[]; baseNueva: boolean };

/**
 * Aplica las migraciones pendientes de `carpeta` a la base `archivo` (la crea si
 * no existe). `antesDeAplicar` corre una sola vez, solo si hay pendientes en una
 * base que ya tenía datos (para hacer una copia de seguridad antes).
 */
export function migrar(
  archivo: string,
  carpeta: string,
  opciones: { antesDeAplicar?: (pendientes: string[]) => void } = {}
): ResultadoMigracion {
  mkdirSync(path.dirname(archivo), { recursive: true });
  const migraciones = leerMigraciones(carpeta);
  const db = new Database(archivo);
  try {
    const desconocidas = migracionesDesconocidas(db, migraciones);
    if (desconocidas.length) throw new BaseMasNueva(desconocidas);

    const fallida = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'")
      .get()
      ? db.prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL").get()
      : undefined;
    if (fallida) throw new Error(`Hay una actualización de la base que quedó a medias (${(fallida as { migration_name: string }).migration_name}).`);

    const hechas = new Set(migracionesAplicadas(db));
    const pendientes = migraciones.filter((m) => !hechas.has(m.nombre));
    const baseNueva = hechas.size === 0;
    if (!pendientes.length) return { aplicadas: [], baseNueva };
    if (!baseNueva) opciones.antesDeAplicar?.(pendientes.map((m) => m.nombre));

    db.exec(TABLA);
    const anotar = db.prepare(
      "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)"
    );
    for (const m of pendientes) {
      const inicio = Date.now();
      db.pragma("foreign_keys = OFF");
      try {
        db.transaction(() => {
          db.exec(m.sql);
          const rotas = db.pragma("foreign_key_check") as unknown[];
          if (rotas.length) throw new Error(`La migración ${m.nombre} deja ${rotas.length} referencias rotas.`);
          anotar.run(randomUUID(), m.checksum, Date.now(), m.nombre, inicio);
        })();
      } finally {
        db.pragma("foreign_keys = ON");
      }
    }
    return { aplicadas: pendientes.map((m) => m.nombre), baseNueva };
  } finally {
    db.close();
  }
}
