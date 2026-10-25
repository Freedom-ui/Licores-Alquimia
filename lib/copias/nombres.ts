// Nombres de las copias de seguridad y qué copias se conservan. Puro (sin
// archivos ni base): lo usan las copias locales y las de Google Drive.
//
// Nombre: alquimia-AAAA-MM-DD-HHMMSS-<motivo>.db (en Drive, con .gz al final).
// La fecha es la hora local de la PC: así la ve el usuario.

export const MOTIVOS = ["automatica", "manual", "antes-de-importar", "antes-de-restaurar", "antes-de-actualizar"] as const;
export type Motivo = (typeof MOTIVOS)[number];

export const MOTIVO_TEXTO: Record<Motivo, string> = {
  automatica: "Automática",
  manual: "Manual",
  "antes-de-importar": "Antes de importar una planilla",
  "antes-de-restaurar": "Antes de restaurar",
  "antes-de-actualizar": "Antes de actualizar la app",
};

export type InfoCopia = { nombre: string; fecha: Date; motivo: Motivo };

const dos = (n: number) => String(n).padStart(2, "0");

export function nombreCopia(fecha: Date, motivo: Motivo): string {
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  const hora = `${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`;
  return `alquimia-${dia}-${hora}-${motivo}.db`;
}

const PATRON = /^alquimia-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})-([a-z-]+)\.db(\.gz)?$/;

/** Lee fecha y motivo del nombre; null si no es una copia de la app (esos archivos no se tocan). */
export function leerNombre(nombre: string): InfoCopia | null {
  const m = PATRON.exec(nombre);
  if (!m || !(MOTIVOS as readonly string[]).includes(m[7])) return null;
  const [a, mes, d, h, min, s] = m.slice(1, 7).map(Number);
  const fecha = new Date(a, mes - 1, d, h, min, s);
  if (fecha.getMonth() !== mes - 1 || fecha.getDate() !== d) return null;
  return { nombre, fecha, motivo: m[7] as Motivo };
}

export const DIAS_TODAS = 2;
export const DIAS_DIARIAS = 30;
export const MESES_MENSUALES = 24;
export const DIAS_OTRAS = 60;

const DIA = 86_400_000;
const claveDia = (f: Date) => `${f.getFullYear()}-${f.getMonth()}-${f.getDate()}`;
const claveMes = (f: Date) => `${f.getFullYear()}-${f.getMonth()}`;

/**
 * Qué copias borrar. Se conservan:
 * - todas las de los últimos 2 días;
 * - automáticas y manuales: la última de cada día de los últimos 30 días y la
 *   última de cada mes de los últimos 24 meses;
 * - las de antes de importar / restaurar / actualizar: 60 días;
 * - siempre la más nueva de todas, aunque sea vieja.
 */
export function copiasABorrar<T extends InfoCopia>(copias: T[], ahora: Date): T[] {
  const ordenadas = [...copias].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const dias = new Set<string>();
  const meses = new Set<string>();
  const limiteMeses = new Date(ahora.getFullYear(), ahora.getMonth() - MESES_MENSUALES + 1, 1);
  const borrar: T[] = [];
  ordenadas.forEach((c, i) => {
    const edad = ahora.getTime() - c.fecha.getTime();
    let conservar = i === 0 || edad <= DIAS_TODAS * DIA;
    if (c.motivo === "automatica" || c.motivo === "manual") {
      // La primera que aparece de cada día / mes es la más nueva (están ordenadas).
      if (edad <= DIAS_DIARIAS * DIA && !dias.has(claveDia(c.fecha))) conservar = true;
      if (c.fecha >= limiteMeses && !meses.has(claveMes(c.fecha))) conservar = true;
      dias.add(claveDia(c.fecha));
      meses.add(claveMes(c.fecha));
    } else if (edad <= DIAS_OTRAS * DIA) {
      conservar = true;
    }
    if (!conservar) borrar.push(c);
  });
  return borrar;
}
