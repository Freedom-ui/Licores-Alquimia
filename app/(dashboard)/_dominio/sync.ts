// Sincronizaciones entre secciones (ver el diagrama en store.tsx). Sin React
// ni base de datos: las corre acciones.ts en el servidor, dentro de la
// transacción de cada cambio, y demo.ts para armar los datos de prueba.

import type { OrdenProduccionRow } from "../ordenes-produccion/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { InventarioMateriaPrimaRow } from "../inventario-materia-prima/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import { costoStockDeCompra, stockDeCompra, type CompraRow } from "../trazabilidad/data";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";

export function nextId<T extends { id: number }>(rows: T[]): number {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Sincronizaciones entre secciones ────────────────────────────────────────
// Funciones puras: las usan las acciones al guardar/borrar, y también el
// seed para armar los datos de demo (así el demo es exactamente lo que daría
// cargar todo a mano). Cada movimiento generado queda "tageado" con su
// origen (origenCompraId / origenOrdenId / origenOperacionId) para poder
// actualizarlo o borrarlo en cascada en vez de duplicarlo.

/** Cuánto de una compra ya está asignado a órdenes de producción. */
export function usadoDeCompra(ordenes: OrdenProduccionRow[], compraId: number, excluirOrdenId?: number): number {
  let total = 0;
  for (const o of ordenes) {
    if (o.id === excluirOrdenId) continue;
    for (const i of o.insumos) if (i.compraId === compraId) total += i.cantidad;
  }
  return round2(total);
}

// Libro de compras → Inventario de materia prima: cada compra es un ingreso.
// Si la materia prima todavía no estaba en el inventario, se agrega sola. Un
// cítrico con kilos de cáscara ingresa la cáscara (ver stockDeCompra).
export function quitarEntradaDeCompra(rows: InventarioMateriaPrimaRow[], compraId: number): InventarioMateriaPrimaRow[] {
  return rows.map((r) =>
    r.movimientos.some((m) => m.origenCompraId === compraId)
      ? { ...r, movimientos: r.movimientos.filter((m) => m.origenCompraId !== compraId) }
      : r
  );
}

export function syncEntradaParaCompra(rows: InventarioMateriaPrimaRow[], compra: CompraRow): InventarioMateriaPrimaRow[] {
  const limpias = quitarEntradaDeCompra(rows, compra.id);
  const movimiento: Omit<KardexMovimiento, "id"> = {
    fecha: compra.fecha,
    tipo: "entrada",
    cantidad: stockDeCompra(compra),
    puEntrada: costoStockDeCompra(compra),
    cantidadSecundaria: compra.cantidadCascara || undefined,
    origenCompraId: compra.id,
  };
  const existente = limpias.find((r) => r.materiaPrimaId === compra.materiaPrimaId);
  if (!existente) {
    return [
      ...limpias,
      {
        id: nextId(limpias),
        materiaPrimaId: compra.materiaPrimaId,
        existenciaInicial: 0,
        costoUnitario: costoStockDeCompra(compra),
        movimientos: [{ id: 1, ...movimiento }],
      },
    ];
  }
  return limpias.map((r) =>
    r.id === existente.id ? { ...r, movimientos: [...r.movimientos, { id: nextId(r.movimientos), ...movimiento }] } : r
  );
}

// Órdenes de producción → Inventario de materia prima: cada insumo que esté
// en el inventario genera un consumo. Detalles:
//  - Si la misma materia prima se repite (ej. alcohol de dos compras), se
//    suma en un solo consumo.
//  - Se fecha con la fecha de maceración.
//  - Los insumos que no están en el inventario se ignoran, sin bloquear.
//  - Si no alcanza el saldo no se bloquea: queda en negativo (rojo en pantalla).
export function quitarConsumosDeOrden(rows: InventarioMateriaPrimaRow[], ordenId: number): InventarioMateriaPrimaRow[] {
  return rows.map((r) =>
    r.movimientos.some((m) => m.origenOrdenId === ordenId)
      ? { ...r, movimientos: r.movimientos.filter((m) => m.origenOrdenId !== ordenId) }
      : r
  );
}

export function syncConsumosParaOrden(
  rows: InventarioMateriaPrimaRow[],
  orden: OrdenProduccionRow,
  materiaPrima: MateriaPrimaRow[]
): InventarioMateriaPrimaRow[] {
  const cantidadPorMateria = new Map<number, number>();
  for (const insumo of orden.insumos) {
    const mp = materiaPrima.find((m) => m.nombre === insumo.materiaPrima);
    if (!mp) continue;
    cantidadPorMateria.set(mp.id, (cantidadPorMateria.get(mp.id) ?? 0) + insumo.cantidad);
  }

  return quitarConsumosDeOrden(rows, orden.id).map((r) => {
    const cantidad = cantidadPorMateria.get(r.materiaPrimaId);
    if (!cantidad) return r;
    return {
      ...r,
      movimientos: [
        ...r.movimientos,
        { id: nextId(r.movimientos), fecha: orden.fechaMaceracion, tipo: "salida", cantidad: round2(cantidad), origenOrdenId: orden.id },
      ],
    };
  });
}

// Órdenes de producción → Productos terminados: al embotellarse, la orden
// crea o actualiza su lote (existencia = cantidad producida, costo unitario =
// costo total / cantidad). Si se borra la fecha de embotellado, el lote
// auto-generado se quita — salvo que ya tenga ventas, para no perder historial.
export function syncLoteParaOrden(lotes: LoteTerminado[], orden: OrdenProduccionRow): LoteTerminado[] {
  if (!orden.fechaEmbotellado) {
    return lotes.filter((l) => !(l.origenOrdenId === orden.id && l.movimientos.length === 0));
  }
  // Embotellada siempre tiene cantidad (la regla la exige); el ?? es solo para los tipos.
  const cantidad = orden.cantidadProducida ?? 0;
  const costoUnitario = cantidad > 0 ? round2(orden.costoTotal / cantidad) : 0;
  const existente = lotes.find((l) => l.origenOrdenId === orden.id);
  if (existente) {
    return lotes.map((l) =>
      l.id === existente.id
        ? {
            ...l,
            productoId: orden.productoId,
            producto: orden.producto,
            formato: orden.formato,
            existenciaInicial: cantidad,
            costoUnitario,
          }
        : l
    );
  }
  return [
    ...lotes,
    {
      id: nextId(lotes),
      lote: orden.id,
      productoId: orden.productoId,
      origenOrdenId: orden.id,
      producto: orden.producto,
      formato: orden.formato,
      existenciaInicial: cantidad,
      costoUnitario,
      fechaVencimiento: null,
      movimientos: [],
    },
  ];
}

export function saldoLote(l: LoteTerminado): number {
  return l.movimientos.reduce((s, m) => (m.tipo === "entrada" ? s + m.cantidad : s - m.cantidad), l.existenciaInicial);
}

/** Saldo de una materia prima en el inventario (mismo cálculo que el kardex, sin valorizar). */
export function saldoInventario(r: InventarioMateriaPrimaRow): number {
  return round2(r.movimientos.reduce((s, m) => (m.tipo === "entrada" ? s + m.cantidad : s - m.cantidad), r.existenciaInicial));
}

export function quitarSalidaDeOperacion(lotes: LoteTerminado[], operacionId: number): LoteTerminado[] {
  return lotes.map((l) =>
    l.movimientos.some((m) => m.origenOperacionId === operacionId)
      ? { ...l, movimientos: l.movimientos.filter((m) => m.origenOperacionId !== operacionId) }
      : l
  );
}

// ── Operaciones → Productos terminados: FIFO por fechas ──
// Cada venta descuenta de los lotes de su producto ya embotellados a la fecha
// de la venta, del más viejo al más nuevo (los lotes con stock previo al
// sistema cuentan como disponibles desde siempre). Si no alcanza, el faltante
// queda en negativo en el último lote disponible a esa fecha (falta
// embotellar); si a esa fecha no había ningún lote, la venta queda sin lote.
//
// Se recalculan juntas todas las ventas del producto, en orden de fecha: así
// cargar, editar o borrar una venta vieja (o cambiar un embotellado)
// reacomoda las posteriores, y el resultado no depende del orden en que se
// cargaron (ej. la importación de la planilla). Para trazabilidad importa
// saber a qué cliente fue cada lote.

type VentaFifo = { id: number; productoId: number; fecha: string; cantidad: number };
type OrdenFifo = { id: number; fechaEmbotellado: string | null };

export type AsignacionFifo = {
  /** loteId → (operacionId → cantidad que esa venta tomó del lote). */
  porLote: Map<number, Map<number, number>>;
  /** operacionId → botellas que no se pudieron cubrir con stock a su fecha. */
  faltantes: Map<number, number>;
  /** Ventas sin ningún lote embotellado a su fecha (no descuentan de ninguno). */
  sinLote: number[];
};

/** Fecha desde la que se puede vender de un lote; null = todavía no se puede (su orden macera). */
function disponibleDesde(l: LoteTerminado, embotellado: Map<number, string | null>): string | null {
  if (l.origenOrdenId === undefined || !embotellado.has(l.origenOrdenId)) return "";
  return embotellado.get(l.origenOrdenId) ?? null;
}

/** Saldo de un lote sin contar las ventas (existencia + movimientos cargados a mano). */
function saldoSinVentas(l: LoteTerminado): number {
  return l.movimientos.reduce(
    (s, m) => (m.origenOperacionId !== undefined ? s : m.tipo === "entrada" ? s + m.cantidad : s - m.cantidad),
    l.existenciaInicial
  );
}

export function asignarFifo(
  lotes: LoteTerminado[],
  operaciones: VentaFifo[],
  ordenes: OrdenFifo[],
  productoId: number
): AsignacionFifo {
  const embotellado = new Map(ordenes.map((o) => [o.id, o.fechaEmbotellado]));
  const candidatos = lotes
    .filter((l) => l.productoId === productoId)
    .map((l) => ({ l, desde: disponibleDesde(l, embotellado) }))
    .filter((c): c is { l: LoteTerminado; desde: string } => c.desde !== null)
    .sort((a, b) => a.desde.localeCompare(b.desde) || a.l.lote - b.l.lote || a.l.id - b.l.id);
  const saldo = new Map(candidatos.map((c) => [c.l.id, saldoSinVentas(c.l)]));
  const porLote = new Map<number, Map<number, number>>();
  const faltantes = new Map<number, number>();
  const sinLote: number[] = [];

  const asignar = (loteId: number, opId: number, cantidad: number) => {
    const delLote = porLote.get(loteId) ?? new Map<number, number>();
    delLote.set(opId, round2((delLote.get(opId) ?? 0) + cantidad));
    porLote.set(loteId, delLote);
    saldo.set(loteId, round2(saldo.get(loteId)! - cantidad));
  };

  const ventas = operaciones
    .filter((o) => o.productoId === productoId)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  for (const v of ventas) {
    const elegibles = candidatos.filter((c) => c.desde <= v.fecha);
    if (elegibles.length === 0) {
      sinLote.push(v.id);
      faltantes.set(v.id, v.cantidad);
      continue;
    }
    let restante = v.cantidad;
    for (const { l } of elegibles) {
      if (restante <= 0) break;
      const disponible = saldo.get(l.id)!;
      if (disponible <= 0) continue;
      const toma = Math.min(disponible, restante);
      asignar(l.id, v.id, toma);
      restante = round2(restante - toma);
    }
    if (restante > 0) {
      asignar(elegibles[elegibles.length - 1].l.id, v.id, restante);
      faltantes.set(v.id, restante);
    }
  }
  return { porLote, faltantes, sinLote };
}

/** Total de botellas vendidas sin stock a su fecha, para un producto. */
export function faltanteDeProducto(
  lotes: LoteTerminado[],
  operaciones: VentaFifo[],
  ordenes: OrdenFifo[],
  productoId: number
): number {
  let total = 0;
  for (const f of asignarFifo(lotes, operaciones, ordenes, productoId).faltantes.values()) total += f;
  return round2(total);
}

/**
 * Vuelve a asignar las ventas de los productos indicados a sus lotes. Respeta
 * los movimientos cargados a mano y el id de cada salida que ya existía (así
 * la base guarda solo lo que cambió).
 */
export function recalcularFifo(
  lotes: LoteTerminado[],
  operaciones: VentaFifo[],
  ordenes: OrdenFifo[],
  productoIds: Iterable<number>
): LoteTerminado[] {
  const productos = new Set(productoIds);
  if (productos.size === 0) return lotes;
  const porLote = new Map<number, Map<number, number>>();
  for (const productoId of productos) {
    for (const [loteId, ventas] of asignarFifo(lotes, operaciones, ordenes, productoId).porLote) porLote.set(loteId, ventas);
  }
  const fechaDe = new Map(operaciones.map((o) => [o.id, o.fecha]));

  return lotes.map((l) => {
    if (l.productoId === undefined || !productos.has(l.productoId)) return l;
    const asignadas = new Map(porLote.get(l.id) ?? []);
    if (asignadas.size === 0 && !l.movimientos.some((m) => m.origenOperacionId !== undefined)) return l;

    let siguiente = nextId(l.movimientos);
    let cambio = false;
    const movimientos: KardexMovimiento[] = [];
    for (const m of l.movimientos) {
      if (m.origenOperacionId === undefined) {
        movimientos.push(m);
        continue;
      }
      const cantidad = asignadas.get(m.origenOperacionId);
      if (cantidad === undefined) {
        cambio = true;
        continue;
      }
      asignadas.delete(m.origenOperacionId);
      const fecha = fechaDe.get(m.origenOperacionId)!;
      if (m.cantidad === cantidad && m.fecha === fecha && m.tipo === "salida") movimientos.push(m);
      else {
        cambio = true;
        movimientos.push({ ...m, fecha, tipo: "salida", cantidad });
      }
    }
    for (const [opId, cantidad] of asignadas) {
      cambio = true;
      movimientos.push({ id: siguiente++, fecha: fechaDe.get(opId)!, tipo: "salida", cantidad, origenOperacionId: opId });
    }
    return cambio ? { ...l, movimientos } : l;
  });
}
