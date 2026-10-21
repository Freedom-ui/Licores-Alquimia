// FIFO por fechas (Fase 8): cada venta descuenta solo de los lotes ya
// embotellados a su fecha, y cargar / editar / borrar una venta reacomoda las
// demás del producto. También las guardas de borrado de lotes y órdenes.

import { describe, expect, it } from "vitest";
import { aplicar, ErrorNegocio, type Accion, type Estado } from "./acciones";
import { generarDatos } from "./generador";
import { faltanteDeVenta } from "./reglas";
import { recalcularFifo, saldoLote } from "./sync";
import { revisarEstado } from "./revisar";

// Un año de negocio simulado: varios lotes por producto, con ventas entre embotellados.
const base = generarDatos({ hasta: "2024-12-31" });
const aplicarCualquiera = (e: Estado, a: unknown) => aplicar(e, a as Accion);

function rechaza(e: Estado, a: unknown, campo?: string): ErrorNegocio {
  let error: unknown;
  try {
    aplicarCualquiera(e, a);
  } catch (err) {
    error = err;
  }
  expect(error, "tendría que haberse rechazado").toBeInstanceOf(ErrorNegocio);
  if (campo) expect((error as ErrorNegocio).campo).toBe(campo);
  return error as ErrorNegocio;
}

/** Fecha desde la que se puede vender de cada lote ("" = lote previo, desde siempre). */
function desde(e: Estado, loteId: number): string | null {
  const l = e.productosTerminados.find((x) => x.id === loteId)!;
  if (l.origenOrdenId === undefined) return "";
  return e.ordenesProduccion.find((o) => o.id === l.origenOrdenId)?.fechaEmbotellado ?? null;
}

/** Salidas de una venta, por lote. */
function salidasDe(e: Estado, opId: number): { loteId: number; cantidad: number }[] {
  return e.productosTerminados.flatMap((l) =>
    l.movimientos.filter((m) => m.origenOperacionId === opId).map((m) => ({ loteId: l.id, cantidad: m.cantidad }))
  );
}

/** Ninguna venta descuenta de un lote embotellado después de su fecha. */
function respetaFechas(e: Estado) {
  for (const l of e.productosTerminados) {
    const d = desde(e, l.id);
    for (const m of l.movimientos) {
      if (m.origenOperacionId === undefined) continue;
      expect(d, `lote ${l.lote}`).not.toBeNull();
      expect(m.fecha! >= d!, `venta OP ${m.origenOperacionId} (${m.fecha}) del lote ${l.lote} embotellado el ${d}`).toBe(true);
    }
  }
}

