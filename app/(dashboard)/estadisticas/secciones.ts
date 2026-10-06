// Contenido de cada pantalla de Estadísticas, como una lista de "bloques"
// (tarjetas de indicadores, gráficos, tablas, alertas). La pantalla y el PDF
// se arman desde esta misma definición: lo que se ve es lo que se descarga.

import type { EChartsOption } from "echarts";
import {
  DIAS_SEMANA,
  comprasEn,
  composicionCosto,
  enMaceracion,
  insumosSinCompra,
  porBucket,
  rankingClientes,
  rentabilidadPorProducto,
  resumenProduccion,
  resumenVentas,
  stockLotes,
  stockMaterias,
  sumarPor,
  topN,
  variacion,
  variacionPrecios,
  ventasEn,
  ventasPorDiaSemana,
  type Datos,
  type StockMateria,
} from "./calculos";
import { COLOR, PALETA, barras, barrasAgrupadas, costoMargen, dona, lineaComparada, lineaEscalonada } from "./graficos";
import { fmtCantidad, fmtMoneda, fmtNumero, fmtPct } from "./formato";
import { diasEntre, formatRango, type Bucket, type Rango } from "./periodo";

export type SeccionId = "resumen" | "ventas" | "produccion" | "stock" | "compras" | "rentabilidad";

export const SECCIONES: { id: SeccionId; titulo: string; icono: string }[] = [
  { id: "resumen", titulo: "Resumen", icono: "gauge" },
  { id: "ventas", titulo: "Ventas", icono: "trend" },
  { id: "produccion", titulo: "Producción", icono: "flask" },
  { id: "stock", titulo: "Stock y alertas", icono: "boxes" },
  { id: "compras", titulo: "Compras", icono: "cart" },
  { id: "rentabilidad", titulo: "Rentabilidad", icono: "coin" },
];

/** A dónde lleva tocar un indicador o una alerta: otra pantalla de Estadísticas (y el bloque exacto) u otra sección de la app. */
export type Destino = { seccion: SeccionId; foco: string } | { href: string };

export type Delta = { texto: string; tono: "bueno" | "malo" | "neutro" };
export type Kpi = {
  id: string;
  etiqueta: string;
  valor: string;
  delta?: Delta;
  nota?: string;
  destino?: Destino;
  /** Cómo vino el número a lo largo del período (una por corte), para la sparkline. null = sin dato en ese corte. */
  tendencia?: (number | null)[];
  /** Para números que son una foto del momento: de qué se compone (barrita apilada). */
  composicion?: { nombre: string; valor: number; color: string }[];
};
export type Alerta = { nivel: "critico" | "aviso" | "info"; texto: string; detalle?: string; destino?: Destino };
export type Columna = { titulo: string; alinear?: "izq" | "centro" | "der" };

type BloqueBase = { id: string; titulo: string; subtitulo?: string; span: number };
export type Bloque = BloqueBase &
  (
    | { tipo: "kpis"; items: Kpi[] }
    | { tipo: "grafico"; option: EChartsOption; alto: number; vacio?: string }
    | { tipo: "tabla"; columnas: Columna[]; filas: string[][]; vacio: string }
    | { tipo: "alertas"; items: Alerta[]; vacio: string }
  );

export type Seccion = { id: SeccionId; titulo: string; descripcion: string; bloques: Bloque[] };

export type Contexto = {
  d: Datos;
  rango: Rango;
  comp: Rango | null;
  bs: Bucket[];
  bsComp: Bucket[] | null;
};

// ── Ayudas ──────────────────────────────────────────────────────────────────

function delta(actual: number, previo: number | null | undefined, mejorSi: "sube" | "baja" | "neutro", ctx: Contexto): Delta | undefined {
  if (!ctx.comp) return undefined;
  const v = variacion(actual, previo);
  // Textos cortos: van en una pastilla al lado del número.
  if (v === null) return { texto: actual === 0 && !previo ? "sin mov." : "antes: 0", tono: "neutro" };
  if (Math.abs(v) < 0.0005) return { texto: "= igual", tono: "neutro" };
  const sube = v > 0;
  const tono = mejorSi === "neutro" ? "neutro" : sube === (mejorSi === "sube") ? "bueno" : "malo";
  return { texto: `${sube ? "▲" : "▼"} ${fmtPct(Math.abs(v))}`, tono };
}

function deltaPuntos(actual: number | null, previo: number | null, ctx: Contexto): Delta | undefined {
  if (!ctx.comp) return undefined;
  if (actual === null || previo === null) return { texto: "antes: —", tono: "neutro" };
  const pts = Math.round((actual - previo) * 1000) / 10;
  if (pts === 0) return { texto: "= igual", tono: "neutro" };
  return { texto: `${pts > 0 ? "▲" : "▼"} ${fmtNumero(Math.abs(pts))} pts`, tono: pts > 0 ? "bueno" : "malo" };
}

/** "Licor Fino de Limón — 500 cc" → "Limón — 500 cc", para que entre en los ejes. */
export function nombreCorto(producto: string): string {
  return producto.replace(/^Licor (Fino )?de /i, "");
}

const etiquetas = (bs: Bucket[]) => bs.map((b) => b.etiqueta);

// Series para las sparklines de los indicadores (un valor por corte del período).
function serieCociente(num: number[], den: number[]): (number | null)[] {
  return num.map((n, i) => (den[i] ? n / den[i] : null));
}

function serieDistintos<T>(items: T[], fecha: (i: T) => string, clave: (i: T) => string | number, bs: Bucket[]): number[] {
  return bs.map((b) => new Set(items.filter((i) => fecha(i) >= b.desde && fecha(i) <= b.hasta).map(clave)).size);
}
const nombreComp = (ctx: Contexto) => (ctx.comp ? `Comparación (${formatRango(ctx.comp)})` : "");

// ── Alertas (las usa Resumen y Stock) ───────────────────────────────────────

const NIVEL_ORDEN = { critico: 0, aviso: 1, info: 2 };

