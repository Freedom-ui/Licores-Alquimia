// Fábricas de opciones de ECharts con el estilo de la app. Cada gráfico de
// Estadísticas se arma con una de estas, así todos comparten colores,
// tipografía y formato de números (y se ven igual en pantalla y en el PDF).

import type { EChartsOption } from "echarts";
import { fmtMoneda, fmtMonedaCorta, fmtNumero, fmtPct } from "./formato";
import type { Par } from "./calculos";

export const COLOR = {
  naranja: "#D4772A",
  naranjaOscuro: "#B85F1A",
  naranjaClaro: "#F0C59A",
  gris: "#B4B2A9",
  grisTexto: "#6F6B66",
  verde: "#2E7D42",
  rojo: "#B23A3A",
  ambar: "#C08A1E",
};

/** Paleta para categorías (tortas): el naranja de la marca primero, el resto distinguibles entre sí. */
export const PALETA = ["#D4772A", "#2F6F8F", "#E9A25F", "#6B8F3A", "#8C5A9E", "#C9A227", "#5F8F86", "#B4B2A9"];

export type Formato = "moneda" | "numero" | "pct";

const fmt = (f: Formato) => (v: number) => (f === "moneda" ? fmtMoneda(v) : f === "pct" ? fmtPct(v) : fmtNumero(v));
const fmtEje = (f: Formato) => (v: number) => (f === "moneda" ? fmtMonedaCorta(v) : f === "pct" ? fmtPct(v) : fmtNumero(v));

const base = (): EChartsOption => ({
  animationDuration: 500,
  textStyle: { fontFamily: "Arial, Helvetica, sans-serif", color: COLOR.grisTexto },
  grid: { left: 8, right: 16, top: 34, bottom: 8 },
  tooltip: { trigger: "axis", confine: true, backgroundColor: "#fff", borderColor: "#C8C3BC", textStyle: { color: "#1C1C1C", fontSize: 12 } },
});

// En ejes de fechas sobran etiquetas y se pueden ocultar las que se pisan;
// en ejes de categorías (productos, vendedores…) se muestran todas, partidas
// en 2 líneas si no entran.
const ejeCategorias = (categorias: string[], todas = false) => ({
  type: "category" as const,
  data: categorias,
  axisTick: { show: false },
  axisLine: { lineStyle: { color: "#C8C3BC" } },
  axisLabel: todas
    ? { color: COLOR.grisTexto, fontSize: 11, interval: 0, width: 96, overflow: "break" as const, lineHeight: 13 }
    : { color: COLOR.grisTexto, fontSize: 11, hideOverlap: true },
});

/** Etiqueta sobre cada barra/punto: el monto completo (más preciso que el del eje). */
const fmtEtiqueta = (f: Formato) => (v: number) => (f === "moneda" && Math.abs(v) < 1_000_000 ? fmtMoneda(v) : fmtEje(f)(v));

const ejeValores = (f: Formato) => ({
  type: "value" as const,
  // En barras horizontales angostas los valores del eje se pisaban: se ocultan los que no entran.
  axisLabel: { color: COLOR.grisTexto, fontSize: 11, formatter: fmtEje(f), hideOverlap: true },
  splitLine: { lineStyle: { color: "#ECE8E1" } },
});

const leyenda = { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11, color: COLOR.grisTexto } };

/** Evolución en el tiempo: período actual (línea con área) contra el de comparación (punteada). */
export function lineaComparada(
  categorias: string[],
  actual: { nombre: string; datos: number[] },
  previo: { nombre: string; datos: number[] } | null,
  f: Formato
): EChartsOption {
  return {
    ...base(),
    legend: { ...leyenda, data: [actual.nombre, ...(previo ? [previo.nombre] : [])] },
    tooltip: { ...base().tooltip, valueFormatter: (v) => fmt(f)(Number(v)) },
    xAxis: { ...ejeCategorias(categorias), boundaryGap: false },
    yAxis: ejeValores(f),
    series: [
      {
        name: actual.nombre,
        type: "line",
        data: actual.datos,
        smooth: 0.3,
        symbolSize: 6,
        lineStyle: { width: 2.5, color: COLOR.naranja },
        itemStyle: { color: COLOR.naranja },
        areaStyle: { color: "rgba(212,119,42,0.12)" },
      },
      ...(previo
        ? [
            {
              name: previo.nombre,
              type: "line" as const,
              data: previo.datos,
              smooth: 0.3,
              symbol: "none",
              lineStyle: { width: 2, type: "dashed" as const, color: COLOR.gris },
              itemStyle: { color: COLOR.gris },
            },
          ]
        : []),
    ],
  };
}