/** Recalcular desde cero no cambia nada: el resultado no depende del orden de carga. */
function esEstable(e: Estado) {
  const productos = new Set(e.operaciones.map((o) => o.productoId));
  const recalculado = recalcularFifo(e.productosTerminados, e.operaciones, e.ordenesProduccion, productos);
  const sinIds = (lotes: Estado["productosTerminados"]) =>
    lotes.map((l) => ({
      id: l.id,
      movimientos: l.movimientos.map((m) => ({ ...m, id: 0 })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }));
  expect(sinIds(recalculado)).toEqual(sinIds(e.productosTerminados));
}

// Un producto con al menos dos lotes de órdenes embotelladas en fechas distintas.
const lotesDeOrden = (productoId: number) =>
  base.productosTerminados
    .filter((l) => l.productoId === productoId && l.origenOrdenId !== undefined)
    .map((l) => ({ l, d: desde(base, l.id)! }))
    .sort((a, b) => a.d.localeCompare(b.d));
const producto = base.productos.find(
  (p) =>
    !base.productosTerminados.some((l) => l.productoId === p.id && l.origenOrdenId === undefined) &&
    new Set(lotesDeOrden(p.id).map((x) => x.d)).size >= 2
)!;
const [primero, segundo] = lotesDeOrden(producto.id);

const venta = {
  clienteId: base.clientes[0].id,
  vendedor: base.vendedores[0].nombre,
  productoId: producto.id,
  canal: "Menor",
  condicion: "Contado",
  pu: 10000,
};
const nuevaVenta = (e: Estado, fecha: string, cantidad: number) => {
  const r = aplicarCualquiera(e, { tipo: "addOperacion", v: { ...venta, fecha, cantidad } });
  return { e: r, id: r.operaciones.at(-1)!.id };
};
const diaAntes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

describe("FIFO por fechas", () => {
  it("los datos de prueba ya respetan las fechas y son estables", () => {
    expect(producto, "hace falta un producto con dos lotes de orden").toBeDefined();
    respetaFechas(base);
    esEstable(base);
    expect(revisarEstado(base)).toEqual([]);
  });

  it("una venta anterior a todo embotellado queda sin lote y la pantalla lo avisa", () => {
    const fecha = diaAntes(primero.d);
    const aviso = faltanteDeVenta(base, { id: null, productoId: producto.id, fecha, cantidad: 3 });
    expect(aviso).toEqual({ faltan: 3, sinLote: true });
    const { e, id } = nuevaVenta(base, fecha, 3);
    expect(salidasDe(e, id)).toEqual([]);
  });

  it("una venta entre dos embotellados no toma del lote posterior; el faltante queda en negativo en el último disponible", () => {
    const fecha = segundo.d > primero.d ? diaAntes(segundo.d) : primero.d;
    const disponibles = base.productosTerminados.filter((l) => l.productoId === producto.id && (desde(base, l.id) ?? "9") <= fecha);
    const ultimo = disponibles.map((l) => ({ l, d: desde(base, l.id)! })).sort((a, b) => a.d.localeCompare(b.d) || a.l.lote - b.l.lote).at(-1)!.l;
    const aviso = faltanteDeVenta(base, { id: null, productoId: producto.id, fecha, cantidad: 5000 });
    expect(aviso.sinLote).toBe(false);
    expect(aviso.faltan).toBeGreaterThan(0);

    const { e, id } = nuevaVenta(base, fecha, 5000);
    const salidas = salidasDe(e, id);
    expect(salidas.reduce((s, x) => s + x.cantidad, 0)).toBe(5000);
    for (const s of salidas) expect(desde(e, s.loteId)! <= fecha).toBe(true);
    expect(saldoLote(e.productosTerminados.find((l) => l.id === ultimo.id)!)).toBeLessThan(0);
    respetaFechas(e);
    esEstable(e);
  });

  it("cargar una venta vieja grande corre las posteriores a los lotes siguientes, y borrarla las devuelve", () => {
    const fecha = primero.d;
    const { e, id } = nuevaVenta(base, fecha, Math.max(1, Math.floor(saldoLote(primero.l) + primero.l.existenciaInicial)));
    respetaFechas(e);
    esEstable(e);
    // Lo que el lote más viejo ya no puede darle a las ventas posteriores sale de otros lotes.
    const delPrimero = (x: Estado) =>
      x.productosTerminados.find((l) => l.id === primero.l.id)!.movimientos.filter((m) => m.origenOperacionId !== id && m.origenOperacionId !== undefined);
    expect(delPrimero(e).reduce((s, m) => s + m.cantidad, 0)).toBeLessThan(delPrimero(base).reduce((s, m) => s + m.cantidad, 0) || 1);

    const sinElla = aplicarCualquiera(e, { tipo: "deleteOperacion", id });
    expect(salidasDe(sinElla, id)).toEqual([]);
    expect(sinElla.productosTerminados.map((l) => saldoLote(l))).toEqual(base.productosTerminados.map((l) => saldoLote(l)));
  });

  it("editar la fecha de una venta la cambia de lote", () => {
    const { e, id } = nuevaVenta(base, segundo.d, 1);
    const op = e.operaciones.find((o) => o.id === id)!;
    const antes = aplicarCualquiera(e, { tipo: "updateOperacion", id, v: { ...op, fecha: diaAntes(primero.d) } });
    expect(salidasDe(antes, id)).toEqual([]);
    respetaFechas(antes);
  });

  it("un lote con stock previo al sistema está disponible desde siempre", () => {
    const conPrevio = aplicarCualquiera(base, {
      tipo: "addLote",
      v: { productoId: producto.id, lote: 9999, existenciaInicial: 5, costoUnitario: 1000, fechaVencimiento: null },
    });
    const previo = conPrevio.productosTerminados.at(-1)!;
    const { e, id } = nuevaVenta(conPrevio, diaAntes(primero.d), 3);
    expect(salidasDe(e, id)).toEqual([{ loteId: previo.id, cantidad: 3 }]);
  });
});

describe("guardas de borrado", () => {
  const conVentas = base.productosTerminados.find(
    (l) => l.origenOrdenId !== undefined && l.movimientos.some((m) => m.origenOperacionId !== undefined)
  )!;
  const orden = base.ordenesProduccion.find((o) => o.id === conVentas.origenOrdenId)!;

  it("el lote de una orden no se borra desde Productos terminados", () => {
    expect(rechaza(base, { tipo: "deleteLote", loteId: conVentas.id }).message).toMatch(/orden de producción N° /);
  });

  it("un lote previo con ventas no se borra; sin ventas sí", () => {
    // El lote previo es el más viejo: toma enseguida las primeras ventas del producto.
    const conPrevio = aplicarCualquiera(base, {
      tipo: "addLote",
      v: { productoId: producto.id, lote: 9999, existenciaInicial: 5, costoUnitario: 1000, fechaVencimiento: null },
    });
    const previo = conPrevio.productosTerminados.at(-1)!;
    expect(rechaza(conPrevio, { tipo: "deleteLote", loteId: previo.id }).message).toMatch(/tiene ventas \(OP N° /);

    // De un producto sin ventas, sí.
    const conProducto = aplicarCualquiera(base, {
      tipo: "addProducto",
      v: { nombre: "Licor de Prueba", formato: "500 cc", codigoBarras: "PRUEBA01", precioUnitario: "9800" },
    });
    const nuevo = conProducto.productos.at(-1)!;
    const conLote = aplicarCualquiera(conProducto, {
      tipo: "addLote",
      v: { productoId: nuevo.id, lote: 9998, existenciaInicial: 5, costoUnitario: 1000, fechaVencimiento: null },
    });
    const lote = conLote.productosTerminados.at(-1)!;
    const sinLote = aplicarCualquiera(conLote, { tipo: "deleteLote", loteId: lote.id });
    expect(sinLote.productosTerminados.some((l) => l.id === lote.id)).toBe(false);
  });

  it("una orden cuyo lote ya tiene ventas no se borra", () => {
    expect(rechaza(base, { tipo: "deleteOrden", id: orden.id }).message).toMatch(/ya tiene ventas/);
  });

  it("una orden cuyo lote tiene ventas no vuelve a macerar ni cambia de producto", () => {
    rechaza(base, { tipo: "saveOrden", id: orden.id, v: { ...orden, fechaEmbotellado: null } }, "fechaEmbotellado");
    const otro = base.productos.find((p) => p.id !== orden.productoId)!;
    rechaza(base, { tipo: "saveOrden", id: orden.id, v: { ...orden, productoId: otro.id } }, "productoId");
  });

  it("una orden sin movimientos en su lote se borra junto con el lote", () => {
    const libre = base.productosTerminados.find((l) => l.origenOrdenId !== undefined && l.movimientos.length === 0);
    if (!libre) return;
    const e = aplicarCualquiera(base, { tipo: "deleteOrden", id: libre.origenOrdenId });
    expect(e.productosTerminados.some((l) => l.id === libre.id)).toBe(false);
  });
});
