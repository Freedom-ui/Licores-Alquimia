// Detección automática: qué bloques tiene cada hoja y a qué sección
// corresponde cada uno. Puro (trabaja sobre las grillas de leer.ts).
//
// 1. Bloques: la planilla Alquimia pone varias tablas lado a lado; cada una
//    empieza con una celda "Pagina Principal" (el link al índice) y el título
//    al lado. Una hoja sin esa marca (ej. la plantilla limpia) es un solo bloque
//    con el nombre de la hoja como título.
// 2. Encabezado: se prueban varias formas (dos filas bajo el título, una
//    fila, o el título mismo como encabezado) y se queda la que mejor encaja.
// 3. Puntaje por sección: columnas reconocidas por sus sinónimos (pesadas por
//    importancia y controlando que los datos sean del tipo esperado) + bonus si
//    el título lo dice. Alto → se asigna solo; medio → se asigna pero se pide
//    revisar; bajo → no se importa.

import { SECCIONES, type CampoDef, type SeccionDef } from "./secciones";
import { aTexto, claveEnc, esCuit, esFecha, esMarca, esNumero } from "./normalizar";
import type { Bloque, Columna, Deteccion, Hoja, SeccionId, Valor } from "./tipos";

export const UMBRAL_ALTO = 0.75;
export const UMBRAL_MEDIO = 0.5;

export const celda = (h: Hoja, r: number, c: number): Valor => h.filas[r]?.[c] ?? null;

