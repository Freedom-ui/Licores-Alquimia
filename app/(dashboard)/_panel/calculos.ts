// Contenido del Panel principal: lo que conviene ver apenas se entra a la app.
// Funciones puras sobre los mismos datos que usa Estadísticas (ver
// estadisticas/calculos.ts); acá solo se elige qué mostrar y cómo.

import type { EChartsOption } from "echarts";
import { comprasEn, enMaceracion, porBucket, resumenVentas, stockLotes, sumarPor, ventasEn, type Datos } from "../estadisticas/calculos";
import { COLOR, PALETA, barras } from "../estadisticas/graficos";
import { fmtCantidad, fmtMoneda, fmtNumero } from "../estadisticas/formato";
import { buckets, diasEntre, parse, iso, resolverPeriodo, sumarDias, type Rango } from "../estadisticas/periodo";
import { construirAlertas, deltaEntre, nombreCorto, type Alerta, type Kpi } from "../estadisticas/secciones";

/** Una fila de las listas "Últimas ventas", "Últimas compras" y "Producción". */
export type FilaPanel = {
  id: string;
  fecha: string;
  titulo: string;
  detalle: string;
  valor: string;
  /** Pastilla de estado (solo en Producción). */
  estado?: { texto: string; tono: "activo" | "neutro" };
  href: string;
};

export type Panel = {
  kpis: Kpi[];
  grafico: { option: EChartsOption; total: string; vacio?: string };
  alertas: Alerta[];
  ventas: FilaPanel[];
  compras: FilaPanel[];
  produccion: FilaPanel[];
};

const FILAS = 5;
const SEMANAS = 12;

const ddmm = (fecha: string) => fecha.split("-").reverse().slice(0, 2).join("/");

/** Del 1° del mes a hoy, y el mismo tramo del mes anterior (sin pasarse de su último día). */
function mesYAnterior(hoy: string): { mes: Rango; anterior: Rango } {
  const mes = resolverPeriodo("mes", { desde: hoy, hasta: hoy }, hoy);
  const d = parse(hoy);
  const finAnterior = iso(new Date(d.getFullYear(), d.getMonth(), 0));
  const mismoDia = iso(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
  return {
    mes,
    anterior: { desde: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), hasta: mismoDia < finAnterior ? mismoDia : finAnterior },
  };
}