/** Barras simples (verticales u horizontales), opcionalmente con un color por barra. */
export function barras(
  categorias: string[],
  valores: number[],
  f: Formato,
  opciones: { horizontal?: boolean; colores?: string[]; nombre?: string } = {}
): EChartsOption {
  const cat = ejeCategorias(opciones.horizontal ? [...categorias].reverse() : categorias, true);
  const val = ejeValores(f);
  const datos = (opciones.horizontal ? [...valores].reverse() : valores).map((v, i) => {
    const color = opciones.colores?.[opciones.horizontal ? valores.length - 1 - i : i];
    return color ? { value: v, itemStyle: { color } } : v;
  });
  return {
    ...base(),
    grid: { left: 8, right: opciones.horizontal ? 84 : 16, top: 20, bottom: 8 },
    tooltip: { ...base().tooltip, axisPointer: { type: "shadow" }, valueFormatter: (v) => fmt(f)(Number(v)) },
    // Horizontal: el eje de valores suele quedar angosto (los nombres ocupan la izquierda).
    xAxis: opciones.horizontal ? { ...val, splitNumber: 3 } : cat,
    yAxis: opciones.horizontal ? { ...cat, axisLabel: { ...cat.axisLabel, width: 140, overflow: "break" as const } } : val,
    series: [
      {
        name: opciones.nombre ?? "",
        type: "bar",
        data: datos,
        barMaxWidth: 34,
        itemStyle: { color: COLOR.naranja, borderRadius: opciones.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        // En tarjetas angostas los montos de barras vecinas se pisan: se ocultan (queda el tooltip).
        labelLayout: { hideOverlap: true },
        label: {
          show: true,
          position: opciones.horizontal ? "right" : "top",
          fontSize: 11,
          color: COLOR.grisTexto,
          formatter: (p) => fmtEtiqueta(f)(Number((p as { value: number }).value)),
        },
      },
    ],
  };
}

/** Varias series de barras lado a lado (ej. producido vs vendido, precio vs costo). */
export function barrasAgrupadas(
  categorias: string[],
  series: { nombre: string; datos: number[]; color: string }[],
  f: Formato
): EChartsOption {
  return {
    ...base(),
    legend: { ...leyenda, data: series.map((s) => s.nombre) },
    tooltip: { ...base().tooltip, axisPointer: { type: "shadow" }, valueFormatter: (v) => fmt(f)(Number(v)) },
    // Si las categorías son productos (pocas) se muestran todas; si son fechas, se ralean solas.
    xAxis: ejeCategorias(categorias, categorias.length <= 8),
    yAxis: ejeValores(f),
    series: series.map((s) => ({
      name: s.nombre,
      type: "bar" as const,
      data: s.datos,
      barMaxWidth: 26,
      barGap: "15%",
      itemStyle: { color: s.color, borderRadius: [3, 3, 0, 0] },
    })),
  };
}

/**
 * Dona con leyenda abajo ("Nombre  44,6%") y el porcentaje dentro de cada
 * porción grande. Etiquetas por fuera se cortaban en tarjetas angostas.
 */
export function dona(pares: Par[], f: Formato, colores: string[] = PALETA): EChartsOption {
  const total = pares.reduce((s, p) => s + p.valor, 0);
  const pct = (v: number) => (total ? `${fmtNumero(Math.round((v / total) * 1000) / 10)}%` : "");
  return {
    ...base(),
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "#fff",
      borderColor: "#C8C3BC",
      textStyle: { color: "#1C1C1C", fontSize: 12 },
      formatter: (p) => {
        const x = p as { name: string; value: number; percent: number };
        return `${x.name}<br/><b>${fmt(f)(x.value)}</b> (${pct(x.value)})`;
      },
    },
    color: colores,
    // Hasta 3 porciones la leyenda va abajo; con más, en columna a la derecha
    // (abajo terminaba paginada con flechitas, inútil en el PDF).
    legend: {
      type: "plain",
      ...(pares.length <= 3
        ? { bottom: 0, left: "center", orient: "horizontal" as const }
        : { right: 0, top: "middle", orient: "vertical" as const }),
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 10,
      textStyle: { fontSize: 11, color: COLOR.grisTexto, width: 150, overflow: "truncate" as const },
      formatter: (name: string) => `${name}  ${pct(pares.find((p) => p.nombre === name)?.valor ?? 0)}`,
    },
    series: [
      {
        type: "pie",
        radius: pares.length <= 3 ? ["42%", "72%"] : ["34%", "58%"],
        center: pares.length <= 3 ? ["50%", "44%"] : ["27%", "50%"],
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
        label: {
          position: "inside",
          fontSize: 10.5,
          fontWeight: "bold",
          color: "#fff",
          formatter: (p) => {
            const v = (p as { value: number }).value;
            return total && v / total >= 0.07 ? pct(v) : "";
          },
        },
        labelLine: { show: false },
        data: pares.map((p) => ({ name: p.nombre, value: p.valor })),
      },
    ],
  };
}

