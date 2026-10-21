// Validadores básicos por tipo de dato. Puros (sin React ni base): los usan
// los formularios para avisar al salir de cada campo y el servidor
// (_dominio/reglas.ts → _dominio/acciones.ts) para revalidar todo lo que llega,
// venga o no de la pantalla. Mismo estilo que lib/auth/reglas.ts: cada
// validador devuelve el texto del error o null, y normalizar va aparte.

/** Texto de error (qué está mal y cómo corregirlo) o null si está bien. */
export type Validacion = string | null;

/** Errores por campo (clave = nombre del campo; en líneas, "insumos.<n°>.<campo>"). */
export type Errores = Record<string, string>;
/** Valor limpio y tipado si todo está bien, o los errores por campo. */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; errores: Errores };

/** Fecha más antigua que se puede cargar en cualquier campo. */
export const FECHA_MINIMA = "2020-01-01";
/** Años hacia adelante que se aceptan para un vencimiento. */
export const ANIOS_MAX_VENCIMIENTO = 15;
/** Tope de cualquier monto (precios, costos). */
export const MONTO_MAX = 100_000_000;
/** Tope de cualquier cantidad (botellas, litros, kilos, unidades). */
export const CANTIDAD_MAX = 1_000_000;
/** Decimales admitidos en montos y cantidades (igual al redondeo de los cálculos). */
export const DECIMALES = 2;

export const LARGO_NOMBRE = 100;
export const LARGO_DOMICILIO = 150;
export const LARGO_CORTO = 30;
export const LARGO_RESPONSABLE = 60;
export const LARGO_EMAIL = 100;
export const LARGO_CODIGO_BARRAS = 40;

// ── Textos ──────────────────────────────────────────────────────────────────

/** Recorta y colapsa los espacios repetidos. Cualquier cosa que no sea texto queda "". */
export function normalizarTexto(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
}

/** Para comparar duplicados: sin mayúsculas, tildes ni espacios de más. */
export function claveTexto(v: string): string {
  return normalizarTexto(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** `que` va con artículo, ej. "la razón social". */
export function validarTexto(v: string, op: { que: string; requerido?: boolean; max: number }): Validacion {
  const t = normalizarTexto(v);
  if (!t) return op.requerido ? `Completá ${op.que}.` : null;
  if (t.length > op.max) return `Puede tener hasta ${op.max} caracteres (tiene ${t.length}).`;
  return null;
}

/** Valor de una lista cerrada (los <select>). */
export function validarOpcion(v: string, opciones: readonly string[], que: string): Validacion {
  if (!v) return `Elegí ${que}.`;
  return opciones.includes(v) ? null : `Elegí ${que} de la lista.`;
}

// ── Números ─────────────────────────────────────────────────────────────────

const NUMERO_RE = /^-?\d+([.,]\d+)?$/;

/**
 * Lee un número escrito por el usuario (acepta coma o punto decimal, sin
 * separador de miles). Vacío → null. Lo que no es un número → NaN.
 */
export function parsearNumero(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  const t = raw.trim();
  if (!t) return null;
  return NUMERO_RE.test(t) ? Number(t.replace(",", ".")) : NaN;
}

const formatoNumero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: DECIMALES });
export const fmtNumero = (n: number) => formatoNumero.format(n);

/**
 * Número guardado → texto para cargar en un campo del formulario: coma
 * decimal como en el resto de la app, sin separador de miles (que
 * `parsearNumero` no acepta). Vacío si no hay valor.
 */
export function numeroATexto(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return String(n).replace(".", ",");
}

export type ReglaNumero = {
  /** Con artículo, ej. "una cantidad", "el costo unitario". */
  que: string;
  /** Ejemplo válido para el mensaje, ej. "12". */
  ejemplo: string;
  requerido?: boolean;
  entero?: boolean;
  /** true: tiene que ser > 0. false: admite 0 (nunca negativos). */
  positivo?: boolean;
  max?: number;
};

export function validarNumero(n: number | null, r: ReglaNumero): Validacion {
  if (n === null) return r.requerido ? `Ingresá ${r.que}, por ejemplo ${r.ejemplo}.` : null;
  if (Number.isNaN(n)) return `Ingresá solo números (con coma o punto para los decimales), por ejemplo ${r.ejemplo}.`;
  if (n < 0) return `No puede ser negativo: ingresá ${r.que} mayor ${r.positivo ? "a 0" : "o igual a 0"}, por ejemplo ${r.ejemplo}.`;
  if (r.positivo && n === 0) return `Ingresá ${r.que} mayor a 0, por ejemplo ${r.ejemplo}.`;
  if (r.entero && !Number.isInteger(n)) return `Tiene que ser un número entero, sin decimales, por ejemplo ${r.ejemplo}.`;
  const escala = 10 ** DECIMALES;
  if (Math.abs(Math.round(n * escala) - n * escala) > 1e-6) {
    return `Usá hasta ${DECIMALES} decimales, por ejemplo ${r.ejemplo}.`;
  }
  if (r.max !== undefined && n > r.max) return `Es demasiado grande: el máximo es ${fmtNumero(r.max)}.`;
  return null;
}

