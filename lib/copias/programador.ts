// Copias automáticas. Solo servidor.
//
// - Al arrancar la app y después cada hora: si todavía no hay copia automática
//   del día, se hace una (y se rotan las viejas).
// - Al cerrar la app de escritorio: una copia más si hubo cambios desde la última.
// - Después de cada copia (y en cada vuelta, por si antes no había internet) se
//   suben a Google Drive las que falten.
// Todo pasa en fila (nunca dos copias o subidas a la vez).

import { readFileSync } from "node:fs";
import { hacerCopia, hayCambiosSinCopia, listarCopias, rotarCopias } from "./local";
import { sincronizarDrive } from "./drive";

const HORA = 3_600_000;

const g = globalThis as unknown as { alquimiaCopias?: { fila: Promise<unknown>; iniciado: boolean } };
const estado = (g.alquimiaCopias ??= { fila: Promise.resolve(), iniciado: false });

/** Corre `tarea` cuando terminan las anteriores. */
export function enFila<T>(tarea: () => Promise<T> | T): Promise<T> {
  const r = estado.fila.then(tarea, tarea);
  estado.fila = r.catch(() => undefined);
  return r;
}

const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Sube a Drive lo que falte (los errores quedan anotados en drive.json y se muestran en Configuración). */
export async function subirPendientes(): Promise<void> {
  const locales = listarCopias().map((c) => ({ nombre: c.nombre, fecha: c.fecha, leer: () => readFileSync(c.ruta) }));
  await sincronizarDrive(locales).catch((e) => console.error("[copias] Google Drive:", e instanceof Error ? e.message : e));
}

/** Copia automática del día si falta + subida a Drive. */
export function vueltaDiaria(ahora = new Date()): Promise<void> {
  return enFila(async () => {
    try {
      const hoy = listarCopias().some((c) => c.motivo === "automatica" && mismoDia(c.fecha, ahora));
      if (!hoy) {
        hacerCopia("automatica", ahora);
        rotarCopias(ahora);
      }
    } catch (e) {
      console.error("[copias] Copia automática:", e instanceof Error ? e.message : e);
    }
    await subirPendientes();
  });
}

/** Al cerrar la app: copia si hubo cambios desde la última y la sube. */
export function copiaAlCerrar(): Promise<void> {
  return enFila(async () => {
    try {
      if (hayCambiosSinCopia()) {
        hacerCopia("automatica");
        rotarCopias();
      }
    } catch (e) {
      console.error("[copias] Copia al cerrar:", e instanceof Error ? e.message : e);
    }
    await subirPendientes();
  });
}

export function iniciarProgramador(): void {
  if (estado.iniciado) return;
  estado.iniciado = true;
  // Unos segundos después de arrancar, para no demorar la apertura.
  setTimeout(() => void vueltaDiaria(), 15_000).unref();
  setInterval(() => void vueltaDiaria(), HORA).unref();
}