export function construirAlertas(d: Datos): Alerta[] {
  const out: Alerta[] = [];
  for (const m of stockMaterias(d)) {
    const destino = { href: `/inventario-materia-prima?foco=${m.rowId}` };
    if (m.estado === "sin-stock") {
      out.push({ nivel: "critico", texto: `Sin stock de ${m.nombre}`, detalle: `Saldo: ${fmtCantidad(m.saldo, m.unidad)}`, destino });
    } else if (m.estado === "bajo") {
      out.push({
        nivel: "aviso",
        texto: `${m.nombre}: no alcanza para otra orden`,
        detalle: `Quedan ${fmtCantidad(m.saldo, m.unidad)}; una orden usa en promedio ${fmtCantidad(m.consumoPorOrden ?? 0, m.unidad)}`,
        destino,
      });
    }
  }
  for (const s of stockLotes(d)) {
    const destino = { href: `/productos-terminados?foco=${s.lote.id}` };
    if (s.saldo < 0) {
      out.push({ nivel: "critico", texto: `Lote ${s.lote.lote} con stock negativo`, detalle: `${s.producto}: se vendió más de lo embotellado`, destino });
      continue;
    }
    if (s.saldo <= 0) continue;
    if (s.diasParaVencer !== null && s.diasParaVencer < 0) {
      out.push({ nivel: "critico", texto: `Lote ${s.lote.lote} vencido`, detalle: `${s.producto} · ${fmtNumero(s.saldo)} u. en stock`, destino });
    } else if (s.diasParaVencer !== null && s.diasParaVencer <= 90) {
      out.push({ nivel: "aviso", texto: `Lote ${s.lote.lote} vence en ${s.diasParaVencer} días`, detalle: `${s.producto} · ${fmtNumero(s.saldo)} u. en stock`, destino });
    }
    if (s.ultimoMovimiento && diasEntre(s.ultimoMovimiento, d.hoy) > 60) {
      out.push({
        nivel: "info",
        texto: `Lote ${s.lote.lote} sin movimiento hace ${diasEntre(s.ultimoMovimiento, d.hoy)} días`,
        detalle: `${s.producto} · ${fmtNumero(s.saldo)} u. inmovilizadas`,
        destino,
      });
    }
  }
  for (const o of enMaceracion(d)) {
    const dias = diasEntre(o.fechaMaceracion, d.hoy);
    if (dias > 45) {
      out.push({ nivel: "aviso", texto: `Orden N° ${o.id} lleva ${dias} días macerando`, detalle: `${o.producto} — ${o.formato}: falta cargar el embotellado`, destino: { href: "/ordenes-produccion" } });
    }
  }
  const sinCompra = insumosSinCompra(d);
  if (sinCompra > 0) {
    out.push({
      nivel: "info",
      texto: `${sinCompra} insumos de órdenes sin compra asociada`,
      detalle: "No se pueden rastrear hasta el proveedor (trazabilidad incompleta)",
      destino: { href: "/ordenes-produccion" },
    });
  }
  return out.sort((a, b) => NIVEL_ORDEN[a.nivel] - NIVEL_ORDEN[b.nivel]);
}

// ── Resumen ─────────────────────────────────────────────────────────────────

function seccionResumen(ctx: Contexto): Seccion {
  const { d, rango, comp, bs } = ctx;
  const v = ventasEn(d, rango);
  const rv = resumenVentas(v);
  const rvp = comp ? resumenVentas(ventasEn(d, comp)) : null;
  const prod = resumenProduccion(d, rango);
  const prodP = comp ? resumenProduccion(d, comp) : null;
  const cs = comprasEn(d, rango);
  const gasto = cs.reduce((s, c) => s + c.total, 0);
  const gastoP = comp ? comprasEn(d, comp).reduce((s, c) => s + c.total, 0) : null;
  const valorLicor = stockLotes(d).reduce((s, l) => s + l.valor, 0);
  const valorMp = stockMaterias(d).reduce((s, m) => s + m.valor, 0);
  const alertas = construirAlertas(d);
  const factB = porBucket(v, (o) => o.fecha, (o) => o.subTotal, bs);
  const opsB = porBucket(v, (o) => o.fecha, () => 1, bs);
  const conCosto = v.filter((o) => o.conCosto);
  const factCostoB = porBucket(conCosto, (o) => o.fecha, (o) => o.subTotal, bs);
  const costoB = porBucket(conCosto, (o) => o.fecha, (o) => o.costo, bs);

  return {
    id: "resumen",
    titulo: "Resumen",
    descripcion: "Los números clave del negocio en el período. Tocá un indicador para ir al detalle.",
    bloques: [
      {
        id: "res-kpis",
        titulo: "",
        span: 12,
        tipo: "kpis",
        items: [
          { id: "k-fact", etiqueta: "Facturación", valor: fmtMoneda(rv.facturacion), delta: delta(rv.facturacion, rvp?.facturacion, "sube", ctx), tendencia: factB, destino: { seccion: "ventas", foco: "ventas-evolucion" } },
          {
            id: "k-margen",
            etiqueta: "Margen bruto",
            valor: fmtPct(rv.margenPct),
            delta: deltaPuntos(rv.margenPct, rvp?.margenPct ?? null, ctx),
            nota: fmtMoneda(rv.margen),
            tendencia: factCostoB.map((f, i) => (f ? (f - costoB[i]) / f : null)),
            destino: { seccion: "rentabilidad", foco: "rent-evolucion" },
          },
          { id: "k-unid", etiqueta: "Unidades vendidas", valor: fmtNumero(rv.unidades), delta: delta(rv.unidades, rvp?.unidades, "sube", ctx), tendencia: porBucket(v, (o) => o.fecha, (o) => o.cantidad, bs), destino: { seccion: "ventas", foco: "ventas-productos" } },
          { id: "k-ticket", etiqueta: "Ticket promedio", valor: fmtMoneda(rv.ticket), delta: delta(rv.ticket, rvp?.ticket, "sube", ctx), tendencia: serieCociente(factB, opsB), destino: { seccion: "ventas", foco: "ventas-clientes" } },
          { id: "k-prod", etiqueta: "Unidades elaboradas", valor: fmtNumero(prod.unidades), delta: delta(prod.unidades, prodP?.unidades, "neutro", ctx), tendencia: porBucket(prod.embotelladas, (o) => o.fechaEmbotellado, (o) => o.cantidadProducida, bs), destino: { seccion: "produccion", foco: "prod-vs-ventas" } },
          { id: "k-compras", etiqueta: "Gasto en compras", valor: fmtMoneda(gasto), delta: delta(gasto, gastoP, "baja", ctx), tendencia: porBucket(cs, (c) => c.fecha, (c) => c.total, bs), destino: { seccion: "compras", foco: "compras-evolucion" } },
          {
            id: "k-stock",
            etiqueta: "Stock valorizado",
            valor: fmtMoneda(valorLicor + valorMp),
            nota: "hoy",
            composicion: [
              { nombre: "Licor terminado", valor: valorLicor, color: COLOR.naranja },
              { nombre: "Materia prima", valor: valorMp, color: COLOR.gris },
            ],
            destino: { seccion: "stock", foco: "stock-valorizacion" },
          },
        ],
      },
      {
        id: "res-ingresos-compras",
        titulo: "Ingresos vs. compras",
        subtitulo: "Lo que entró por ventas y lo que se gastó en materia prima",
        span: 8,
        tipo: "grafico",
        alto: 300,
        vacio: rv.facturacion === 0 && gasto === 0 ? "Sin ventas ni compras en el período" : undefined,
        option: barrasAgrupadas(
          etiquetas(bs),
          [
            { nombre: "Facturación", datos: porBucket(v, (o) => o.fecha, (o) => o.subTotal, bs), color: COLOR.naranja },
            { nombre: "Compras", datos: porBucket(cs, (c) => c.fecha, (c) => c.total, bs), color: COLOR.gris },
          ],
          "moneda"
        ),
      },
      {
        id: "res-alertas",
        titulo: "Alertas",
        subtitulo: alertas.length ? `${alertas.length} para revisar` : undefined,
        span: 4,
        tipo: "alertas",
        items: alertas.slice(0, 6),
        vacio: "Todo en orden: no hay alertas.",
      },
      {
        id: "res-canal",
        titulo: "Ventas por canal",
        span: 4,
        tipo: "grafico",
        alto: 250,
        vacio: v.length ? undefined : "Sin ventas en el período",
        option: dona(sumarPor(v, (o) => o.canal || "Sin canal", (o) => o.subTotal), "moneda"),
      },
      {
        id: "res-productos",
        titulo: "Productos más vendidos",
        subtitulo: "Unidades",
        span: 4,
        tipo: "grafico",
        alto: 250,
        vacio: v.length ? undefined : "Sin ventas en el período",
        option: (() => {
          const p = topN(sumarPor(v, (o) => nombreCorto(o.descripcion), (o) => o.cantidad), 5);
          return barras(p.map((x) => x.nombre), p.map((x) => x.valor), "numero", { horizontal: true });
        })(),
      },
      {
        id: "res-stock",
        titulo: "Stock valorizado",
        subtitulo: "Situación actual",
        span: 4,
        tipo: "grafico",
        alto: 250,
        vacio: valorLicor + valorMp > 0 ? undefined : "Sin stock",
        option: dona(
          [
            { nombre: "Licor terminado", valor: Math.round(valorLicor) },
            { nombre: "Materia prima", valor: Math.round(valorMp) },
          ],
          "moneda",
          [COLOR.naranja, COLOR.gris]
        ),
      },
    ],
  };
}