export const reglaMonto = (que: string, ejemplo = "1500,50"): ReglaNumero => ({
  que,
  ejemplo,
  requerido: true,
  positivo: true,
  max: MONTO_MAX,
});

export const reglaCantidad = (que: string, entero: boolean): ReglaNumero => ({
  que,
  ejemplo: entero ? "12" : "2,5",
  requerido: true,
  positivo: true,
  entero,
  max: CANTIDAD_MAX,
});

/**
 * Filtro para inputs numéricos de texto: deja solo dígitos y (si se admiten
 * decimales) un separador, así no se pueden escribir letras ni signos.
 */
export function filtrarNumero(raw: string, decimales: boolean): string {
  let limpio = raw.replace(decimales ? /[^\d.,]/g : /\D/g, "");
  if (decimales) {
    const i = limpio.search(/[.,]/);
    if (i >= 0) limpio = limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/[.,]/g, "");
  }
  return limpio;
}

// ── Fechas ──────────────────────────────────────────────────────────────────
// Se guardan como "YYYY-MM-DD"; en pantalla se escriben y se ven como
// dd/mm/aaaa (CampoFecha), sin depender del idioma del navegador.

function aTexto(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Hoy en la hora local de la PC (no UTC: a la noche serían mañana). */
export function hoyLocal(): string {
  return aTexto(new Date());
}

export function fechaMaximaVencimiento(): string {
  return `${new Date().getFullYear() + ANIOS_MAX_VENCIMIENTO}-12-31`;
}

/** Fecha real con año de 4 cifras (descarta 2026-02-30, 8276847-01-01, etc.). */
export function esFechaReal(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

export function fmtFecha(v: string): string {
  const [a, m, d] = v.split("-");
  return `${d}/${m}/${a}`;
}

export const FECHA_INVALIDA = "La fecha no es válida: completá día, mes y año (dd/mm/aaaa), por ejemplo 15/03/2026.";

/** "YYYY-MM-DD" → "dd/mm/aaaa"; cualquier otra cosa (algo a medio escribir) queda igual. */
export function fechaATexto(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtFecha(v) : v;
}

/** Lo que se va escribiendo: solo números, con las barras puestas solas (dd/mm/aaaa). */
export function enmascararFecha(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * "dd/mm/aaaa" completo y real → "YYYY-MM-DD". Si está incompleto o no existe
 * (ej. 31/02/2026) devuelve el texto tal cual, para que validarFecha lo marque
 * como inválido en vez de confundirlo con un campo vacío.
 */
export function textoAFecha(texto: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return texto;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return esFechaReal(iso) ? iso : texto;
}

/**
 * Por defecto entre FECHA_MINIMA y hoy. `max: null` saca el tope superior
 * (el vencimiento usa su propio máximo).
 */
export function validarFecha(
  v: unknown,
  op: { que: string; requerido?: boolean; min?: string; max?: string | null }
): Validacion {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return op.requerido ? `Ingresá ${op.que} (dd/mm/aaaa), por ejemplo 15/03/2026.` : null;
  if (!esFechaReal(t)) return FECHA_INVALIDA;
  const min = op.min ?? FECHA_MINIMA;
  if (t < min) return `No puede ser anterior al ${fmtFecha(min)}.`;
  const hoy = hoyLocal();
  const max = op.max === undefined ? hoy : op.max;
  if (max && t > max) {
    return max === hoy ? `No puede ser una fecha futura (hoy es ${fmtFecha(hoy)}).` : `No puede ser posterior al ${fmtFecha(max)}.`;
  }
  return null;
}

// ── CUIT / CUIL ─────────────────────────────────────────────────────────────

const PREFIJOS_CUIT = ["20", "23", "24", "25", "26", "27", "30", "33", "34"];
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador de los primeros 10 números (null si no existe: ese CUIT no se emite). */
export function digitoVerificadorCuit(diez: string): number | null {
  const suma = PESOS_CUIT.reduce((s, p, i) => s + p * Number(diez[i]), 0);
  const dv = 11 - (suma % 11);
  if (dv === 11) return 0;
  return dv === 10 ? null : dv;
}

/** Se puede escribir con o sin guiones/espacios; se guarda como 30-71234567-8. */
export function normalizarCuit(v: unknown): string {
  const t = normalizarTexto(v);
  const d = t.replace(/[\s.-]/g, "");
  return /^\d{11}$/.test(d) ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : t;
}

export function validarCuit(v: unknown, op: { requerido?: boolean; que?: string } = {}): Validacion {
  const t = normalizarTexto(v);
  if (!t) return op.requerido ? `Ingresá ${op.que ?? "el CUIT"}, por ejemplo 30-71234567-8.` : null;
  const d = t.replace(/[\s.-]/g, "");
  if (!/^\d+$/.test(d)) return "Usá solo números y guiones, por ejemplo 30-71234567-8.";
  if (d.length !== 11) return `Tiene que tener 11 números (tiene ${d.length}), por ejemplo 30-71234567-8.`;
  if (!PREFIJOS_CUIT.includes(d.slice(0, 2))) {
    return "Los dos primeros números tienen que ser 20, 23, 24, 27, 30, 33 o 34 (según sea persona o empresa).";
  }
  if (digitoVerificadorCuit(d.slice(0, 10)) !== Number(d[10])) {
    return "No es un CUIT válido: el último número (dígito verificador) no coincide. Revisá que esté bien copiado.";
  }
  return null;
}

// ── Contacto ────────────────────────────────────────────────────────────────

export function validarEmail(v: unknown, op: { requerido?: boolean } = {}): Validacion {
  const t = normalizarTexto(v);
  if (!t) return op.requerido ? "Ingresá el email, por ejemplo nombre@empresa.com." : null;
  if (t.length > LARGO_EMAIL) return `Puede tener hasta ${LARGO_EMAIL} caracteres.`;
  return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(t) ? null : "El email no es válido: revisalo, por ejemplo nombre@empresa.com.";
}

export function validarTelefono(v: unknown, op: { requerido?: boolean } = {}): Validacion {
  const t = normalizarTexto(v);
  if (!t) return op.requerido ? "Ingresá el teléfono, por ejemplo 223 519 9971." : null;
  if (!/^[\d\s()+-]+$/.test(t)) return "Usá solo números, espacios, guiones, paréntesis o +, por ejemplo 223 519 9971.";
  const digitos = t.replace(/\D/g, "").length;
  if (digitos < 8 || digitos > 15) {
    return `Un teléfono tiene entre 8 y 15 números contando la característica (tiene ${digitos}), por ejemplo 223 519 9971.`;
  }
  return null;
}

// ── Datos bancarios ─────────────────────────────────────────────────────────

export function normalizarCbu(v: unknown): string {
  const t = normalizarTexto(v);
  const d = t.replace(/[\s-]/g, "");
  return /^\d+$/.test(d) ? d : t;
}

/** Dígito verificador de un bloque del CBU (lo usa también el generador de datos de prueba). */
export function verificadorCbu(digitos: string, pesos: number[]): number {
  const suma = pesos.reduce((s, p, i) => s + p * Number(digitos[i]), 0);
  return (10 - (suma % 10)) % 10;
}

export function validarCbu(v: unknown): Validacion {
  const d = normalizarCbu(v);
  if (!d) return null;
  if (!/^\d+$/.test(d)) return "Usá solo números (22 en total).";
  if (d.length !== 22) return `El CBU tiene 22 números (tiene ${d.length}).`;
  const bloque1 = verificadorCbu(d.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]) === Number(d[7]);
  const bloque2 = verificadorCbu(d.slice(8, 21), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === Number(d[21]);
  return bloque1 && bloque2 ? null : "No es un CBU válido: los dígitos verificadores no coinciden. Revisá que esté bien copiado.";
}

export function validarAlias(v: unknown): Validacion {
  const t = normalizarTexto(v);
  if (!t) return null;
  if (t.length < 6 || t.length > 20) return `El alias tiene entre 6 y 20 caracteres (tiene ${t.length}).`;
  return /^[A-Za-z0-9.-]+$/.test(t) ? null : "Usá solo letras sin tilde, números, punto o guion, por ejemplo mi.alias.mp";
}

// ── Código de barras (CODE39, el que imprime JsBarcode) ─────────────────────

export function normalizarCodigoBarras(v: unknown): string {
  return normalizarTexto(v).toUpperCase();
}

export function validarCodigoBarras(v: unknown): Validacion {
  const t = normalizarCodigoBarras(v);
  if (!t) return "Ingresá el código de barras, por ejemplo 2611122201TRA.";
  if (t.length > LARGO_CODIGO_BARRAS) return `Puede tener hasta ${LARGO_CODIGO_BARRAS} caracteres (tiene ${t.length}).`;
  return /^[A-Z0-9 .$/+%-]+$/.test(t)
    ? null
    : "Usá solo letras sin tilde, números, espacio o los signos - . $ / + % (lo que admite el código CODE39).";
}
