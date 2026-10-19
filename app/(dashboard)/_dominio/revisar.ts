// Revisión completa de un estado: que cada registro pase las mismas reglas que
// la pantalla y el servidor, y que la trazabilidad y los saldos cierren. La
// usan los tests de los datos de prueba y el seed antes de escribir en la base
// (un estado que no pasa no se podría editar sin corregirlo primero).

import { calcularCostoTotal } from "../ordenes-produccion/data";
import type { Estado } from "./acciones";
import {
  embotelladoDeLote,
  validarCliente,
  validarCompra,
  validarEncabezadoInventario,
  validarEncabezadoLote,
  validarMateriaPrima,
  validarOperacion,
  validarOrden,
  validarProducto,
  validarProveedor,
  validarVendedor,
  type Resultado,
} from "./reglas";
import { round2, saldoInventario, saldoLote } from "./sync";

/** Lista de problemas encontrados (vacía si está todo bien). */
export function revisarEstado(e: Estado): string[] {
  const problemas: string[] = [];
  const chequear = <T,>(que: string, r: Resultado<T>) => {
    if (!r.ok) problemas.push(`${que}: ${Object.entries(r.errores).map(([c, m]) => `${c} → ${m}`).join("; ")}`);
  };

  for (const c of e.clientes) chequear(`Cliente ${c.id} (${c.razonSocial})`, validarCliente(c, e, c.id));
  for (const p of e.proveedores) chequear(`Proveedor ${p.id} (${p.razonSocial})`, validarProveedor(p, e, p.id));
  for (const m of e.materiaPrima) chequear(`Materia prima ${m.id} (${m.nombre})`, validarMateriaPrima(m, e, m.id));
  for (const p of e.productos) chequear(`Producto ${p.id}`, validarProducto(p, e, p.id));
  for (const v of e.vendedores) chequear(`Vendedor ${v.id}`, validarVendedor(v, e, v.id));
  for (const o of e.operaciones) chequear(`Venta OP ${o.id}`, validarOperacion(o, e));
  for (const c of e.compras) chequear(`Compra OP ${c.id}`, validarCompra(c, e, c.id));
  for (const l of e.productosTerminados) chequear(`Lote ${l.lote}`, validarEncabezadoLote(l, l, e));
  for (const r of e.inventarioMateriaPrima) chequear(`Inventario fila ${r.id}`, validarEncabezadoInventario(r, r, e));

  for (const o of e.ordenesProduccion) {
    chequear(`Orden ${o.id}`, validarOrden(o, e, o.id));
    if (Math.abs(o.costoTotal - calcularCostoTotal(o.insumos)) > 0.01) problemas.push(`Orden ${o.id}: el costo total no es la suma de los insumos.`);
    const lote = e.productosTerminados.find((l) => l.origenOrdenId === o.id);
    if (o.fechaEmbotellado && !lote) problemas.push(`Orden ${o.id}: está embotellada y no tiene lote.`);
    if (!o.fechaEmbotellado && lote) problemas.push(`Orden ${o.id}: está macerando y ya tiene lote.`);
  }

  for (const l of e.productosTerminados) {
    if (saldoLote(l) < -1e-9) problemas.push(`Lote ${l.lote}: saldo negativo (${round2(saldoLote(l))}).`);
    const embotellado = embotelladoDeLote(l, e);
    for (const m of l.movimientos) {
      if (embotellado && m.fecha && m.fecha < embotellado) {
        problemas.push(`Lote ${l.lote}: movimiento del ${m.fecha}, anterior al embotellado (${embotellado}).`);
      }
      if (m.origenOperacionId !== undefined && !e.operaciones.some((o) => o.id === m.origenOperacionId)) {
        problemas.push(`Lote ${l.lote}: salida de la venta OP ${m.origenOperacionId}, que no existe.`);
      }
    }
  }
  // Cada venta descontó exactamente su cantidad de algún lote (si el producto tiene lotes: sin ninguno no hay de dónde).
  const descontado = new Map<number, number>();
  for (const l of e.productosTerminados) {
    for (const m of l.movimientos) if (m.origenOperacionId !== undefined) descontado.set(m.origenOperacionId, (descontado.get(m.origenOperacionId) ?? 0) + m.cantidad);
  }
  for (const o of e.operaciones) {
    const conLotes = e.productosTerminados.some((l) => l.productoId === o.productoId);
    if (conLotes && round2(descontado.get(o.id) ?? 0) !== o.cantidad) problemas.push(`Venta OP ${o.id}: descontó ${descontado.get(o.id) ?? 0} de los lotes y vendió ${o.cantidad}.`);
  }

  for (const r of e.inventarioMateriaPrima) {
    if (saldoInventario(r) < -1e-9) {
      const nombre = e.materiaPrima.find((m) => m.id === r.materiaPrimaId)?.nombre ?? r.materiaPrimaId;
      problemas.push(`Inventario de ${nombre}: saldo negativo (${saldoInventario(r)}).`);
    }
  }
  return problemas;
}
