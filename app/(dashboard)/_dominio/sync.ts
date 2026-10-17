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
  const costoUnitario = orden.cantidadProducida > 0 ? round2(orden.costoTotal / orden.cantidadProducida) : 0;
  const existente = lotes.find((l) => l.origenOrdenId === orden.id);
  if (existente) {
    return lotes.map((l) =>
      l.id === existente.id
        ? {
            ...l,
            productoId: orden.productoId,
            producto: orden.producto,
            formato: orden.formato,
            existenciaInicial: orden.cantidadProducida,
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
      existenciaInicial: orden.cantidadProducida,
      costoUnitario,
      fechaVencimiento: null,
      movimientos: [],
    },
  ];
}

// Operaciones → Productos terminados: una venta descuenta del lote más viejo
// de ese producto que todavía tenga stock (FIFO); si no alcanza, sigue con el
// siguiente lote, y lo que exceda a todo el stock queda en el último (saldo
// negativo = falta embotellar). Antes descontaba siempre del primer lote,
// aunque estuviera agotado, y la venta quedaba atribuida al lote equivocado:
// para trazabilidad importa saber a qué cliente fue cada lote.
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

export function syncSalidaParaOperacion(
  lotes: LoteTerminado[],
  operacion: { id: number; productoId: number; fecha: string; cantidad: number }
): LoteTerminado[] {
  const limpios = quitarSalidaDeOperacion(lotes, operacion.id);
  // Primero los lotes con stock previo al sistema (no vienen de una orden: son
  // los más viejos), después por número de lote.
  const candidatos = limpios
    .filter((l) => l.productoId === operacion.productoId)
    .sort((a, b) => Number(a.origenOrdenId !== undefined) - Number(b.origenOrdenId !== undefined) || a.lote - b.lote || a.id - b.id);
  if (candidatos.length === 0) return limpios;

  const asignado = new Map<number, number>();
  let restante = operacion.cantidad;
  for (const l of candidatos) {
    if (restante <= 0) break;
    const disponible = saldoLote(l);
    if (disponible <= 0) continue;
    const toma = Math.min(disponible, restante);
    asignado.set(l.id, toma);
    restante = round2(restante - toma);
  }
  if (restante > 0) {
    const ultimo = candidatos[candidatos.length - 1];
    asignado.set(ultimo.id, (asignado.get(ultimo.id) ?? 0) + restante);
  }

  return limpios.map((l) => {
    const cantidad = asignado.get(l.id);
    if (!cantidad) return l;
    return {
      ...l,
      movimientos: [
        ...l.movimientos,
        { id: nextId(l.movimientos), fecha: operacion.fecha, tipo: "salida", cantidad: round2(cantidad), origenOperacionId: operacion.id },
      ],
    };
  });
}