export function construirPanel(d: Datos): Panel {
  const { mes, anterior } = mesYAnterior(d.hoy);
  const dias = buckets(mes, "dia");

  const ventasMes = ventasEn(d, mes);
  const rv = resumenVentas(ventasMes);
  const rvAnt = resumenVentas(ventasEn(d, anterior));

  const lotes = stockLotes(d);
  const conStock = lotes.filter((l) => l.saldo > 0);
  const botellas = conStock.reduce((s, l) => s + l.saldo, 0);
  const porProducto = sumarPor(conStock, (l) => nombreCorto(l.producto), (l) => l.saldo);

  const macerando = enMaceracion(d).sort((a, b) => (a.fechaMaceracion < b.fechaMaceracion ? -1 : 1));
  const estimadas = macerando.reduce((s, o) => s + o.cantidadProducida, 0);

  const comprasMes = comprasEn(d, mes);
  const gasto = comprasMes.reduce((s, c) => s + c.total, 0);
  const gastoAnt = comprasEn(d, anterior).reduce((s, c) => s + c.total, 0);

  const alertas = construirAlertas(d);
  const cuantas = (nivel: Alerta["nivel"]) => alertas.filter((a) => a.nivel === nivel).length;

  const kpis: Kpi[] = [
    {
      id: "p-ventas",
      etiqueta: "Ventas del mes",
      nota: `${fmtNumero(rv.operaciones)} op.`,
      valor: fmtMoneda(rv.facturacion),
      delta: deltaEntre(rv.facturacion, rvAnt.facturacion, "sube"),
      tendencia: porBucket(ventasMes, (o) => o.fecha, (o) => o.subTotal, dias),
      destino: { href: "/operaciones" },
    },
    {
      id: "p-unidades",
      etiqueta: "Botellas vendidas",
      nota: "en el mes",
      valor: fmtNumero(rv.unidades),
      delta: deltaEntre(rv.unidades, rvAnt.unidades, "sube"),
      tendencia: porBucket(ventasMes, (o) => o.fecha, (o) => o.cantidad, dias),
      destino: { href: "/operaciones" },
    },
    {
      id: "p-stock",
      etiqueta: "Botellas en stock",
      nota: `${conStock.length} lotes`,
      valor: fmtNumero(botellas),
      composicion: porProducto.slice(0, PALETA.length).map((p, i) => ({ nombre: p.nombre, valor: p.valor, color: PALETA[i] })),
      destino: { href: "/productos-terminados" },
    },
    {
      id: "p-macerando",
      etiqueta: "Órdenes macerando",
      nota: estimadas ? `≈ ${fmtNumero(estimadas)} botellas` : undefined,
      valor: fmtNumero(macerando.length),
      composicion: macerando.map((o, i) => ({ nombre: `N° ${o.id} · ${nombreCorto(`${o.producto} — ${o.formato}`)}`, valor: o.cantidadProducida, color: PALETA[i % PALETA.length] })),
      destino: { href: "/ordenes-produccion" },
    },
    {
      id: "p-compras",
      etiqueta: "Compras del mes",
      nota: `${fmtNumero(comprasMes.length)} op.`,
      valor: fmtMoneda(gasto),
      delta: deltaEntre(gasto, gastoAnt, "baja"),
      tendencia: porBucket(comprasMes, (c) => c.fecha, (c) => c.total, dias),
      destino: { href: "/trazabilidad" },
    },
    {
      id: "p-alertas",
      etiqueta: "Alertas",
      nota: cuantas("critico") ? `${cuantas("critico")} críticas` : alertas.length ? "para revisar" : "todo en orden",
      valor: fmtNumero(alertas.length),
      composicion: [
        { nombre: "Críticas", valor: cuantas("critico"), color: COLOR.rojo },
        { nombre: "Avisos", valor: cuantas("aviso"), color: COLOR.ambar },
        { nombre: "Para tener en cuenta", valor: cuantas("info"), color: COLOR.gris },
      ],
      destino: { seccion: "stock", foco: "stock-alertas" },
    },
  ];

  // Gráfico: facturación por semana de las últimas 12 semanas (hasta hoy).
  const semanas = buckets({ desde: sumarDias(d.hoy, -(SEMANAS * 7 - 1)), hasta: d.hoy }, "semana");
  const ventas12 = ventasEn(d, { desde: semanas[0].desde, hasta: d.hoy });
  const porSemana = porBucket(ventas12, (o) => o.fecha, (o) => o.subTotal, semanas);
  const grafico = {
    option: barras(
      semanas.map((s) => ddmm(s.desde)),
      porSemana,
      "moneda",
      { nombre: "Facturación" }
    ),
    total: fmtMoneda(porSemana.reduce((s, v) => s + v, 0)),
    vacio: ventas12.length ? undefined : "Sin ventas en las últimas 12 semanas",
  };

  const ventas: FilaPanel[] = [...d.operaciones]
    .sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1))
    .slice(0, FILAS)
    .map((o) => ({
      id: `v-${o.id}`,
      fecha: ddmm(o.fecha),
      titulo: o.cliente,
      detalle: `${fmtNumero(o.cantidad)} × ${nombreCorto(o.descripcion)}`,
      valor: fmtMoneda(o.subTotal),
      href: "/operaciones",
    }));

  const compras: FilaPanel[] = comprasEn(d, null)
    .sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1))
    .slice(0, FILAS)
    .map((c) => ({
      id: `c-${c.id}`,
      fecha: ddmm(c.fecha),
      titulo: c.materia,
      detalle: `${fmtCantidad(c.cantidad, c.unidad)} · ${c.proveedor}`,
      valor: fmtMoneda(c.total),
      href: "/trazabilidad",
    }));

  // Producción: primero lo que está macerando; el resto, lo último embotellado (lleva a su lote).
  const embotelladas = d.ordenes
    .filter((o) => o.fechaEmbotellado)
    .sort((a, b) => (a.fechaEmbotellado! < b.fechaEmbotellado! ? 1 : -1));
  const produccion: FilaPanel[] = [
    ...macerando.map((o) => ({
      id: `o-${o.id}`,
      fecha: ddmm(o.fechaMaceracion),
      titulo: `N° ${o.id} · ${nombreCorto(`${o.producto} — ${o.formato}`)}`,
      detalle: `${o.responsable} · ≈ ${fmtNumero(o.cantidadProducida)} botellas`,
      valor: `Día ${fmtNumero(diasEntre(o.fechaMaceracion, d.hoy) + 1)}`,
      estado: { texto: "Macerando", tono: "activo" as const },
      href: "/ordenes-produccion",
    })),
    ...embotelladas.map((o) => {
      const lote = d.lotes.find((l) => l.origenOrdenId === o.id);
      return {
        id: `o-${o.id}`,
        fecha: ddmm(o.fechaEmbotellado!),
        titulo: `N° ${o.id} · ${nombreCorto(`${o.producto} — ${o.formato}`)}`,
        detalle: `${o.responsable} · ${fmtNumero(diasEntre(o.fechaMaceracion, o.fechaEmbotellado!))} días de maceración`,
        valor: `${fmtNumero(o.cantidadProducida)} u.`,
        estado: { texto: "Embotellada", tono: "neutro" as const },
        href: lote ? `/productos-terminados?foco=${lote.id}` : "/ordenes-produccion",
      };
    }),
  ].slice(0, FILAS);

  return { kpis, grafico, alertas, ventas, compras, produccion };
}