// ── Ventas ──────────────────────────────────────────────────────────────────

function seccionVentas(ctx: Contexto): Seccion {
  const { d, rango, comp, bs, bsComp } = ctx;
  const v = ventasEn(d, rango);
  const vp = comp ? ventasEn(d, comp) : [];
  const rv = resumenVentas(v);
  const rvp = comp ? resumenVentas(vp) : null;
  const clientes = rankingClientes(v);
  const sinVentas = v.length ? undefined : "Sin ventas en el período";
  const productos = sumarPor(v, (o) => nombreCorto(o.descripcion), (o) => o.subTotal);
  const factB = porBucket(v, (o) => o.fecha, (o) => o.subTotal, bs);
  const unidB = porBucket(v, (o) => o.fecha, (o) => o.cantidad, bs);
  const opsB = porBucket(v, (o) => o.fecha, () => 1, bs);

  return {
    id: "ventas",
    titulo: "Ventas",
    descripcion: "Cuánto se vendió, qué, a quién, por qué canal y quién lo vendió.",
    bloques: [
      {
        id: "ventas-kpis",
        titulo: "",
        span: 12,
        tipo: "kpis",
        items: [
          { id: "v-fact", etiqueta: "Facturación", valor: fmtMoneda(rv.facturacion), delta: delta(rv.facturacion, rvp?.facturacion, "sube", ctx), tendencia: factB },
          { id: "v-unid", etiqueta: "Unidades vendidas", valor: fmtNumero(rv.unidades), delta: delta(rv.unidades, rvp?.unidades, "sube", ctx), tendencia: unidB },
          { id: "v-ops", etiqueta: "Operaciones", valor: fmtNumero(rv.operaciones), delta: delta(rv.operaciones, rvp?.operaciones, "sube", ctx), tendencia: opsB },
          { id: "v-ticket", etiqueta: "Ticket promedio", valor: fmtMoneda(rv.ticket), delta: delta(rv.ticket, rvp?.ticket, "sube", ctx), tendencia: serieCociente(factB, opsB) },
          { id: "v-precio", etiqueta: "Precio prom. por unidad", valor: fmtMoneda(rv.precioUnidad), delta: delta(rv.precioUnidad, rvp?.precioUnidad, "sube", ctx), tendencia: serieCociente(factB, unidB) },
          { id: "v-clientes", etiqueta: "Clientes que compraron", valor: fmtNumero(rv.clientes), delta: delta(rv.clientes, rvp?.clientes, "sube", ctx), tendencia: serieDistintos(v, (o) => o.fecha, (o) => o.clienteId, bs) },
        ],
      },
      {
        id: "ventas-evolucion",
        titulo: "Evolución de la facturación",
        span: 8,
        tipo: "grafico",
        alto: 300,
        vacio: sinVentas,
        option: lineaComparada(
          etiquetas(bs),
          { nombre: `Período (${formatRango(rango)})`, datos: porBucket(v, (o) => o.fecha, (o) => o.subTotal, bs) },
          bsComp ? { nombre: nombreComp(ctx), datos: porBucket(vp, (o) => o.fecha, (o) => o.subTotal, bsComp) } : null,
          "moneda"
        ),
      },
      {
        id: "ventas-canal",
        titulo: "Por canal",
        subtitulo: "Facturación mayorista vs. minorista",
        span: 4,
        tipo: "grafico",
        alto: 300,
        vacio: sinVentas,
        option: dona(sumarPor(v, (o) => o.canal || "Sin canal", (o) => o.subTotal), "moneda"),
      },
      {
        id: "ventas-productos",
        titulo: "Facturación por producto",
        span: 5,
        tipo: "grafico",
        alto: Math.max(220, productos.length * 38 + 40),
        vacio: sinVentas,
        option: barras(productos.map((p) => p.nombre), productos.map((p) => p.valor), "moneda", { horizontal: true }),
      },
      {
        id: "ventas-vendedores",
        titulo: "Por vendedor",
        span: 4,
        tipo: "grafico",
        alto: Math.max(220, productos.length * 38 + 40),
        vacio: sinVentas,
        option: (() => {
          const p = sumarPor(v, (o) => o.vendedor || "Sin vendedor", (o) => o.subTotal);
          return barras(p.map((x) => x.nombre), p.map((x) => x.valor), "moneda");
        })(),
      },
      {
        id: "ventas-condicion",
        titulo: "Condición de venta",
        subtitulo: "Contado vs. crédito",
        span: 3,
        tipo: "grafico",
        alto: Math.max(220, productos.length * 38 + 40),
        vacio: sinVentas,
        option: dona(sumarPor(v, (o) => o.condicion || "Sin dato", (o) => o.subTotal), "moneda", [COLOR.naranja, COLOR.gris, "#2F6F8F"]),
      },
      {
        id: "ventas-clientes",
        titulo: "Mejores clientes",
        subtitulo: clientes.length ? `El principal concentra el ${fmtPct(clientes[0].participacion)} de la facturación` : undefined,
        span: 8,
        tipo: "tabla",
        columnas: [
          { titulo: "#", alinear: "centro" },
          { titulo: "Cliente" },
          { titulo: "Operaciones", alinear: "centro" },
          { titulo: "Unidades", alinear: "centro" },
          { titulo: "Facturación", alinear: "der" },
          { titulo: "% del total", alinear: "centro" },
          { titulo: "Última compra", alinear: "centro" },
        ],
        filas: clientes.slice(0, 10).map((c, i) => [
          String(i + 1),
          c.cliente,
          fmtNumero(c.operaciones),
          fmtNumero(c.unidades),
          fmtMoneda(c.facturacion),
          fmtPct(c.participacion),
          c.ultimaCompra.split("-").reverse().join("/"),
        ]),
        vacio: "Sin ventas en el período",
      },
      {
        id: "ventas-dias",
        titulo: "Por día de la semana",
        subtitulo: "Facturación",
        span: 4,
        tipo: "grafico",
        alto: 280,
        vacio: sinVentas,
        option: barras(DIAS_SEMANA, ventasPorDiaSemana(v), "moneda"),
      },
    ],
  };
}

