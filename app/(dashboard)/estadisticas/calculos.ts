// Métricas de Estadísticas. Todo sale de los datos que ya cargan las otras
// secciones (nada se carga a mano acá): Operaciones (ventas), Órdenes de
// producción, Productos terminados (lotes), Inventario de materia prima y
// Libro de compras. Funciones puras: las usan tanto la pantalla como el PDF.
//
// Costo de lo vendido: es exacto, no estimado — cada venta descuenta de lotes
// concretos (salidas tageadas con origenOperacionId) y cada lote tiene su
// costo unitario (el de su orden de producción). Las ventas de productos sin
// lote cargado quedan "sin costo" y se informan aparte (cobertura).

import { buildKardex } from "@/app/components/data-table/kardex";
import type { OperacionRow } from "../operaciones/data";
import type { OrdenProduccionRow } from "../ordenes-produccion/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { InventarioMateriaPrimaRow } from "../inventario-materia-prima/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import type { ProveedorRow } from "../proveedores/data";
import type { CompraRow, MedioPago } from "../trazabilidad/data";
import { nombreMedioPago } from "../trazabilidad/data";
import { diasEntre, enRango, sumarDias, type Bucket, type Rango } from "./periodo";

export type Datos = {
  hoy: string;
  operaciones: OperacionRow[];
  ordenes: OrdenProduccionRow[];
  lotes: LoteTerminado[];
  inventario: InventarioMateriaPrimaRow[];
  materiaPrima: MateriaPrimaRow[];
  compras: CompraRow[];
  proveedores: ProveedorRow[];
};

export type Par = { nombre: string; valor: number };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sumarPor<T>(items: T[], clave: (i: T) => string, valor: (i: T) => number): Par[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(clave(i), (m.get(clave(i)) ?? 0) + valor(i));
  return [...m].map(([nombre, v]) => ({ nombre, valor: round2(v) })).sort((a, b) => b.valor - a.valor);
}

/** Agrupa lo que exceda los primeros `n` en "Otros". */
export function topN(pares: Par[], n: number): Par[] {
  if (pares.length <= n) return pares;
  const otros = pares.slice(n).reduce((s, p) => s + p.valor, 0);
  return [...pares.slice(0, n), { nombre: "Otros", valor: round2(otros) }];
}

export function porBucket<T>(items: T[], fecha: (i: T) => string | null | undefined, valor: (i: T) => number, bs: Bucket[]): number[] {
  return bs.map((b) => round2(items.reduce((s, i) => (enRango(fecha(i), b) ? s + valor(i) : s), 0)));
}

export function variacion(actual: number, previo: number | null | undefined): number | null {
  if (previo === null || previo === undefined || previo === 0) return null;
  return (actual - previo) / Math.abs(previo);
}

// ── Ventas y costo de lo vendido ────────────────────────────────────────────

export function productoDeOperacion(op: OperacionRow): string {
  return op.descripcion || "Producto sin nombre";
}

/** Costo de una venta según los lotes de los que salió. `cubierta` = unidades con costo conocido. */
export function costoDeOperacion(op: OperacionRow, lotes: LoteTerminado[]): { costo: number; cubierta: number } {
  let costo = 0;
  let cubierta = 0;
  for (const l of lotes) {
    for (const m of l.movimientos) {
      if (m.tipo !== "salida" || m.origenOperacionId !== op.id) continue;
      costo += m.cantidad * l.costoUnitario;
      cubierta += m.cantidad;
    }
  }
  return { costo: round2(costo), cubierta };
}

export type VentaConCosto = OperacionRow & { costo: number; conCosto: boolean };

export function ventasEn(d: Datos, r: Rango): VentaConCosto[] {
  return d.operaciones
    .filter((op) => enRango(op.fecha, r))
    .map((op) => {
      const { costo, cubierta } = costoDeOperacion(op, d.lotes);
      return { ...op, costo, conCosto: cubierta >= op.cantidad - 1e-9 && op.cantidad > 0 };
    });
}