/** "A", "B", …, "Z", "AA"… (0-based). */
export function letraColumna(n: number): string {
  let s = "";
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** Hojas de cálculos auxiliares (en la planilla se llaman ".", "..", "-"): no tienen datos propios. */
export const esHojaAuxiliar = (nombre: string) => !/[a-z0-9áéíóúñ]/i.test(nombre);

function ultimaColumna(h: Hoja): number {
  let max = -1;
  for (const f of h.filas) if (f) max = Math.max(max, f.length - 1);
  return max;
}

// ── Bloques ─────────────────────────────────────────────────────────────────

const FILAS_BUSQUEDA_MARCA = 10;

export function detectarBloques(h: Hoja): Bloque[] {
  const marcas: { r: number; c: number }[] = [];
  for (let r = 0; r < Math.min(FILAS_BUSQUEDA_MARCA, h.filas.length); r++) {
    h.filas[r]?.forEach((v, c) => {
      if (claveEnc(v) === "pagina principal") marcas.push({ r, c });
    });
  }
  const maxCol = ultimaColumna(h);
  if (maxCol < 0) return [];
  if (marcas.length === 0) {
    return [{ id: `${h.nombre}!A1`, hoja: h.nombre, textos: [h.nombre], filaTitulo: -1, col0: 0, col1: maxCol }];
  }
  const bloques: Bloque[] = [];
  for (const m of marcas) {
    const siguiente = marcas.filter((x) => x.r === m.r && x.c > m.c).sort((a, b) => a.c - b.c)[0];
    const col0 = m.c + 1;
    const col1 = siguiente ? siguiente.c - 1 : maxCol;
    if (col1 < col0) continue;
    const textos: string[] = [];
    for (let c = col0; c <= col1; c++) {
      const v = celda(h, m.r, c);
      if (typeof v === "string") textos.push(aTexto(v));
    }
    bloques.push({ id: `${h.nombre}!${letraColumna(m.c)}${m.r + 1}`, hoja: h.nombre, textos, filaTitulo: m.r, col0, col1 });
  }
  return bloques;
}

export const tituloBloque = (b: Bloque) => b.textos.join(" ").replace(/\s+/g, " ").trim() || b.hoja;

/** Lo que sigue al título en un inventario: la materia prima o el producto ("INVENTARIO DE …: Alcohol" → "Alcohol"). */
export function subtitulo(b: Bloque): string {
  const t = tituloBloque(b);
  const i = t.indexOf(":");
  return i >= 0 ? t.slice(i + 1).trim() : b.textos.slice(1).join(" ").trim();
}

// ── Encabezados ─────────────────────────────────────────────────────────────

// Celda → esquina de su combinada, solo para las primeras filas (donde están
// los encabezados): la planilla tiene miles de celdas combinadas.
const FILAS_ENCABEZADO_MAX = 25;
const indices = new WeakMap<Hoja, Map<string, [number, number]>>();

function indiceCombinadas(h: Hoja): Map<string, [number, number]> {
  let m = indices.get(h);
  if (m) return m;
  m = new Map();
  for (const x of h.combinadas) {
    for (let r = x.r0; r <= Math.min(x.r1, FILAS_ENCABEZADO_MAX); r++) {
      for (let c = x.c0; c <= x.c1; c++) if (r !== x.r0 || c !== x.c0) m.set(`${r},${c}`, [x.r0, x.c0]);
    }
  }
  indices.set(h, m);
  return m;
}

/** Texto de una celda de encabezado (si está dentro de una combinada, el de su esquina). Los números no son encabezados. */
function textoEncabezado(h: Hoja, r: number, c: number): string {
  let v = celda(h, r, c);
  if (v === null) {
    const o = indiceCombinadas(h).get(`${r},${c}`);
    if (o) v = celda(h, o[0], o[1]);
  }
  return typeof v === "string" ? aTexto(v) : "";
}

type ColumnaEnc = { col: number; encabezado: string; candidatos: string[] };

function columnasEncabezado(h: Hoja, b: Bloque, filas: number[]): ColumnaEnc[] {
  const out: ColumnaEnc[] = [];
  for (let c = b.col0; c <= b.col1; c++) {
    const abajo = textoEncabezado(h, filas[filas.length - 1], c);
    const arriba = filas.length > 1 ? textoEncabezado(h, filas[0], c) : "";
    const padre = arriba && arriba !== abajo ? arriba : "";
    const candidatos = abajo ? [claveEnc(abajo), padre ? claveEnc(`${padre} ${abajo}`) : ""] : padre ? [claveEnc(padre)] : [];
    const lista = candidatos.filter(Boolean);
    if (lista.length) out.push({ col: c, encabezado: [padre, abajo].filter(Boolean).join(" · "), candidatos: lista });
  }
  return out;
}

/** Formas de encabezado a probar para un bloque. */
function formasEncabezado(h: Hoja, b: Bloque): number[][] {
  if (b.filaTitulo >= 0) {
    const t = b.filaTitulo;
    return [[t + 1, t + 2], [t + 1], [t]];
  }
  const formas: number[][] = [];
  let vistas = 0;
  for (let r = 0; r < h.filas.length && vistas < 10; r++) {
    if (!h.filas[r]) continue;
    vistas++;
    formas.push([r], [r, r + 1]);
  }
  return formas;
}

// ── Puntaje ─────────────────────────────────────────────────────────────────

const MUESTRA = 40;

function muestra(h: Hoja, col: number, desde: number): Valor[] {
  const out: Valor[] = [];
  for (let r = desde; r < h.filas.length && out.length < MUESTRA; r++) {
    const v = celda(h, r, col);
    if (v !== null) out.push(v);
  }
  return out;
}

function tipoOk(c: CampoDef, v: Valor): boolean {
  switch (c.tipo) {
    case "numero":
      return esNumero(v);
    case "fecha":
      return esFecha(v) || claveEnc(v) === "ei";
    case "cuit":
      return esCuit(v);
    case "marca":
      return esMarca(v) || v === null;
    default:
      return true;
  }
}

function coincidencia(col: ColumnaEnc, campo: CampoDef): number {
  let mejor = 0;
  for (const cand of col.candidatos) {
    const i = campo.sinonimos.indexOf(cand);
    if (i >= 0) mejor = Math.max(mejor, 1 - 0.03 * i);
  }
  return mejor;
}

type Evaluacion = {
  puntaje: number;
  tituloCoincide: boolean;
  columnas: Columna[];
  filasEncabezado: number[];
  filaDatos: number;
  cantidadFilas: number;
};

type Forma = { filasEnc: number[]; filaDatos: number; cols: ColumnaEnc[]; muestras: Map<number, Valor[]> };

function prepararForma(h: Hoja, b: Bloque, filasEnc: number[]): Forma {
  const filaDatos = filasEnc[filasEnc.length - 1] + 1;
  const cols = columnasEncabezado(h, b, filasEnc);
  return { filasEnc, filaDatos, cols, muestras: new Map(cols.map((c) => [c.col, muestra(h, c.col, filaDatos)])) };
}

function evaluar(h: Hoja, def: SeccionDef, forma: Forma, titulo: string): Evaluacion {
  const { filasEnc, filaDatos, cols } = forma;

  const pares: { col: ColumnaEnc; campo: CampoDef; s: number }[] = [];
  for (const col of cols) {
    for (const campo of def.campos) {
      let s = coincidencia(col, campo);
      if (s === 0) continue;
      if (campo.tipo !== "texto") {
        const m = forma.muestras.get(col.col)!;
        if (m.length >= 3 && m.filter((v) => tipoOk(campo, v)).length / m.length < 0.5) s *= 0.4;
      }
      pares.push({ col, campo, s });
    }
  }
  pares.sort((a, b2) => b2.s - a.s || a.col.col - b2.col.col);
  const asignados = new Map<string, { col: number; s: number }>();
  const usadas = new Set<number>();
  for (const p of pares) {
    if (asignados.has(p.campo.id) || usadas.has(p.col.col)) continue;
    asignados.set(p.campo.id, { col: p.col.col, s: p.s });
    usadas.add(p.col.col);
  }

  const total = def.campos.reduce((s, x) => s + x.peso, 0);
  let puntaje = def.campos.reduce((s, x) => s + x.peso * (asignados.get(x.id)?.s ?? 0), 0) / total;
  for (const x of def.campos) if (x.requerido && !asignados.has(x.id)) puntaje *= 0.5;
  const kTitulo = claveEnc(titulo);
  const tituloCoincide = def.titulos.some((t) => kTitulo.includes(claveEnc(t)));
  if (tituloCoincide) puntaje = Math.min(1, puntaje + 0.25);
  else if (def.requiereTitulo) puntaje *= 0.3;

  const campoDeCol = new Map([...asignados].map(([id, a]) => [a.col, id]));
  const columnas: Columna[] = cols.map((col) => ({ col: col.col, encabezado: col.encabezado, campo: campoDeCol.get(col.col) ?? null }));
  const colsSignificativas = def.significativos.map((id) => asignados.get(id)?.col).filter((x): x is number => x !== undefined);
  let cantidadFilas = 0;
  for (let r = filaDatos; r < h.filas.length; r++) {
    if (colsSignificativas.some((cc) => celda(h, r, cc) !== null)) cantidadFilas++;
  }
  return { puntaje, tituloCoincide, columnas, filasEncabezado: filasEnc, filaDatos, cantidadFilas };
}

function mejorEvaluacion(h: Hoja, def: SeccionDef, formas: Forma[], titulo: string): Evaluacion {
  let mejor: Evaluacion | null = null;
  for (const f of formas) {
    const ev = evaluar(h, def, f, titulo);
    if (!mejor || ev.puntaje > mejor.puntaje + 1e-9) mejor = ev;
  }
  return mejor!;
}

/** Evalúa un bloque contra una sección (la mejor forma de encabezado). */
export function evaluarBloque(h: Hoja, b: Bloque, seccion: SeccionId): Evaluacion {
  const formas = formasEncabezado(h, b).map((f) => prepararForma(h, b, f));
  return mejorEvaluacion(h, SECCIONES.find((s) => s.id === seccion)!, formas, tituloBloque(b));
}

export function clasificarBloque(h: Hoja, b: Bloque): Deteccion {
  const formas = formasEncabezado(h, b).map((f) => prepararForma(h, b, f));
  const titulo = tituloBloque(b);
  let mejor: { id: SeccionId; ev: Evaluacion } | null = null;
  for (const def of SECCIONES) {
    const ev = mejorEvaluacion(h, def, formas, titulo);
    if (!mejor || ev.puntaje > mejor.ev.puntaje + 1e-9) mejor = { id: def.id, ev };
  }
  const { id, ev } = mejor!;
  const def = SECCIONES.find((s) => s.id === id)!;
  let confianza: Deteccion["confianza"] =
    ev.cantidadFilas === 0 ? "baja" : ev.puntaje >= UMBRAL_ALTO ? "alta" : ev.puntaje >= UMBRAL_MEDIO ? "media" : "baja";
  // Inventarios: uno por materia prima o producto, que se nombra en el título.
  if (def.multiple) {
    if (!subtitulo(b)) confianza = "baja";
    else if (confianza === "media" && ev.tituloCoincide) confianza = "alta";
  }
  return {
    bloque: b,
    titulo: tituloBloque(b),
    seccion: confianza === "baja" ? null : id,
    sugerida: ev.puntaje >= 0.3 ? id : null,
    puntaje: ev.puntaje,
    tituloCoincide: ev.tituloCoincide,
    confianza,
    filasEncabezado: ev.filasEncabezado,
    filaDatos: ev.filaDatos,
    columnas: ev.columnas,
    cantidadFilas: ev.cantidadFilas,
  };
}

/** Cambia la sección de un bloque (elección del usuario) y vuelve a leer sus columnas. */
export function reasignar(hojas: Hoja[], d: Deteccion, seccion: SeccionId | null): Deteccion {
  if (seccion === null) return { ...d, seccion: null };
  const h = hojas.find((x) => x.nombre === d.bloque.hoja)!;
  const ev = evaluarBloque(h, d.bloque, seccion);
  return { ...d, seccion, filasEncabezado: ev.filasEncabezado, filaDatos: ev.filaDatos, columnas: ev.columnas, cantidadFilas: ev.cantidadFilas };
}

/**
 * Por qué no hay nada para importar, en palabras para el usuario (cuando
 * ninguna tabla quedó asignada): el archivo está vacío, las tablas tienen los
 * encabezados pero ninguna fila, o no hay ninguna tabla de la app.
 */
export function motivoSinTablas(hojas: Hoja[], detecciones: Deteccion[], csv = false): string {
  const archivo = csv ? (hojas.length === 1 ? "El archivo" : "Los archivos") : "La planilla";
  if (!hojas.some((h) => h.filas.some(Boolean))) {
    return `${archivo} ${csv && hojas.length > 1 ? "están vacíos" : "está vacía"}: no ${csv && hojas.length > 1 ? "tienen" : "tiene"} ningún dato.`;
  }
  const sinFilas = detecciones.filter((d) => d.cantidadFilas === 0 && d.sugerida && d.puntaje >= UMBRAL_ALTO);
  if (sinFilas.length) {
    const nombres = [...new Set(sinFilas.map((d) => seccionDef(d.sugerida!).nombre))];
    const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : nombres[0];
    return `Se reconocieron las columnas de ${lista}, pero no hay ninguna fila con datos. Completá los datos debajo de los encabezados y volvé a subir${csv ? " los archivos" : " la planilla"}.`;
  }
  return csv
    ? "No se reconoció ninguna tabla de la app en estos archivos. Revisá que la primera fila tenga los nombres de las columnas (como en la plantilla limpia)."
    : "No se reconoció ninguna tabla de la app en esta planilla (clientes, proveedores, productos, compras, órdenes o ventas). Podés copiar tus datos en la plantilla limpia y subirla.";
}

const seccionDef = (id: SeccionId) => SECCIONES.find((s) => s.id === id)!;

/**
 * Analiza todo el libro. Cada sección (salvo los inventarios, que vienen uno
 * por materia prima o producto) se toma de un solo bloque: si hay otro que
 * también encaja, queda sin asignar y marcado para revisar.
 */
export function analizarLibro(hojas: Hoja[]): Deteccion[] {
  const detecciones: Deteccion[] = [];
  for (const h of hojas) {
    if (esHojaAuxiliar(h.nombre)) continue;
    for (const b of detectarBloques(h)) detecciones.push(clasificarBloque(h, b));
  }
  // Otro bloque que también encaja: si su título no nombra la sección (ej. un
  // costeo con columna "Materia prima") se ignora; si la nombra, se pide revisar.
  for (const def of SECCIONES) {
    if (def.multiple) continue;
    const candidatos = detecciones
      .filter((d) => d.seccion === def.id)
      .sort((a, b) => Number(b.tituloCoincide) - Number(a.tituloCoincide) || b.puntaje - a.puntaje || b.cantidadFilas - a.cantidadFilas);
    for (const d of candidatos.slice(1)) {
      d.seccion = null;
      d.confianza = d.tituloCoincide ? "media" : "baja";
    }
  }
  return detecciones;
}