/** Facturación partida en costo + margen (barras apiladas) y el margen % como línea en un segundo eje. */
export function costoMargen(categorias: string[], costo: number[], margen: number[], margenPct: (number | null)[]): EChartsOption {
  return {
    ...base(),
    legend: { ...leyenda, data: ["Costo", "Margen", "Margen %"] },
    tooltip: {
      ...base().tooltip,
      axisPointer: { type: "shadow" },
      formatter: (ps) => {
        const items = ps as unknown as { seriesName: string; value: number | null; marker: string; axisValueLabel: string }[];
        const lineas = items.map(
          (p) => `${p.marker}${p.seriesName}: <b>${p.seriesName === "Margen %" ? fmtPct(p.value) : fmtMoneda(Number(p.value ?? 0))}</b>`
        );
        return [items[0]?.axisValueLabel ?? "", ...lineas].join("<br/>");
      },
    },
    xAxis: ejeCategorias(categorias),
    yAxis: [ejeValores("moneda"), { ...ejeValores("pct"), splitLine: { show: false }, max: 1, min: 0 }],
    series: [
      { name: "Costo", type: "bar", stack: "f", data: costo, barMaxWidth: 34, itemStyle: { color: COLOR.gris } },
      { name: "Margen", type: "bar", stack: "f", data: margen, barMaxWidth: 34, itemStyle: { color: COLOR.naranja, borderRadius: [4, 4, 0, 0] } },
      {
        name: "Margen %",
        type: "line",
        yAxisIndex: 1,
        data: margenPct,
        connectNulls: true,
        symbolSize: 6,
        lineStyle: { color: COLOR.verde, width: 2 },
        itemStyle: { color: COLOR.verde },
      },
    ],
  };
}

/** Línea simple escalonada (ej. precio de una materia prima compra a compra). */
export function lineaEscalonada(categorias: string[], valores: number[], nombre: string, f: Formato): EChartsOption {
  return {
    ...base(),
    tooltip: { ...base().tooltip, valueFormatter: (v) => fmt(f)(Number(v)) },
    xAxis: ejeCategorias(categorias),
    yAxis: { ...ejeValores(f), scale: true },
    series: [
      {
        name: nombre,
        type: "line",
        step: "end",
        data: valores,
        symbolSize: 7,
        lineStyle: { width: 2.5, color: COLOR.naranja },
        itemStyle: { color: COLOR.naranja },
        label: { show: true, position: "top", fontSize: 11, color: COLOR.grisTexto, formatter: (p) => fmtEtiqueta(f)(Number((p as { value: number }).value)) },
        labelLayout: { hideOverlap: true },
      },
    ],
  };
}

// ── Ajuste al ancho real ─────────────────────────────────────────────────
// Las fábricas de arriba no saben cuánto va a medir la tarjeta. Esto adapta
// la opción al tamaño en px (en pantalla, cada vez que cambia; en el PDF, con
// el de la imagen) para que nada se pise en tarjetas angostas.

type Eje = { type?: string; data?: unknown[]; axisLabel?: Record<string, unknown> };
const comoLista = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** Ancho que se lleva el eje de valores de la izquierda (y el margen derecho). */
const MARGEN_EJES = 72;
/** Ancho aproximado de una letra de las etiquetas (11 px). */
const PX_POR_LETRA = 6.2;
/** Grosor mínimo del anillo (px) para que entre el porcentaje adentro ("44,6%"). */
const ANILLO_MIN = 44;
/** Debajo de esto la leyenda de una dona deja de ir a la derecha. */
const DONA_LEYENDA_AL_LADO = 500;