// ── Producción ──────────────────────────────────────────────────────────────

function seccionProduccion(ctx: Contexto): Seccion {
  const { d, rango, comp, bs } = ctx;
  const p = resumenProduccion(d, rango);
  const pp = comp ? resumenProduccion(d, comp) : null;
  const macerando = enMaceracion(d);
  const v = ventasEn(d, rango);
  const sinProd = p.embotelladas.length ? undefined : "No se embotelló ninguna orden en el período";
  const costoPorProducto = sumarPor(
    p.embotelladas,
    (o) => nombreCorto(`${o.producto} — ${o.formato}`),
    (o) => o.costoTotal
  ).map((x) => {
    const unidades = p.embotelladas
      .filter((o) => nombreCorto(`${o.producto} — ${o.formato}`) === x.nombre)
      .reduce((s, o) => s + o.cantidadProducida, 0);
    return { nombre: x.nombre, valor: unidades ? Math.round(x.valor / unidades) : 0 };
  });
  const ordenesTabla = [...p.embotelladas, ...macerando].sort((a, b) => (a.fechaMaceracion < b.fechaMaceracion ? 1 : -1));
  const unidB = porBucket(p.embotelladas, (o) => o.fechaEmbotellado, (o) => o.cantidadProducida, bs);
  const costoB = porBucket(p.embotelladas, (o) => o.fechaEmbotellado, (o) => o.costoTotal, bs);
  const totalInsumos = d.ordenes.reduce((s, o) => s + o.insumos.length, 0);
  const sinCompra = insumosSinCompra(d);

  return {
    id: "produccion",
    titulo: "Producción",
    descripcion: "Lo elaborado en el período (por fecha de embotellado), su costo y lo que sigue en maceración.",
    bloques: [
      {
        id: "prod-kpis",
        titulo: "",
        span: 12,
        tipo: "kpis",
        items: [
          { id: "p-unid", etiqueta: "Unidades elaboradas", valor: fmtNumero(p.unidades), delta: delta(p.unidades, pp?.unidades, "neutro", ctx), tendencia: unidB },
          { id: "p-ord", etiqueta: "Órdenes embotelladas", valor: fmtNumero(p.embotelladas.length), delta: delta(p.embotelladas.length, pp?.embotelladas.length, "neutro", ctx), tendencia: porBucket(p.embotelladas, (o) => o.fechaEmbotellado, () => 1, bs) },
          { id: "p-mac", etiqueta: "En maceración", valor: fmtNumero(macerando.length), nota: "hoy", destino: { seccion: "produccion", foco: "prod-ordenes" } },
          { id: "p-costo", etiqueta: "Costo por botella", valor: p.unidades ? fmtMoneda(p.costoPorBotella) : "—", delta: delta(p.costoPorBotella, pp?.costoPorBotella, "baja", ctx), tendencia: serieCociente(costoB, unidB) },
          { id: "p-dias", etiqueta: "Días de maceración", nota: "promedio", valor: p.diasMaceracionPromedio === null ? "—" : fmtNumero(p.diasMaceracionPromedio) },
          {
            id: "p-traza",
            etiqueta: "Insumos sin compra",
            nota: `de ${totalInsumos}`,
            valor: fmtNumero(sinCompra),
            composicion: [
              { nombre: "Sin compra asociada", valor: sinCompra, color: COLOR.ambar },
              { nombre: "Con compra (rastreables)", valor: totalInsumos - sinCompra, color: COLOR.verde },
            ],
            destino: { href: "/ordenes-produccion" },
          },
        ],
      },
      {
        id: "prod-vs-ventas",
        titulo: "Producido vs. vendido",
        subtitulo: "Unidades por período: si se vende más de lo que se produce, el stock se achica",
        span: 8,
        tipo: "grafico",
        alto: 300,
        vacio: p.embotelladas.length || v.length ? undefined : "Sin producción ni ventas en el período",
        option: barrasAgrupadas(
          etiquetas(bs),
          [
            { nombre: "Producido", datos: porBucket(p.embotelladas, (o) => o.fechaEmbotellado, (o) => o.cantidadProducida, bs), color: COLOR.naranja },
            { nombre: "Vendido", datos: porBucket(v, (o) => o.fecha, (o) => o.cantidad, bs), color: COLOR.gris },
          ],
          "numero"
        ),
      },
      {
        id: "prod-productos",
        titulo: "Elaborado por producto",
        subtitulo: "Unidades",
        span: 4,
        tipo: "grafico",
        alto: 300,
        vacio: sinProd,
        option: dona(sumarPor(p.embotelladas, (o) => nombreCorto(`${o.producto} — ${o.formato}`), (o) => o.cantidadProducida), "numero"),
      },
      {
        id: "prod-costo",
        titulo: "En qué se va el costo",
        subtitulo: "Participación de cada materia prima en el costo de producción",
        span: 5,
        tipo: "grafico",
        alto: 300,
        vacio: sinProd,
        option: dona(topN(composicionCosto(p.embotelladas), 6), "moneda"),
      },
      {
        id: "prod-costo-producto",
        titulo: "Costo por botella según producto",
        span: 7,
        tipo: "grafico",
        alto: 300,
        vacio: sinProd,
        option: barras(costoPorProducto.map((x) => x.nombre), costoPorProducto.map((x) => x.valor), "moneda"),
      },
      {
        id: "prod-ordenes",
        titulo: "Órdenes del período y en maceración",
        span: 12,
        tipo: "tabla",
        columnas: [
          { titulo: "Orden", alinear: "centro" },
          { titulo: "Producto" },
          { titulo: "Estado", alinear: "centro" },
          { titulo: "Maceración", alinear: "centro" },
          { titulo: "Embotellado", alinear: "centro" },
          { titulo: "Días", alinear: "centro" },
          { titulo: "Unidades", alinear: "centro" },
          { titulo: "Costo total", alinear: "der" },
          { titulo: "Costo/botella", alinear: "der" },
          { titulo: "Responsable" },
        ],
        filas: ordenesTabla.map((o) => [
          `N° ${o.id}`,
          `${o.producto} — ${o.formato}`,
          o.fechaEmbotellado ? "Embotellada" : "Macerando",
          o.fechaMaceracion.split("-").reverse().join("/"),
          o.fechaEmbotellado ? o.fechaEmbotellado.split("-").reverse().join("/") : "—",
          fmtNumero(diasEntre(o.fechaMaceracion, o.fechaEmbotellado ?? d.hoy)),
          fmtNumero(o.cantidadProducida),
          fmtMoneda(o.costoTotal),
          o.cantidadProducida ? fmtMoneda(o.costoTotal / o.cantidadProducida) : "—",
          o.responsable,
        ]),
        vacio: "No hay órdenes embotelladas en el período ni en maceración.",
      },
    ],
  };
}

