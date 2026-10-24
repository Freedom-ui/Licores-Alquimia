// Remito de entrega de una o varias ventas: qué se le entregó a un cliente en
// una fecha, con el lote de cada producto (lo que permite avisarle si hay que
// retirar un lote). No es un comprobante fiscal: la factura sale de ARCA.

import type { LoteTerminado } from "../productos-terminados/data";
import type { OperacionRow } from "./data";

export type LoteDeVenta = { lote: LoteTerminado; cantidad: number };

/** De qué lote(s) salieron las botellas de una venta (FIFO por fechas, ver _dominio/sync.ts). */
export function lotesDeVenta(op: Pick<OperacionRow, "id">, lotes: LoteTerminado[]): LoteDeVenta[] {
  return lotes.flatMap((l) => l.movimientos.filter((m) => m.origenOperacionId === op.id).map((m) => ({ lote: l, cantidad: m.cantidad })));
}

/** Por qué no se puede armar un solo remito con esas ventas (null = se puede). */
export function motivoSinRemito(ventas: Pick<OperacionRow, "clienteId" | "fecha">[]): string | null {
  if (ventas.length === 0) return "Elegí al menos una venta.";
  if (new Set(ventas.map((v) => v.clienteId)).size > 1) return "Un remito es para un solo cliente: elegí ventas del mismo cliente.";
  if (new Set(ventas.map((v) => v.fecha)).size > 1) return "Un remito es de una sola fecha: elegí ventas del mismo día.";
  return null;
}
