// Dónde viven los archivos de la app. Solo servidor.
//
// En la app de escritorio (Electron) todo va a la carpeta de datos del usuario
// que le pasa el proceso principal en ALQUIMIA_DATOS (Windows:
// %APPDATA%\Licores Alquimia; Mac: ~/Library/Application Support/Licores
// Alquimia). En desarrollo, a la carpeta del proyecto, como siempre (dev.db y
// respaldos/). Todas las rutas se arman con path.join: nada propio de un
// sistema.

import path from "node:path";

const escritorio = () => Boolean(process.env.ALQUIMIA_DATOS);

// La carpeta de trabajo, oculta al análisis del build: si Next ve rutas armadas
// con process.cwd() que después se leen con fs, mete todo el proyecto en el
// servidor empaquetado (con copias de la base incluidas). Con `new Function` ni
// el análisis ni el minificador pueden saber qué devuelve.
const cwd = new Function("return process.cwd()") as () => string;

/** Carpeta de datos: la base, las copias y la conexión con Google Drive. */
export function carpetaDatos(): string {
  return process.env.ALQUIMIA_DATOS || cwd();
}

/** Archivo de la base, sacado de DATABASE_URL (`file:./dev.db` → relativo a la carpeta de trabajo). */
export function archivoBase(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  return path.resolve(cwd(), url.replace(/^file:/, ""));
}

/** Copias de seguridad: `copias/` en la app de escritorio, `respaldos/` en desarrollo. */
export function carpetaCopias(): string {
  return escritorio() ? path.join(carpetaDatos(), "copias") : path.join(cwd(), "respaldos");
}

/** Migraciones de Prisma: las que viajan con la app de escritorio o las del proyecto. */
export function carpetaMigraciones(): string {
  return process.env.ALQUIMIA_MIGRACIONES || path.join(cwd(), "prisma", "migrations");
}

/** Base elegida para restaurar: reemplaza a la actual en el próximo arranque del servidor. */
export function archivoRestauracionPendiente(): string {
  return path.join(carpetaDatos(), "restaurar-pendiente.db");
}

/** Conexión con Google Drive (fuera de la base: restaurar no la pisa y las copias no llevan el token). */
export function archivoDrive(): string {
  return path.join(carpetaDatos(), "drive.json");
}