// ── Stock y alertas ─────────────────────────────────────────────────────────

const ESTADO_MATERIA: Record<StockMateria["estado"], { texto: string; color: string }> = {
  "sin-stock": { texto: "Sin stock", color: COLOR.rojo },
  bajo: { texto: "Menos de 1 orden", color: COLOR.ambar },
  ok: { texto: "OK", color: COLOR.verde },
  "sin-consumo": { texto: "Sin consumo registrado", color: COLOR.gris },
};

function seccionStock(ctx: Contexto): Seccion {
  const { d } = ctx;
  const lotes = stockLotes(d);
  const mats = stockMaterias(d);
  const alertas = construirAlertas(d);
  const conStock = lotes.filter((l) => l.saldo > 0);
  const valorLicor = lotes.reduce((s, l) => s + l.valor, 0);
  const valorMp = mats.reduce((s, m) => s + m.valor, 0);
  const porProducto = sumarPor(conStock, (l) => nombreCorto(l.producto), (l) => l.saldo);
  const conConsumo = mats.filter((m) => m.ordenesQueAlcanza !== null).sort((a, b) => (a.ordenesQueAlcanza ?? 0) - (b.ordenesQueAlcanza ?? 0));
  const porVencer = conStock.filter((l) => l.diasParaVencer !== null && l.diasParaVencer <= 90).length;
  const quietos = conStock.filter((l) => l.ultimoMovimiento && diasEntre(l.ultimoMovimiento, d.hoy) > 60).length;

  return {
    id: "stock",
    titulo: "Stock y alertas",
    descripcion: "Situación actual del stock de licor y de materia prima (no depende del período elegido).",
    bloques: [
      {
        id: "stock-kpis",
        titulo: "",
        span: 12,
        tipo: "kpis",
        items: [
          {
            id: "s-unid",
            etiqueta: "Botellas en stock",
            nota: `${conStock.length} lotes`,
            valor: fmtNumero(conStock.reduce((s, l) => s + l.saldo, 0)),
            composicion: porProducto.slice(0, PALETA.length).map((p, i) => ({ nombre: p.nombre, valor: p.valor, color: PALETA[i] })),
            destino: { seccion: "stock", foco: "stock-lotes" },
          },
          { id: "s-licor", etiqueta: "Valor del licor", valor: fmtMoneda(valorLicor), destino: { seccion: "stock", foco: "stock-valorizacion" } },
          { id: "s-mp", etiqueta: "Valor de la materia prima", valor: fmtMoneda(valorMp), destino: { seccion: "stock", foco: "stock-tabla-mp" } },
          {
            id: "s-alerta",
            etiqueta: "Materias primas en alerta",
            nota: `de ${mats.length}`,
            valor: fmtNumero(mats.filter((m) => m.estado === "sin-stock" || m.estado === "bajo").length),
            composicion: [
              { nombre: "Sin stock", valor: mats.filter((m) => m.estado === "sin-stock").length, color: COLOR.rojo },
              { nombre: "No alcanza para otra orden", valor: mats.filter((m) => m.estado === "bajo").length, color: COLOR.ambar },
              { nombre: "OK", valor: mats.filter((m) => m.estado === "ok" || m.estado === "sin-consumo").length, color: COLOR.verde },
            ],
            destino: { seccion: "stock", foco: "stock-materias" },
          },
          { id: "s-vence", etiqueta: "Lotes por vencer", nota: "90 días", valor: fmtNumero(porVencer), destino: { seccion: "stock", foco: "stock-lotes" } },
          { id: "s-quietos", etiqueta: "Lotes quietos", nota: "+60 días sin mov.", valor: fmtNumero(quietos), destino: { seccion: "stock", foco: "stock-lotes" } },
        ],
      },
      {
        id: "stock-productos",
        titulo: "Botellas en stock por producto",
        span: 7,
        tipo: "grafico",
        alto: 300,
        vacio: porProducto.length ? undefined : "No hay licor en stock",
        option: barras(porProducto.map((p) => p.nombre), porProducto.map((p) => p.valor), "numero"),
      },
      {
        id: "stock-alertas",
        titulo: "Alertas",
        subtitulo: alertas.length ? `${alertas.length} para revisar · tocá una para ir a ver` : undefined,
        span: 5,
        tipo: "alertas",
        items: alertas,
        vacio: "Todo en orden: no hay alertas.",
      },
      {
        id: "stock-materias",
        titulo: "¿Para cuántas órdenes alcanza la materia prima?",
        subtitulo: "Saldo actual ÷ consumo promedio por orden. Rojo/ámbar: hay que reponer",
        span: 7,
        tipo: "grafico",
        alto: Math.max(240, conConsumo.length * 34 + 40),
        vacio: conConsumo.length ? undefined : "Todavía no hay consumos registrados",
        option: barras(
          conConsumo.map((m) => m.nombre),
          conConsumo.map((m) => m.ordenesQueAlcanza ?? 0),
          "numero",
          { horizontal: true, colores: conConsumo.map((m) => (m.ordenesQueAlcanza === 0 ? COLOR.rojo : m.ordenesQueAlcanza === 1 ? COLOR.ambar : COLOR.verde)) }
        ),
      },
      {
        id: "stock-valorizacion",
        titulo: "Dónde está la plata inmovilizada",
        subtitulo: "Valor del stock: licor terminado y cada materia prima",
        span: 5,
        tipo: "grafico",
        alto: Math.max(240, conConsumo.length * 34 + 40),
        vacio: valorLicor + valorMp > 0 ? undefined : "Sin stock",
        option: dona(
          topN(
            [{ nombre: "Licor terminado", valor: Math.round(valorLicor) }, ...mats.map((m) => ({ nombre: m.nombre, valor: Math.round(m.valor) }))]
              .filter((x) => x.valor > 0)
              .sort((a, b) => b.valor - a.valor),
            6
          ),
          "moneda"
        ),
      },
      {
        id: "stock-tabla-mp",
        titulo: "Materia prima",
        span: 12,
        tipo: "tabla",
        columnas: [
          { titulo: "Materia prima" },
          { titulo: "Saldo", alinear: "centro" },
          { titulo: "Valor", alinear: "der" },
          { titulo: "Consumo prom. por orden", alinear: "centro" },
          { titulo: "Alcanza para", alinear: "centro" },
          { titulo: "Días de stock", alinear: "centro" },
          { titulo: "Estado", alinear: "centro" },
        ],
        filas: [...mats]
          .sort((a, b) => ["sin-stock", "bajo", "ok", "sin-consumo"].indexOf(a.estado) - ["sin-stock", "bajo", "ok", "sin-consumo"].indexOf(b.estado))
          .map((m) => [
            m.nombre,
            fmtCantidad(m.saldo, m.unidad),
            fmtMoneda(m.valor),
            m.consumoPorOrden === null ? "—" : fmtCantidad(m.consumoPorOrden, m.unidad),
            m.ordenesQueAlcanza === null ? "—" : `${m.ordenesQueAlcanza} ${m.ordenesQueAlcanza === 1 ? "orden" : "órdenes"}`,
            m.diasDeStock === null ? "—" : fmtNumero(m.diasDeStock),
            ESTADO_MATERIA[m.estado].texto,
          ]),
        vacio: "No hay materias primas en el inventario.",
      },
      {
        id: "stock-lotes",
        titulo: "Lotes de licor con stock",
        span: 12,
        tipo: "tabla",
        columnas: [
          { titulo: "Lote", alinear: "centro" },
          { titulo: "Producto" },
          { titulo: "Botellas", alinear: "centro" },
          { titulo: "Valor", alinear: "der" },
          { titulo: "Vencimiento", alinear: "centro" },
          { titulo: "Último movimiento", alinear: "centro" },
        ],
        filas: lotes
          .filter((l) => l.saldo !== 0)
          .sort((a, b) => a.lote.lote - b.lote.lote)
          .map((l) => [
            String(l.lote.lote),
            l.producto,
            fmtNumero(l.saldo),
            fmtMoneda(l.valor),
            l.lote.fechaVencimiento
              ? `${l.lote.fechaVencimiento.split("-").reverse().join("/")} (${l.diasParaVencer! < 0 ? "vencido" : `${l.diasParaVencer} días`})`
              : "—",
            l.ultimoMovimiento
              ? `${l.ultimoMovimiento.split("-").reverse().join("/")} (hace ${diasEntre(l.ultimoMovimiento, d.hoy)} días)`
              : "—",
          ]),
        vacio: "No hay lotes con stock.",
      },
    ],
  };
}