export function ajustarAlAncho(option: EChartsOption, ancho: number, alto = 0): EChartsOption {
  if (!ancho) return option;
  const o: EChartsOption = { ...option };

  // Categorías abajo con todas las etiquetas visibles (productos): el ancho de
  // cada etiqueta es el de su lugar en el eje; si el texto no entra ni en
  // varias líneas (lugar muy chico), van inclinadas.
  if (option.xAxis && !Array.isArray(option.xAxis)) {
    const x = option.xAxis as Eje;
    if (x.type === "category" && x.axisLabel?.interval === 0 && x.data?.length) {
      const lugar = (ancho - MARGEN_EJES) / x.data.length;
      const masLargo = Math.max(...x.data.map((d) => String(d).length)) * PX_POR_LETRA;
      const palabraMasLarga = Math.max(...x.data.flatMap((d) => String(d).split(" ").map((w) => w.length))) * PX_POR_LETRA;
      o.xAxis = {
        ...x,
        axisLabel:
          lugar >= 64 || masLargo <= lugar - 8
            ? // Nunca más angosto que la palabra más corta entera ("Sáb" se partía en "Sá / b").
              { ...x.axisLabel, width: Math.floor(Math.max(lugar - 8, palabraMasLarga + 8)), overflow: "break" }
            : // Inclinadas y con lugar para lo que distingue un producto de otro (el envase, al final).
              { ...x.axisLabel, width: 170, overflow: "truncate", rotate: 35, fontSize: 10 },
      } as EChartsOption["xAxis"];
      // Los montos sobre barras demasiado angostas no entran: quedan en el tooltip.
      if (lugar < 44) {
        const lista = comoLista(o.series ?? option.series) as { type?: string; label?: Record<string, unknown> }[];
        o.series = lista.map((se) => (se.type === "bar" && se.label?.show ? { ...se, label: { ...se.label, show: false } } : se)) as EChartsOption["series"];
      }
    }
  }

  // Categorías a la izquierda (barras horizontales): en tarjetas angostas los
  // nombres no pueden comerse más de un tercio del ancho.
  if (option.yAxis && !Array.isArray(option.yAxis)) {
    const y = option.yAxis as Eje;
    const actual = Number(y.axisLabel?.width ?? 0);
    if (y.type === "category" && actual && actual > ancho / 3) {
      o.yAxis = { ...y, axisLabel: { ...y.axisLabel, width: Math.max(70, Math.floor(ancho / 3)) } } as EChartsOption["yAxis"];
    }
  }

  // Dona con la leyenda a la derecha: si no entra al lado, pasa abajo y la
  // dona se acomoda en lo que queda arriba (con el alto, en px exactos).
  const series = comoLista(option.series) as { type?: string; center?: unknown; radius?: unknown; data?: unknown[] }[];
  const leyendas = comoLista(option.legend) as Record<string, unknown>[];
  if (ancho < DONA_LEYENDA_AL_LADO && series.length === 1 && series[0].type === "pie" && leyendas[0]?.orient === "vertical") {
    // Los nombres largos se cortan: el tooltip de la leyenda los muestra enteros.
    o.legend = { ...leyendas[0], orient: "horizontal", right: undefined, top: undefined, bottom: 0, left: "center", tooltip: { show: true } } as EChartsOption["legend"];
    // Renglones de la leyenda, acomodando los ítems como ECharts: cuadradito +
    // separación (25 px) + "Nombre  44,6%" (hasta 150 px) + 10 px entre ítems.
    let renglones = 1;
    let ocupado = 0;
    for (const d of series[0].data ?? []) {
      const nombre = String((d as { name?: unknown }).name ?? "");
      const item = 25 + Math.min(150, (nombre.length + 7) * PX_POR_LETRA) + 10;
      if (ocupado > 0 && ocupado + item > ancho) {
        renglones++;
        ocupado = 0;
      }
      ocupado += item;
    }
    const arriba = alto - renglones * 20 - 12;
    // El radio lo limita el lado más corto del espacio libre (si la tarjeta se
    // estira por la de al lado, el alto sobra y la dona no puede pasarse del ancho).
    const exterior = Math.round(Math.min(arriba * 0.46, ancho * 0.4));
    o.series = [
      alto && arriba > 120
        ? { ...series[0], center: ["50%", Math.round(arriba / 2)], radius: [Math.round(exterior * 0.55), exterior] }
        : { ...series[0], center: ["50%", "38%"], radius: ["30%", "54%"] },
    ] as EChartsOption["series"];
  }
  // Porcentajes dentro del anillo: si el anillo es más angosto que el texto
  // se ven cortados; se ocultan (la leyenda ya muestra el porcentaje).
  if (alto) {
    const lado = Math.min(ancho, alto) / 2;
    const px = (r: unknown) => (typeof r === "number" ? r : typeof r === "string" && r.endsWith("%") ? (lado * parseFloat(r)) / 100 : 0);
    const lista = comoLista(o.series ?? option.series) as { type?: string; radius?: unknown; label?: Record<string, unknown> }[];
    o.series = lista.map((se) => {
      if (se.type !== "pie" || !Array.isArray(se.radius) || se.label?.position !== "inside") return se;
      const grosor = px(se.radius[1]) - px(se.radius[0]);
      return grosor < ANILLO_MIN ? { ...se, label: { ...se.label, show: false } } : se;
    }) as EChartsOption["series"];
  }
  return o;
}