export type ResumenVentas = {
  facturacion: number;
  unidades: number;
  operaciones: number;
  ticket: number;
  precioUnidad: number;
  clientes: number;
  /** Solo ventas con costo conocido. */
  facturacionConCosto: number;
  costo: number;
  margen: number;
  margenPct: number | null;
  cobertura: number | null;
};

export function resumenVentas(v: VentaConCosto[]): ResumenVentas {
  const facturacion = round2(v.reduce((s, o) => s + o.subTotal, 0));
  const unidades = v.reduce((s, o) => s + o.cantidad, 0);
  const conCosto = v.filter((o) => o.conCosto);
  const facturacionConCosto = round2(conCosto.reduce((s, o) => s + o.subTotal, 0));
  const costo = round2(conCosto.reduce((s, o) => s + o.costo, 0));
  const margen = round2(facturacionConCosto - costo);
  return {
    facturacion,
    unidades,
    operaciones: v.length,
    ticket: v.length ? round2(facturacion / v.length) : 0,
    precioUnidad: unidades ? round2(facturacion / unidades) : 0,
    clientes: new Set(v.map((o) => o.clienteId)).size,
    facturacionConCosto,
    costo,
    margen,
    margenPct: facturacionConCosto > 0 ? margen / facturacionConCosto : null,
    cobertura: facturacion > 0 ? facturacionConCosto / facturacion : null,
  };
}

export type ClienteRanking = { cliente: string; operaciones: number; unidades: number; facturacion: number; participacion: number; ultimaCompra: string };

export function rankingClientes(v: VentaConCosto[]): ClienteRanking[] {
  const total = v.reduce((s, o) => s + o.subTotal, 0);
  const m = new Map<string, ClienteRanking>();
  for (const o of v) {
    const c = m.get(o.cliente) ?? { cliente: o.cliente, operaciones: 0, unidades: 0, facturacion: 0, participacion: 0, ultimaCompra: o.fecha };
    c.operaciones++;
    c.unidades += o.cantidad;
    c.facturacion += o.subTotal;
    if (o.fecha > c.ultimaCompra) c.ultimaCompra = o.fecha;
    m.set(o.cliente, c);
  }
  return [...m.values()]
    .map((c) => ({ ...c, facturacion: round2(c.facturacion), participacion: total ? c.facturacion / total : 0 }))
    .sort((a, b) => b.facturacion - a.facturacion);
}

export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function ventasPorDiaSemana(v: VentaConCosto[]): number[] {
  const tot = [0, 0, 0, 0, 0, 0, 0];
  for (const o of v) {
    const [y, m, d] = o.fecha.split("-").map(Number);
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
    tot[dow] += o.subTotal;
  }
  return tot.map(round2);
}

export { sumarPor };

export type RentabilidadProducto = {
  producto: string;
  unidades: number;
  facturacion: number;
  costo: number;
  margen: number;
  margenPct: number | null;
  precioPromedio: number;
  costoUnitario: number;
};

export function rentabilidadPorProducto(v: VentaConCosto[]): RentabilidadProducto[] {
  const m = new Map<string, { unidades: number; facturacion: number; costo: number }>();
  for (const o of v.filter((x) => x.conCosto)) {
    const k = productoDeOperacion(o);
    const a = m.get(k) ?? { unidades: 0, facturacion: 0, costo: 0 };
    a.unidades += o.cantidad;
    a.facturacion += o.subTotal;
    a.costo += o.costo;
    m.set(k, a);
  }
  return [...m]
    .map(([producto, a]) => ({
      producto,
      unidades: a.unidades,
      facturacion: round2(a.facturacion),
      costo: round2(a.costo),
      margen: round2(a.facturacion - a.costo),
      margenPct: a.facturacion ? (a.facturacion - a.costo) / a.facturacion : null,
      precioPromedio: a.unidades ? round2(a.facturacion / a.unidades) : 0,
      costoUnitario: a.unidades ? round2(a.costo / a.unidades) : 0,
    }))
    .sort((a, b) => b.margen - a.margen);
}