// ── Compras ─────────────────────────────────────────────────────────────────

function seccionCompras(ctx: Contexto): Seccion {
  const { d, rango, comp, bs, bsComp } = ctx;
  const cs = comprasEn(d, rango);
  const csp = comp ? comprasEn(d, comp) : [];
  const gasto = cs.reduce((s, c) => s + c.total, 0);
  const gastoP = comp ? csp.reduce((s, c) => s + c.total, 0) : null;
  const sinCompras = cs.length ? undefined : "Sin compras en el período";
  const porMateria = sumarPor(cs, (c) => c.materia, (c) => c.total);
  const variaciones = variacionPrecios(d, rango.hasta);
  // Precio de la materia prima en la que más se gastó (en el período, o en todo el historial si no hubo compras).
  const principal = porMateria[0]?.nombre ?? sumarPor(comprasEn(d, null), (c) => c.materia, (c) => c.total)[0]?.nombre;
  const historial = comprasEn(d, null)
    .filter((c) => c.materia === principal && c.fecha <= rango.hasta)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id));
  const gastoB = porBucket(cs, (c) => c.fecha, (c) => c.total, bs);
  const cantB = porBucket(cs, (c) => c.fecha, () => 1, bs);

  return {
    id: "compras",
    titulo: "Compras",
    descripcion: "En qué y a quién se compró, cómo se pagó y cómo vienen los precios (sale del Libro de compras).",
    bloques: [
      {
        id: "compras-kpis",
        titulo: "",
        span: 12,
        tipo: "kpis",
        items: [
          { id: "c-gasto", etiqueta: "Gasto en compras", valor: fmtMoneda(gasto), delta: delta(gasto, gastoP, "baja", ctx), tendencia: gastoB },
          { id: "c-cant", etiqueta: "Compras realizadas", valor: fmtNumero(cs.length), delta: delta(cs.length, comp ? csp.length : null, "neutro", ctx), tendencia: cantB },
          { id: "c-prom", etiqueta: "Compra promedio", valor: cs.length ? fmtMoneda(gasto / cs.length) : "—", tendencia: serieCociente(gastoB, cantB) },
          { id: "c-prov", etiqueta: "Proveedores", valor: fmtNumero(new Set(cs.map((c) => c.proveedorId)).size), tendencia: serieDistintos(cs, (c) => c.fecha, (c) => c.proveedorId, bs) },
          { id: "c-mat", etiqueta: "Materias primas compradas", valor: fmtNumero(new Set(cs.map((c) => c.materiaPrimaId)).size), tendencia: serieDistintos(cs, (c) => c.fecha, (c) => c.materiaPrimaId, bs) },
          {
            id: "c-sube",
            etiqueta: "Mayor aumento de precio",
            valor: variaciones[0]?.variacion ? fmtPct(variaciones[0].variacion) : "—",
            nota: variaciones[0]?.variacion ? variaciones[0].materia : "sin variaciones",
            destino: { seccion: "compras", foco: "compras-variacion" },
          },
        ],
      },
      {
        id: "compras-evolucion",
        titulo: "Evolución del gasto",
        span: 8,
        tipo: "grafico",
        alto: 300,
        vacio: sinCompras,
        option: lineaComparada(
          etiquetas(bs),
          { nombre: `Período (${formatRango(rango)})`, datos: porBucket(cs, (c) => c.fecha, (c) => c.total, bs) },
          bsComp ? { nombre: nombreComp(ctx), datos: porBucket(csp, (c) => c.fecha, (c) => c.total, bsComp) } : null,
          "moneda"
        ),
      },
      {
        id: "compras-proveedores",
        titulo: "Gasto por proveedor",
        span: 4,
        tipo: "grafico",
        alto: 300,
        vacio: sinCompras,
        option: dona(topN(sumarPor(cs, (c) => c.proveedor, (c) => c.total), 5), "moneda"),
      },
      {
        id: "compras-materias",
        titulo: "Gasto por materia prima",
        span: 7,
        tipo: "grafico",
        alto: Math.max(240, porMateria.length * 34 + 40),
        vacio: sinCompras,
        option: barras(porMateria.map((x) => x.nombre), porMateria.map((x) => x.valor), "moneda", { horizontal: true }),
      },
      {
        id: "compras-pago",
        titulo: "Medio de pago",
        span: 5,
        tipo: "grafico",
        alto: Math.max(240, porMateria.length * 34 + 40),
        vacio: sinCompras,
        option: dona(sumarPor(cs, (c) => c.medio, (c) => c.total), "moneda"),
      },
      {
        id: "compras-precio",
        titulo: principal ? `Precio de ${principal} compra a compra` : "Precio compra a compra",
        subtitulo: "La materia prima en la que más se gasta",
        span: 6,
        tipo: "grafico",
        alto: 280,
        vacio: historial.length ? undefined : "Sin compras registradas",
        option: lineaEscalonada(
          historial.map((c) => c.fecha.split("-").reverse().slice(0, 2).join("/")),
          historial.map((c) => c.costoUnitario),
          "Costo unitario",
          "moneda"
        ),
      },
      {
        id: "compras-variacion",
        titulo: "Variación de precios",
        subtitulo: "Primera vs. última compra de cada materia prima",
        span: 6,
        tipo: "tabla",
        columnas: [
          { titulo: "Materia prima" },
          { titulo: "Primer precio", alinear: "der" },
          { titulo: "Último precio", alinear: "der" },
          { titulo: "Variación", alinear: "centro" },
          { titulo: "Compras", alinear: "centro" },
        ],
        filas: variaciones.map((x) => [
          x.materia,
          fmtMoneda(x.primero),
          fmtMoneda(x.ultimo),
          x.variacion === null ? "—" : `${x.variacion > 0 ? "▲" : x.variacion < 0 ? "▼" : "="} ${fmtPct(Math.abs(x.variacion))}`,
          fmtNumero(x.compras),
        ]),
        vacio: "Sin compras registradas.",
      },
    ],
  };
}

