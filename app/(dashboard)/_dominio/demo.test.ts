// Los datos de prueba (los que carga el seed) tienen que pasar las mismas
// reglas que la pantalla y el servidor: si no, no se podrían editar sin
// corregirlos, y el seed dejaría la base en un estado que la app no acepta.

import { describe, expect, it } from "vitest";
import { estadoDemo } from "./demo";
import {
  validarCliente,
  validarCompra,
  validarEncabezadoInventario,
  validarEncabezadoLote,
  validarMateriaPrima,
  validarOperacion,
  validarOrden,
  validarProducto,
  validarProveedor,
  type Resultado,
} from "./reglas";

const e = estadoDemo();

/** Errores de un resultado (vacío si está bien), para que el test muestre qué falló. */
const errores = <T,>(r: Resultado<T>) => (r.ok ? {} : r.errores);

describe("datos de prueba", () => {
  it.each(e.clientes)("cliente $id ($razonSocial)", (c) => {
    const r = validarCliente(c, e, c.id);
    expect(errores(r)).toEqual({});
    // Ya guardado en su forma normalizada (ej. CUIT 30-71234567-8).
    if (r.ok) expect({ id: c.id, ...r.valor }).toEqual(c);
  });

  it.each(e.proveedores)("proveedor $id ($razonSocial)", (p) => {
    const r = validarProveedor(p, e, p.id);
    expect(errores(r)).toEqual({});
    if (r.ok) expect(r.valor.cuitCuil).toBe(p.cuitCuil);
  });

  it.each(e.materiaPrima)("materia prima $id ($nombre)", (m) => {
    expect(errores(validarMateriaPrima(m, e, m.id))).toEqual({});
  });

  it.each(e.productos)("producto $id", (p) => {
    expect(errores(validarProducto(p, e, p.id))).toEqual({});
  });

  it.each(e.operaciones)("venta OP $id", (o) => {
    expect(errores(validarOperacion(o, e))).toEqual({});
  });

  it.each(e.ordenesProduccion)("orden $id", (o) => {
    expect(errores(validarOrden(o, e, o.id))).toEqual({});
  });

  it.each(e.compras)("compra OP $id", (c) => {
    expect(errores(validarCompra(c, e, c.id))).toEqual({});
  });

  it.each(e.productosTerminados)("lote $lote", (l) => {
    expect(errores(validarEncabezadoLote(l, l, e))).toEqual({});
  });

  it.each(e.inventarioMateriaPrima)("inventario fila $id", (r) => {
    expect(errores(validarEncabezadoInventario(r, r, e))).toEqual({});
  });
});