// ── Producción ──────────────────────────────────────────────────────────────

export type ResumenProduccion = {
  embotelladas: OrdenProduccionRow[];
  unidades: number;
  costoTotal: number;
  costoPorBotella: number;
  diasMaceracionPromedio: number | null;
  iniciadas: number;
};

export function resumenProduccion(d: Datos, r: Rango): ResumenProduccion {
  const embotelladas = d.ordenes.filter((o) => enRango(o.fechaEmbotellado, r));
  const unidades = embotelladas.reduce((s, o) => s + o.cantidadProducida, 0);
  const costoTotal = round2(embotelladas.reduce((s, o) => s + o.costoTotal, 0));
  const dias = embotelladas.map((o) => diasEntre(o.fechaMaceracion, o.fechaEmbotellado!));
  return {
    embotelladas,
    unidades,
    costoTotal,
    costoPorBotella: unidades ? round2(costoTotal / unidades) : 0,
    diasMaceracionPromedio: dias.length ? Math.round(dias.reduce((s, x) => s + x, 0) / dias.length) : null,
    iniciadas: d.ordenes.filter((o) => enRango(o.fechaMaceracion, r)).length,
  };
}

export function enMaceracion(d: Datos): OrdenProduccionRow[] {
  return d.ordenes.filter((o) => !o.fechaEmbotellado);
}

export function insumosSinCompra(d: Datos): number {
  return d.ordenes.reduce((s, o) => s + o.insumos.filter((i) => i.compraId === undefined).length, 0);
}

export function composicionCosto(ordenes: OrdenProduccionRow[]): Par[] {
  return sumarPor(
    ordenes.flatMap((o) => o.insumos),
    (i) => i.materiaPrima,
    (i) => i.cantidad * i.costoUnitario
  );
}

// ── Stock (situación actual) ────────────────────────────────────────────────

export function saldoLote(l: LoteTerminado): number {
  return round2(l.movimientos.reduce((s, m) => (m.tipo === "entrada" ? s + m.cantidad : s - m.cantidad), l.existenciaInicial));
}

export type StockLote = {
  lote: LoteTerminado;
  producto: string;
  saldo: number;
  valor: number;
  diasParaVencer: number | null;
  ultimoMovimiento: string | null;
};

export function stockLotes(d: Datos): StockLote[] {
  return d.lotes.map((l) => {
    const orden = d.ordenes.find((o) => o.id === l.origenOrdenId);
    const fechas = [orden?.fechaEmbotellado, ...l.movimientos.map((m) => m.fecha)].filter(Boolean) as string[];
    const saldo = saldoLote(l);
    return {
      lote: l,
      producto: `${l.producto} — ${l.formato}`,
      saldo,
      valor: round2(Math.max(saldo, 0) * l.costoUnitario),
      diasParaVencer: l.fechaVencimiento ? diasEntre(d.hoy, l.fechaVencimiento) : null,
      ultimoMovimiento: fechas.length ? fechas.sort().at(-1)! : null,
    };
  });
}

export type EstadoMateria = "sin-stock" | "bajo" | "ok" | "sin-consumo";

export type StockMateria = {
  rowId: number;
  materiaPrimaId: number;
  nombre: string;
  unidad: string;
  saldo: number;
  valor: number;
  /** Consumo promedio de las órdenes que la usaron. */
  consumoPorOrden: number | null;
  /** Cuántas órdenes alcanza a cubrir el saldo actual. */
  ordenesQueAlcanza: number | null;
  /** Días de stock según el consumo de los últimos 90 días. */
  diasDeStock: number | null;
  estado: EstadoMateria;
};

