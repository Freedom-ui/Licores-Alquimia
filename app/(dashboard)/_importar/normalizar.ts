// Conversión de valores de la planilla al formato de la app y comparación de
// textos. Puro (sin xlsx): lo usan el navegador, el servidor y los tests.

import { claveTexto } from "@/app/components/data-table/validacion";
import type { UnidadMedida } from "../materia-prima/data";
import type { Valor } from "./tipos";

/** Clave para comparar encabezados y títulos: sin tildes, mayúsculas ni signos ("Nº DE OP." → "n de op"). */
export function claveEnc(v: unknown): string {
  return claveTexto(typeof v === "string" ? v : v === null || v === undefined ? "" : String(v))
    .replace(/[º°ª]/g, "")
    .replace(/[^a-z0-9%$]+/g, " ")
    .trim();
}

export function aTexto(v: Valor | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  return v.trim().replace(/\s+/g, " ");
}

/**
 * Número de una celda: los numéricos pasan tal cual; los textos aceptan "$",
 * separador de miles y coma o punto decimal ("$ 10,000.00", "10.000,50",
 * "16,2"). Vacío o "-" → null; lo que no es un número → NaN.
 */
export function aNumero(v: Valor | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let t = v.replace(/[$\s]/g, "").replace(/^\+/, "");
  if (!t || t === "-") return null;
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    // El último separador es el decimal.
    t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) && t.split(",").length > 2 ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (punto >= 0 && /^-?\d{1,3}(\.\d{3}){2,}$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

function fechaValida(y: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${y}-${dosDigitos(m)}-${dosDigitos(d)}`;
}

/**
 * Fecha "YYYY-MM-DD" de una celda: las celdas de fecha ya llegan así; un
 * número se toma como fecha serial de Excel; un texto "dd/mm/aaaa" (o
 * "d/m/aa") se lee como día/mes, salvo que el segundo número no pueda ser un
 * mes. Vacío → "". Lo que no es una fecha se devuelve tal cual (la regla de
 * la app lo marca como inválido).
 */
export function aFecha(v: Valor | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return String(v);
    const f = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return `${f.getUTCFullYear()}-${dosDigitos(f.getUTCMonth() + 1)}-${dosDigitos(f.getUTCDate())}`;
  }
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return t;
  let [a, b] = [Number(m[1]), Number(m[2])];
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (b > 12 && a <= 12) [a, b] = [b, a];
  return fechaValida(y, b, a) ?? t;
}

export const esFecha = (v: Valor) => /^\d{4}-\d{2}-\d{2}$/.test(aFecha(v));
export const esNumero = (v: Valor) => {
  const n = aNumero(v);
  return n !== null && !Number.isNaN(n);
};
export const esCuit = (v: Valor) => aTexto(v).replace(/\D/g, "").length === 11;
/** Celda marcada con una cruz (columnas de medio de pago, "REC. X"). */
export const esMarca = (v: Valor) => v !== null && /^(x|si|sí|1|✓|✔)$/i.test(aTexto(v));

/** Redondeo a 2 decimales (el máximo que admiten montos y cantidades en la app). */
export const a2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Similitud de textos ─────────────────────────────────────────────────────

function bigramas(s: string): Map<string, number> {
  const t = ` ${s} `;
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

/** Parecido entre dos textos, de 0 a 1 (coeficiente de Dice sobre pares de letras, sin tildes ni signos). */
export function similitud(a: string, b: string): number {
  const x = claveEnc(a);
  const y = claveEnc(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigramas(x);
  const by = bigramas(y);
  let comunes = 0;
  for (const [k, n] of bx) comunes += Math.min(n, by.get(k) ?? 0);
  const total = [...bx.values()].reduce((s, n) => s + n, 0) + [...by.values()].reduce((s, n) => s + n, 0);
  return (2 * comunes) / total;
}

/** A partir de qué parecido se toma un nombre como el mismo (con aviso). */
export const PARECIDO_MINIMO = 0.82;

/**
 * Busca un texto en una lista de opciones: primero igual (sin tildes ni
 * mayúsculas), después el más parecido si pasa el mínimo.
 */
export function buscarParecido<T>(
  texto: string,
  opciones: T[],
  claves: (o: T) => string[]
): { valor: T; exacto: boolean; parecido: number } | null {
  const k = claveEnc(texto);
  if (!k) return null;
  for (const o of opciones) if (claves(o).some((c) => claveEnc(c) === k)) return { valor: o, exacto: true, parecido: 1 };
  let mejor: { valor: T; exacto: boolean; parecido: number } | null = null;
  for (const o of opciones) {
    for (const c of claves(o)) {
      const p = similitud(texto, c);
      if (p >= PARECIDO_MINIMO && (!mejor || p > mejor.parecido)) mejor = { valor: o, exacto: false, parecido: p };
    }
  }
  return mejor;
}

// ── Valores de listas cerradas ──────────────────────────────────────────────

/** Elige la opción de la app que corresponde a un valor de la planilla ("x MENOR" → "Menor", "RI" → "R. Inscripto"). */
export function opcionDe(v: Valor, opciones: readonly string[], sinonimos: Record<string, string> = {}): string {
  const k = claveEnc(aTexto(v)).replace(/^x /, "");
  if (!k) return "";
  if (sinonimos[k]) return sinonimos[k];
  return opciones.find((o) => claveEnc(o) === k) ?? aTexto(v);
}

export const SINONIMOS_IVA: Record<string, string> = {
  ri: "R. Inscripto",
  "r i": "R. Inscripto",
  "resp inscripto": "R. Inscripto",
  "responsable inscripto": "R. Inscripto",
  inscripto: "R. Inscripto",
  mono: "Monotributo",
  mt: "Monotributo",
  monotributista: "Monotributo",
  ex: "Exento",
  exento: "Exento",
  cf: "Consumidor Final",
  "c f": "Consumidor Final",
  "cons final": "Consumidor Final",
  "consumidor final": "Consumidor Final",
};

export const SINONIMOS_CONDICION: Record<string, string> = {
  credito: "Crédito",
  "cta cte": "Crédito",
  "cuenta corriente": "Crédito",
  consignacion: "Consignación",
  contado: "Contado",
};

export const SINONIMOS_CANAL: Record<string, string> = {
  menor: "Menor",
  minorista: "Menor",
  mayor: "Mayor",
  mayorista: "Mayor",
};

export const SINONIMOS_MEDIO_PAGO: Record<string, string> = {
  mpr: "MPR",
  mpa: "MPA",
  cdni: "CDNI",
  "cuenta dni": "CDNI",
  efe: "EFE",
  efectivo: "EFE",
};

// ── Unidades de materia prima ───────────────────────────────────────────────

/** Unidad probable según el nombre (la planilla no la trae): el usuario la puede corregir. */
export function inferirUnidad(nombre: string): UnidadMedida {
  const k = claveEnc(nombre);
  if (/\b(alcohol|esencia|jarabe|agua|vodka|grappa|licor base)\b/.test(k)) return "Litros";
  if (/\b(cinta|hilo|film|rafia)\b/.test(k)) return "Metros";
  if (/\b(env|envase|botella|bidon|tapa|tapon|corcho|precinto|precintos|etiq|etiqueta|etiquetas|caja|cajas|bolsa|bolsas|frasco|sticker)\b/.test(k)) {
    return "Unidades";
  }
  return "Kilogramos";
}
