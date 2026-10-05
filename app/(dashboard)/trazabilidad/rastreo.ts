// Rastreo de punta a punta, en las dos direcciones:
//
//  - Hacia adelante (rastrearLoteProveedor): de un lote de proveedor a las
//    órdenes que lo usaron, los lotes de licor que salieron de ellas y los
//    clientes que los recibieron. Es lo que se necesita si un proveedor avisa
//    de un problema con un lote (retiro de producto).
//  - Hacia atrás (fichaDeLote): de un lote de licor a su elaboración (fecha,
//    responsable, unidades — lo que pide el punto 6.7 del reglamento PUPAA) y
//    a cada materia prima con su proveedor, lote y comprobante de compra.
//
// No estima nada: usa el vínculo que se registra en cada orden
// (OrdenInsumo.compraId) y las ventas tageadas contra cada lote.

import type { ProveedorRow } from "../proveedores/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import type { OrdenProduccionRow } from "../ordenes-produccion/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { OperacionRow } from "../operaciones/data";
import type { CompraRow } from "./data";

export type TrazaContexto = {
  compras: CompraRow[];
  proveedores: ProveedorRow[];
  materiaPrima: MateriaPrimaRow[];
  ordenes: OrdenProduccionRow[];
  lotes: LoteTerminado[];
  operaciones: OperacionRow[];
};

export type VentaTraza = { operacionId: number; fecha: string; cliente: string; cantidad: number };

export type DestinoLote = {
  ventas: VentaTraza[];
  /** Salidas cargadas a mano en Productos terminados (mermas, degustaciones…), sin cliente. */
  otrasSalidas: number;
  enStock: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function destinoDeLote(lote: LoteTerminado, operaciones: OperacionRow[]): DestinoLote {
  const ventas: VentaTraza[] = [];
  let otrasSalidas = 0;
  let saldo = lote.existenciaInicial;
  for (const m of lote.movimientos) {
    if (m.tipo === "entrada") {
      saldo += m.cantidad;
      continue;
    }
    saldo -= m.cantidad;
    const op = m.origenOperacionId ? operaciones.find((o) => o.id === m.origenOperacionId) : undefined;
    if (op) ventas.push({ operacionId: op.id, fecha: m.fecha ?? op.fecha, cliente: op.cliente, cantidad: m.cantidad });
    else otrasSalidas += m.cantidad;
  }
  ventas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.operacionId - b.operacionId));
  return { ventas, otrasSalidas: round2(otrasSalidas), enStock: round2(saldo) };
}

/** Total recibido por cliente (para la lista de a quién avisar ante un retiro). */
export function clientesDe(ventas: VentaTraza[]): { cliente: string; cantidad: number }[] {
  const porCliente = new Map<string, number>();
  for (const v of ventas) porCliente.set(v.cliente, (porCliente.get(v.cliente) ?? 0) + v.cantidad);
  return [...porCliente]
    .map(([cliente, cantidad]) => ({ cliente, cantidad: round2(cantidad) }))
    .sort((a, b) => b.cantidad - a.cantidad || a.cliente.localeCompare(b.cliente, "es"));
}

// ── Hacia adelante ──────────────────────────────────────────────────────────

export type OrdenAfectada = {
  orden: OrdenProduccionRow;
  /** Cuánto de este lote de proveedor usó la orden. */
  cantidadUsada: number;
  /** Lote de producto terminado que salió de la orden (null = todavía sin embotellar). */
  lote: LoteTerminado | null;
  destino: DestinoLote | null;
};

export type RastreoLoteProveedor = {
  /** Compras incluidas: todas las de ese mismo lote y proveedor (un lote puede comprarse en varias veces). */
  compras: CompraRow[];
  materiaPrima: MateriaPrimaRow | undefined;
  proveedor: ProveedorRow | undefined;
  totalComprado: number;
  totalUsado: number;
  ordenes: OrdenAfectada[];
  clientes: { cliente: string; cantidad: number }[];
};

export function rastrearLoteProveedor(compra: CompraRow, ctx: TrazaContexto): RastreoLoteProveedor {
  const compras = compra.lote
    ? ctx.compras
        .filter(
          (c) => c.lote === compra.lote && c.materiaPrimaId === compra.materiaPrimaId && c.proveedorId === compra.proveedorId
        )
        .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id))
    : [compra];
  const ids = new Set(compras.map((c) => c.id));

  const ordenes: OrdenAfectada[] = [];
  for (const orden of ctx.ordenes) {
    const cantidadUsada = orden.insumos.reduce(
      (sum, i) => (i.compraId !== undefined && ids.has(i.compraId) ? sum + i.cantidad : sum),
      0
    );
    if (cantidadUsada <= 0) continue;
    const lote = ctx.lotes.find((l) => l.origenOrdenId === orden.id) ?? null;
    ordenes.push({
      orden,
      cantidadUsada: round2(cantidadUsada),
      lote,
      destino: lote ? destinoDeLote(lote, ctx.operaciones) : null,
    });
  }
  ordenes.sort((a, b) => (a.orden.fechaMaceracion < b.orden.fechaMaceracion ? -1 : 1));

  const totalComprado = round2(compras.reduce((s, c) => s + c.cantidad, 0));
  const totalUsado = round2(ordenes.reduce((s, o) => s + o.cantidadUsada, 0));

  return {
    compras,
    materiaPrima: ctx.materiaPrima.find((m) => m.id === compra.materiaPrimaId),
    proveedor: ctx.proveedores.find((p) => p.id === compra.proveedorId),
    totalComprado,
    totalUsado,
    ordenes,
    clientes: clientesDe(ordenes.flatMap((o) => o.destino?.ventas ?? [])),
  };
}

// ── Hacia atrás ─────────────────────────────────────────────────────────────

export type InsumoTraza = {
  materiaPrima: string;
  unidad: string;
  cantidad: number;
  /** null = el insumo no tiene compra asociada (stock previo o no registrado). */
  compra: CompraRow | null;
  proveedor: ProveedorRow | null;
};

export type FichaLote = {
  lote: LoteTerminado;
  /** null = lote anterior al sistema, sin orden de producción registrada. */
  orden: OrdenProduccionRow | null;
  insumos: InsumoTraza[];
  destino: DestinoLote;
  clientes: { cliente: string; cantidad: number }[];
};

export function fichaDeLote(lote: LoteTerminado, ctx: TrazaContexto): FichaLote {
  const orden = lote.origenOrdenId ? ctx.ordenes.find((o) => o.id === lote.origenOrdenId) ?? null : null;
  const insumos: InsumoTraza[] = (orden?.insumos ?? []).map((i) => {
    const compra = i.compraId !== undefined ? ctx.compras.find((c) => c.id === i.compraId) ?? null : null;
    return {
      materiaPrima: i.materiaPrima,
      unidad: ctx.materiaPrima.find((m) => m.nombre === i.materiaPrima)?.unidad ?? "",
      cantidad: i.cantidad,
      compra,
      proveedor: compra ? ctx.proveedores.find((p) => p.id === compra.proveedorId) ?? null : null,
    };
  });
  const destino = destinoDeLote(lote, ctx.operaciones);
  return { lote, orden, insumos, destino, clientes: clientesDe(destino.ventas) };
}