// ── Rentabilidad ────────────────────────────────────────────────────────────

function seccionRentabilidad(ctx: Contexto): Seccion {
  const { d, rango, comp, bs } = ctx;
  const v = ventasEn(d, rango);
  const rv = resumenVentas(v);
  const rvp = comp ? resumenVentas(ventasEn(d, comp)) : null;
  const productos = rentabilidadPorProducto(v);
  const conCosto = v.filter((o) => o.conCosto);
  const sinDatos = conCosto.length ? undefined : "Sin ventas con costo conocido en el período";
  const unidadesConCosto = conCosto.reduce((s, o) => s + o.cantidad, 0);
  const costoB = porBucket(conCosto, (o) => o.fecha, (o) => o.costo, bs);
  const factB = porBucket(conCosto, (o) => o.fecha, (o) => o.subTotal, bs);
  const canales = [...new Set(conCosto.map((o) => o.canal || "Sin canal"))];
  const margenCanal = canales.map((c) => {
    const vs = conCosto.filter((o) => (o.canal || "Sin canal") === c);
    const f = vs.reduce((s, o) => s + o.subTotal, 0);
    return f ? (f - vs.reduce((s, o) => s + o.costo, 0)) / f : 0;
  });
  const coberturaNota =
    rv.cobertura !== null && rv.cobertura < 0.999
      ? `Calculado sobre el ${fmtPct(rv.cobertura)} de la facturación: las ventas de productos sin lote cargado no tienen costo`
      : undefined;

  return {
    id: "rentabilidad",
    titulo: "Rentabilidad",
    descripcion: "Cuánto se gana con lo vendido: precio de venta contra el costo real del lote de donde salió cada botella.",
    bloques: [
      {
        id: "rent-kpis",
        titulo: "",
        span: 12,
        tipo: "kpis",
        items: [
          { id: "r-fact", etiqueta: "Facturación", valor: fmtMoneda(rv.facturacionConCosto), nota: "con costo", delta: delta(rv.facturacionConCosto, rvp?.facturacionConCosto, "sube", ctx), tendencia: factB },
          { id: "r-costo", etiqueta: "Costo de lo vendido", valor: fmtMoneda(rv.costo), delta: delta(rv.costo, rvp?.costo, "neutro", ctx), tendencia: costoB },
          { id: "r-margen", etiqueta: "Margen bruto", valor: fmtMoneda(rv.margen), delta: delta(rv.margen, rvp?.margen, "sube", ctx), tendencia: factB.map((f, i) => f - costoB[i]) },
          { id: "r-pct", etiqueta: "Margen %", valor: fmtPct(rv.margenPct), delta: deltaPuntos(rv.margenPct, rvp?.margenPct ?? null, ctx), tendencia: factB.map((f, i) => (f ? (f - costoB[i]) / f : null)) },
          { id: "r-unidad", etiqueta: "Ganancia por botella", valor: unidadesConCosto ? fmtMoneda(rv.margen / unidadesConCosto) : "—", tendencia: serieCociente(factB.map((f, i) => f - costoB[i]), porBucket(conCosto, (o) => o.fecha, (o) => o.cantidad, bs)) },
          {
            id: "r-cob",
            etiqueta: "Ventas con costo",
            nota: "del total",
            valor: fmtPct(rv.cobertura),
            composicion: [
              { nombre: "Con costo conocido", valor: rv.facturacionConCosto, color: COLOR.naranja },
              { nombre: "Sin lote cargado (sin costo)", valor: rv.facturacion - rv.facturacionConCosto, color: COLOR.gris },
            ],
          },
        ],
      },
      {
        id: "rent-evolucion",
        titulo: "Facturación: costo y margen",
        subtitulo: coberturaNota ?? "Cada barra es lo facturado, partido en lo que costó y lo que quedó",
        span: 8,
        tipo: "grafico",
        alto: 300,
        vacio: sinDatos,
        option: costoMargen(
          etiquetas(bs),
          costoB,
          factB.map((f, i) => Math.round((f - costoB[i]) * 100) / 100),
          factB.map((f, i) => (f > 0 ? (f - costoB[i]) / f : null))
        ),
      },
      {
        id: "rent-canal",
        titulo: "Margen % por canal",
        span: 4,
        tipo: "grafico",
        alto: 300,
        vacio: sinDatos,
        option: barras(canales, margenCanal, "pct"),
      },
      {
        id: "rent-precio-costo",
        titulo: "Precio promedio vs. costo por botella",
        span: 6,
        tipo: "grafico",
        alto: 300,
        vacio: sinDatos,
        option: barrasAgrupadas(
          productos.map((p) => nombreCorto(p.producto)),
          [
            { nombre: "Precio promedio", datos: productos.map((p) => p.precioPromedio), color: COLOR.naranja },
            { nombre: "Costo", datos: productos.map((p) => p.costoUnitario), color: COLOR.gris },
          ],
          "moneda"
        ),
      },
      {
        id: "rent-margen-producto",
        titulo: "Margen bruto por producto",
        span: 6,
        tipo: "grafico",
        alto: 300,
        vacio: sinDatos,
        option: barras(productos.map((p) => nombreCorto(p.producto)), productos.map((p) => p.margen), "moneda", { horizontal: true }),
      },
      {
        id: "rent-tabla",
        titulo: "Rentabilidad por producto",
        span: 12,
        tipo: "tabla",
        columnas: [
          { titulo: "Producto" },
          { titulo: "Unidades", alinear: "centro" },
          { titulo: "Facturación", alinear: "der" },
          { titulo: "Costo", alinear: "der" },
          { titulo: "Margen", alinear: "der" },
          { titulo: "Margen %", alinear: "centro" },
          { titulo: "Precio prom.", alinear: "der" },
          { titulo: "Costo por botella", alinear: "der" },
        ],
        filas: productos.map((p) => [
          p.producto,
          fmtNumero(p.unidades),
          fmtMoneda(p.facturacion),
          fmtMoneda(p.costo),
          fmtMoneda(p.margen),
          fmtPct(p.margenPct),
          fmtMoneda(p.precioPromedio),
          fmtMoneda(p.costoUnitario),
        ]),
        vacio: "Sin ventas con costo conocido en el período.",
      },
    ],
  };
}

export function construirSeccion(id: SeccionId, ctx: Contexto): Seccion {
  switch (id) {
    case "resumen":
      return seccionResumen(ctx);
    case "ventas":
      return seccionVentas(ctx);
    case "produccion":
      return seccionProduccion(ctx);
    case "stock":
      return seccionStock(ctx);
    case "compras":
      return seccionCompras(ctx);
    case "rentabilidad":
      return seccionRentabilidad(ctx);
  }
}