export function stockMaterias(d: Datos): StockMateria[] {
  const desde90 = sumarDias(d.hoy, -89);
  return d.inventario.map((r) => {
    const mp = d.materiaPrima.find((m) => m.id === r.materiaPrimaId);
    const kardex = buildKardex(r.existenciaInicial, r.costoUnitario, r.movimientos);
    const ultima = kardex[kardex.length - 1];
    const porOrden = new Map<number, number>();
    for (const m of r.movimientos) {
      if (m.tipo === "salida" && m.origenOrdenId !== undefined) porOrden.set(m.origenOrdenId, (porOrden.get(m.origenOrdenId) ?? 0) + m.cantidad);
    }
    const consumos = [...porOrden.values()];
    const consumoPorOrden = consumos.length ? round2(consumos.reduce((s, x) => s + x, 0) / consumos.length) : null;
    const consumo90 = r.movimientos
      .filter((m) => m.tipo === "salida" && m.fecha && m.fecha >= desde90 && m.fecha <= d.hoy)
      .reduce((s, m) => s + m.cantidad, 0);
    const saldo = ultima.saldoC;
    const estado: EstadoMateria =
      saldo <= 0 ? "sin-stock" : consumoPorOrden === null ? "sin-consumo" : saldo < consumoPorOrden ? "bajo" : "ok";
    return {
      rowId: r.id,
      materiaPrimaId: r.materiaPrimaId,
      nombre: mp?.nombre ?? "Materia prima eliminada",
      unidad: mp?.unidad ?? "",
      saldo,
      valor: round2(Math.max(ultima.saldoPT, 0)),
      consumoPorOrden,
      ordenesQueAlcanza: consumoPorOrden ? Math.floor(Math.max(saldo, 0) / consumoPorOrden) : null,
      diasDeStock: consumo90 > 0 ? Math.round(Math.max(saldo, 0) / (consumo90 / 90)) : null,
      estado,
    };
  });
}

// ── Compras ─────────────────────────────────────────────────────────────────

export type CompraDetalle = CompraRow & { total: number; proveedor: string; materia: string; unidad: string; medio: string };

export function comprasEn(d: Datos, r: Rango | null): CompraDetalle[] {
  return d.compras
    .filter((c) => !r || enRango(c.fecha, r))
    .map((c) => {
      const mp = d.materiaPrima.find((m) => m.id === c.materiaPrimaId);
      return {
        ...c,
        total: round2(c.cantidad * c.costoUnitario),
        proveedor: d.proveedores.find((p) => p.id === c.proveedorId)?.razonSocial ?? "Proveedor eliminado",
        materia: mp?.nombre ?? "Materia prima eliminada",
        unidad: mp?.unidad ?? "",
        medio: nombreMedioPago(c.medioPago as MedioPago),
      };
    });
}

export type VariacionPrecio = { materia: string; unidad: string; primero: number; ultimo: number; variacion: number | null; compras: number; ultimaFecha: string };

/** Precio de la primera y la última compra de cada materia prima (en todo el historial hasta `hasta`). */
export function variacionPrecios(d: Datos, hasta: string): VariacionPrecio[] {
  const porMateria = new Map<string, CompraDetalle[]>();
  for (const c of comprasEn(d, null).filter((x) => x.fecha <= hasta)) {
    porMateria.set(c.materia, [...(porMateria.get(c.materia) ?? []), c]);
  }
  return [...porMateria].map(([materia, cs]) => {
    const orden = [...cs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id));
    const primero = orden[0].costoUnitario;
    const ultimo = orden[orden.length - 1].costoUnitario;
    return { materia, unidad: orden[0].unidad, primero, ultimo, variacion: variacion(ultimo, primero), compras: cs.length, ultimaFecha: orden[orden.length - 1].fecha };
  }).sort((a, b) => Math.abs(b.variacion ?? 0) - Math.abs(a.variacion ?? 0) || a.materia.localeCompare(b.materia, "es"));
}
