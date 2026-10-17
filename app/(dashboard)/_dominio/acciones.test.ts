// Lo que valida el servidor: cada acción con datos inválidos tiene que
// rechazarse con ErrorNegocio (con el campo del error) sin cambiar nada,
// aunque los datos no vengan de la pantalla. `ejecutar` (la server action)
// solo envuelve a `aplicar`, así que esto es lo que recibe cualquiera que la llame.

import { describe, expect, it } from "vitest";
import { aplicar, ErrorNegocio, type Accion, type Estado } from "./acciones";
import { estadoDemo } from "./demo";
import { saldoInventario, saldoLote, usadoDeCompra } from "./sync";
import { hoyLocal } from "@/app/components/data-table/validacion";

const base = estadoDemo();

/** Aplica una acción que llega "de afuera" (sin pasar por los tipos). */
const aplicarCualquiera = (e: Estado, a: unknown) => aplicar(e, a as Accion);

/** La acción tiene que rechazarse con ErrorNegocio (en `campo`, si se indica) y sin tocar el estado. */
function rechaza(a: unknown, campo?: string) {
  const antes = JSON.stringify(base);
  let error: unknown;
  try {
    aplicarCualquiera(base, a);
  } catch (e) {
    error = e;
  }
  expect(error, "tendría que haberse rechazado").toBeInstanceOf(ErrorNegocio);
  if (campo) expect((error as ErrorNegocio).campo).toBe(campo);
  expect(JSON.stringify(base)).toBe(antes);
  return error as ErrorNegocio;
}

const mañana = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

// ── Clientes ────────────────────────────────────────────────────────────────

const clienteOk = {
  razonSocial: "  Almacén   La Esquina ",
  apellidoNombre: "Pedro Gómez",
  condicionIva: "Monotributo",
  cuit: "20 12345678 6",
  telefono: "223 456 7890",
  email: "pedro@laesquina.com",
  domicilio: "Colón 1234",
  precioTradicional: "6800",
  precioPremium: "",
};

describe("clientes", () => {
  it("guarda limpio: textos recortados, CUIT normalizado, Precio Premium vacío = sin precio", () => {
    const e = aplicarCualquiera(base, { tipo: "addCliente", v: { ...clienteOk, id: 1, hackeo: "x" } });
    const nuevo = e.clientes[e.clientes.length - 1];
    expect(nuevo.id).toBe(base.clientes.length + 1);
    expect(nuevo).toEqual({
      id: nuevo.id,
      razonSocial: "Almacén La Esquina",
      apellidoNombre: "Pedro Gómez",
      condicionIva: "Monotributo",
      cuit: "20-12345678-6",
      telefono: "223 456 7890",
      email: "pedro@laesquina.com",
      domicilio: "Colón 1234",
      precioTradicional: 6800,
      precioPremium: null,
    });
  });

  it("Consumidor Final puede no tener CUIT", () => {
    const e = aplicarCualquiera(base, { tipo: "addCliente", v: { ...clienteOk, condicionIva: "Consumidor Final", cuit: "" } });
    expect(e.clientes.at(-1)?.cuit).toBe("");
  });

  it.each([
    [{ razonSocial: "" }, "razonSocial"],
    [{ razonSocial: "x".repeat(101) }, "razonSocial"],
    [{ condicionIva: "Inventada" }, "condicionIva"],
    [{ cuit: "" }, "cuit"],
    [{ cuit: "20-12345678-7" }, "cuit"],
    [{ cuit: base.clientes[0].cuit }, "cuit"],
    [{ email: "pedro@" }, "email"],
    [{ telefono: "abc" }, "telefono"],
    [{ precioTradicional: "" }, "precioTradicional"],
    [{ precioTradicional: "-5" }, "precioTradicional"],
    [{ precioTradicional: "abc" }, "precioTradicional"],
    [{ precioTradicional: "10.555" }, "precioTradicional"],
    [{ precioTradicional: 0 }, "precioTradicional"],
    [{ precioPremium: "0" }, "precioPremium"],
  ])("alta inválida %j", (cambio, campo) => {
    rechaza({ tipo: "addCliente", v: { ...clienteOk, ...cambio } }, campo);
  });

  it("v que no es un objeto", () => {
    rechaza({ tipo: "addCliente", v: "hola" }, "razonSocial");
    rechaza({ tipo: "addCliente" }, "razonSocial");
  });

  it("editar o borrar un id que no existe", () => {
    rechaza({ tipo: "updateCliente", id: 9999, v: clienteOk });
    rechaza({ tipo: "updateCliente", id: "1; DROP TABLE", v: clienteOk });
    rechaza({ tipo: "deleteCliente", id: -1 });
  });

  it("al editar no se puede pisar el id", () => {
    const c = base.clientes[1];
    const e = aplicarCualquiera(base, { tipo: "updateCliente", id: c.id, v: { ...c, id: 777 } });
    expect(e.clientes.find((x) => x.id === 777)).toBeUndefined();
    expect(e.clientes.find((x) => x.id === c.id)?.razonSocial).toBe(c.razonSocial);
  });
});

// ── Proveedores / materia prima / productos ─────────────────────────────────

describe("proveedores", () => {
  const ok = { razonSocial: "Vidriería Norte", contacto: "Ana", producto: "Botellas" };
  it("CUIT, email, teléfono, CBU y alias pueden quedar vacíos", () => {
    const e = aplicarCualquiera(base, { tipo: "addProveedor", v: ok });
    expect(e.proveedores.at(-1)).toMatchObject({ ...ok, cuitCuil: "", cbu: undefined, alias: undefined });
  });
  it.each([
    [{ contacto: "" }, "contacto"],
    [{ producto: " " }, "producto"],
    [{ cuitCuil: "30-71234567-9" }, "cuitCuil"],
    [{ cuitCuil: base.proveedores[0].cuitCuil }, "cuitCuil"],
    [{ cbu: "0720123988000012345670" }, "cbu"],
    [{ alias: "a b" }, "alias"],
    [{ email: "sin-arroba" }, "email"],
  ])("alta inválida %j", (cambio, campo) => {
    rechaza({ tipo: "addProveedor", v: { ...ok, ...cambio } }, campo);
  });
});

describe("materia prima", () => {
  it("no se repite el nombre (sin importar mayúsculas ni tildes)", () => {
    const existente = base.materiaPrima[0].nombre;
    rechaza({ tipo: "addMateriaPrima", v: { nombre: ` ${existente.toUpperCase()} `, unidad: "Litros" } }, "nombre");
  });
  it("unidad de la lista", () => {
    rechaza({ tipo: "addMateriaPrima", v: { nombre: "Canela", unidad: "Galones" } }, "unidad");
  });
});

describe("productos", () => {
  const ok = { nombre: "Licor de Naranja", formato: "500 cc", codigoBarras: "2611122201nar", precioUnitario: "9800,50" };
  it("guarda el código en mayúsculas y el precio con coma", () => {
    const e = aplicarCualquiera(base, { tipo: "addProducto", v: ok });
    expect(e.productos.at(-1)).toMatchObject({ codigoBarras: "2611122201NAR", precioUnitario: 9800.5 });
  });
  it.each([
    [{ codigoBarras: "ÑANDÚ" }, "codigoBarras"],
    [{ codigoBarras: base.productos[0].codigoBarras }, "codigoBarras"],
    [{ nombre: base.productos[0].nombre, formato: base.productos[0].formato }, "formato"],
    [{ precioUnitario: "1e5" }, "precioUnitario"],
  ])("alta inválida %j", (cambio, campo) => {
    rechaza({ tipo: "addProducto", v: { ...ok, ...cambio } }, campo);
  });
});

// ── Operaciones (ventas) ────────────────────────────────────────────────────

describe("ventas", () => {
  const prod = base.productos[0];
  const ok = {
    fecha: "2026-09-20",
    clienteId: base.clientes[0].id,
    vendedor: "ALQUIMIA",
    productoId: prod.id,
    cantidad: 2,
    canal: "Menor",
    condicion: "Contado",
    pu: 10000,
  };

  it("una venta mayor al stock se permite (la pantalla pide confirmar)", () => {
    expect(() => aplicarCualquiera(base, { tipo: "addOperacion", v: { ...ok, cantidad: 99999 } })).not.toThrow();
  });

  it.each([
    [{ fecha: mañana }, "fecha"],
    [{ fecha: "2019-05-01" }, "fecha"],
    [{ fecha: "2026-02-30" }, "fecha"],
    [{ fecha: "8276847-01-01" }, "fecha"],
    [{ clienteId: 9999 }, "clienteId"],
    [{ clienteId: "" }, "clienteId"],
    [{ vendedor: "INTRUSO" }, "vendedor"],
    [{ productoId: 9999 }, "productoId"],
    [{ cantidad: 0 }, "cantidad"],
    [{ cantidad: 1.5 }, "cantidad"],
    [{ cantidad: -3 }, "cantidad"],
    [{ canal: "Otro" }, "canal"],
    [{ condicion: "Trueque" }, "condicion"],
    [{ pu: 0 }, "pu"],
    [{ pu: "diez" }, "pu"],
  ])("venta inválida %j", (cambio, campo) => {
    rechaza({ tipo: "addOperacion", v: { ...ok, ...cambio } }, campo);
  });
});

// ── Órdenes de producción ───────────────────────────────────────────────────

describe("órdenes de producción", () => {
  // Una compra con saldo para armar una orden nueva válida.
  const compra = base.compras.find((c) => c.cantidad - usadoDeCompra(base.ordenesProduccion, c.id) >= 1)!;
  const mp = base.materiaPrima.find((m) => m.id === compra.materiaPrimaId)!;
  const disponible = compra.cantidad - usadoDeCompra(base.ordenesProduccion, compra.id);
  const insumo = { materiaPrima: mp.nombre, compraId: compra.id, cantidad: 1, costoUnitario: compra.costoUnitario };
  const ok = {
    productoId: base.productos[0].id,
    fechaMaceracion: hoyLocal(),
    fechaEmbotellado: null,
    responsable: "ALQUIMIA",
    cantidadProducida: 100,
    insumos: [insumo],
  };

  it("una orden válida se guarda", () => {
    const e = aplicarCualquiera(base, { tipo: "saveOrden", id: null, v: ok });
    expect(e.ordenesProduccion.length).toBe(base.ordenesProduccion.length + 1);
  });

  it.each([
    [{ productoId: 9999 }, "productoId"],
    [{ fechaMaceracion: "" }, "fechaMaceracion"],
    [{ fechaMaceracion: mañana }, "fechaMaceracion"],
    [{ fechaEmbotellado: "2020-01-01" }, "fechaEmbotellado"],
    [{ responsable: "" }, "responsable"],
    [{ cantidadProducida: 10.5 }, "cantidadProducida"],
    [{ insumos: [] }, "insumos"],
    [{ insumos: "nada" }, "insumos"],
    [{ insumos: [{ ...insumo, materiaPrima: "Inexistente" }] }, "insumos.0.materiaPrima"],
    [{ insumos: [{ ...insumo, cantidad: 0 }] }, "insumos.0.cantidad"],
    [{ insumos: [{ ...insumo, cantidad: disponible + 1 }] }, "insumos.0.cantidad"],
    [{ insumos: [insumo, { ...insumo, cantidad: disponible }] }, "insumos.0.cantidad"],
    [{ insumos: [{ ...insumo, compraId: 9999 }] }, "insumos.0.compraId"],
    [{ insumos: [{ ...insumo, costoUnitario: -1 }] }, "insumos.0.costoUnitario"],
    [{ fechaMaceracion: "2020-01-01" }, "insumos.0.compraId"], // la compra es posterior a la maceración
  ])("orden inválida %j", (cambio, campo) => {
    rechaza({ tipo: "saveOrden", id: null, v: { ...ok, ...cambio } }, campo);
  });

  it("una compra de otra materia prima", () => {
    const otra = base.compras.find((c) => c.materiaPrimaId !== compra.materiaPrimaId)!;
    rechaza({ tipo: "saveOrden", id: null, v: { ...ok, insumos: [{ ...insumo, compraId: otra.id }] } }, "insumos.0.compraId");
  });

  it("editar una orden que no existe", () => {
    rechaza({ tipo: "saveOrden", id: 9999, v: ok });
  });

  it("no se puede producir menos de lo que ya salió del lote", () => {
    const lote = base.productosTerminados.find((l) => l.origenOrdenId !== undefined && saldoLote(l) < l.existenciaInicial)!;
    const orden = base.ordenesProduccion.find((o) => o.id === lote.origenOrdenId)!;
    rechaza({ tipo: "saveOrden", id: orden.id, v: { ...orden, cantidadProducida: 1 } }, "cantidadProducida");
  });
});

// ── Libro de compras ────────────────────────────────────────────────────────

describe("compras", () => {
  const ok = {
    fecha: "2026-09-01",
    materiaPrimaId: base.materiaPrima[0].id,
    cantidad: "10",
    costoUnitario: "850",
    lote: "L-123",
    proveedorId: base.proveedores[0].id,
    comprobanteForm: "Factura",
    comprobanteTipo: "A",
    comprobanteNumero: "1-2",
    medioPago: "EFE",
  };

  it("una compra válida normaliza el comprobante", () => {
    const e = aplicarCualquiera(base, { tipo: "saveCompra", id: null, v: { ...ok, comprobanteNumero: "0001-00000123" } });
    expect(e.compras.at(-1)?.comprobanteNumero).toBe("0001 - 00000123");
  });

  it.each([
    [{ comprobanteNumero: "1-2" }, "comprobanteNumero"],
    [{ comprobanteNumero: "0001 - 00000123", comprobanteTipo: "" }, "comprobanteTipo"],
    [{ comprobanteNumero: "0001 - 00000123", comprobanteForm: "" }, "comprobanteForm"],
    [{ comprobanteNumero: "", comprobanteForm: "Pagaré" }, "comprobanteForm"],
    [{ fecha: mañana, comprobanteNumero: "" }, "fecha"],
    [{ cantidad: "0", comprobanteNumero: "" }, "cantidad"],
    [{ costoUnitario: "-1", comprobanteNumero: "" }, "costoUnitario"],
    [{ medioPago: "BITCOIN", comprobanteNumero: "" }, "medioPago"],
    [{ proveedorId: 9999, comprobanteNumero: "" }, "proveedorId"],
    [{ materiaPrimaId: 9999, comprobanteNumero: "" }, "materiaPrimaId"],
  ])("compra inválida %j", (cambio, campo) => {
    rechaza({ tipo: "saveCompra", id: null, v: { ...ok, ...cambio } }, campo);
  });

  it("una compra usada en una orden no puede quedar posterior a su maceración ni con menos cantidad", () => {
    const orden = base.ordenesProduccion.find((o) => o.insumos.some((i) => i.compraId))!;
    const compra = base.compras.find((c) => c.id === orden.insumos.find((i) => i.compraId)!.compraId)!;
    rechaza({ tipo: "saveCompra", id: compra.id, v: { ...compra, fecha: hoyLocal() } }, "fecha");
    rechaza({ tipo: "saveCompra", id: compra.id, v: { ...compra, cantidad: 0.01 } }, "cantidad");
  });

  it("un cítrico con cáscara suma la cáscara al inventario (con el costo total de la compra) y es lo que pueden usar las órdenes", () => {
    const limon = base.materiaPrima.find((m) => m.nombre === "Limón")!;
    const v = { ...ok, materiaPrimaId: limon.id, cantidad: "30", costoUnitario: "850", cantidadCascara: "7,5", comprobanteNumero: "" };
    const e = aplicarCualquiera(base, { tipo: "saveCompra", id: null, v });
    const compra = e.compras.at(-1)!;
    const fila = e.inventarioMateriaPrima.find((r) => r.materiaPrimaId === limon.id)!;
    const entrada = fila.movimientos.find((m) => m.origenCompraId === compra.id)!;
    expect(entrada).toMatchObject({ cantidad: 7.5, puEntrada: 3400, cantidadSecundaria: 7.5 });
    expect(saldoInventario(fila) - saldoInventario(base.inventarioMateriaPrima.find((r) => r.materiaPrimaId === limon.id)!)).toBeCloseTo(7.5);

    // Una orden no puede usar de esa compra más cáscara que la que trajo.
    const orden = { ...base.ordenesProduccion[0], fechaEmbotellado: null };
    const insumos = [{ materiaPrima: "Limón", cantidad: 8, costoUnitario: 3400, compraId: compra.id }];
    expect(() => aplicarCualquiera(e, { tipo: "saveOrden", id: null, v: { ...orden, fechaMaceracion: "2026-09-02", insumos } })).toThrow(ErrorNegocio);
    const conCascara = aplicarCualquiera(e, { tipo: "saveOrden", id: null, v: { ...orden, fechaMaceracion: "2026-09-02", insumos: [{ ...insumos[0], cantidad: 7.5 }] } });
    expect(usadoDeCompra(conCascara.ordenesProduccion, compra.id)).toBe(7.5);
  });

  it("comprobante duplicado", () => {
    const c = base.compras.find((x) => x.comprobanteNumero)!;
    rechaza({ tipo: "saveCompra", id: null, v: { ...c } }, "comprobanteNumero");
  });
});

// ── Lotes e inventario: movimientos manuales y existencias ──────────────────

describe("productos terminados", () => {
  const lote = base.productosTerminados.find((l) => saldoLote(l) > 0)!;
  const embotellado = base.ordenesProduccion.find((o) => o.id === lote.origenOrdenId)?.fechaEmbotellado;
  const mov = { tipo: "salida", fecha: hoyLocal(), cantidad: 1 };

  it("una salida válida se guarda sin campos inventados", () => {
    const e = aplicarCualquiera(base, { tipo: "addMovimiento", loteId: lote.id, movimiento: { ...mov, origenOperacionId: 1 } });
    const nuevo = e.productosTerminados.find((l) => l.id === lote.id)!.movimientos.at(-1)!;
    expect(nuevo.origenOperacionId).toBeUndefined();
  });

  it.each([
    [{ cantidad: saldoLote(lote) + 1 }, "cantidad"],
    [{ cantidad: 1.5 }, "cantidad"],
    [{ tipo: "robo" }, "tipo"],
    [{ fecha: mañana }, "fecha"],
  ])("movimiento inválido %j", (cambio, campo) => {
    rechaza({ tipo: "addMovimiento", loteId: lote.id, movimiento: { ...mov, ...cambio } }, campo);
  });

  it("fecha anterior al embotellado del lote", () => {
    if (!embotellado) return;
    rechaza({ tipo: "addMovimiento", loteId: lote.id, movimiento: { ...mov, fecha: "2020-01-02" } }, "fecha");
  });

  it("lote que no existe", () => {
    rechaza({ tipo: "addMovimiento", loteId: 9999, movimiento: mov });
  });

  it("encabezado: existencia, costo y vencimiento", () => {
    const vendido = base.productosTerminados.find((l) => saldoLote(l) < l.existenciaInicial && l.origenOrdenId)!;
    const emb = base.ordenesProduccion.find((o) => o.id === vendido.origenOrdenId)!.fechaEmbotellado!;
    const v = { existenciaInicial: vendido.existenciaInicial, costoUnitario: vendido.costoUnitario, fechaVencimiento: null };
    rechaza({ tipo: "updateLote", loteId: vendido.id, v: { ...v, existenciaInicial: 0 } }, "existenciaInicial");
    rechaza({ tipo: "updateLote", loteId: vendido.id, v: { ...v, costoUnitario: 0 } }, "costoUnitario");
    rechaza({ tipo: "updateLote", loteId: vendido.id, v: { ...v, fechaVencimiento: emb } }, "fechaVencimiento");
    rechaza({ tipo: "updateLote", loteId: vendido.id, v: { ...v, fechaVencimiento: "2999-01-01" } }, "fechaVencimiento");
  });
});

describe("inventario de materia prima", () => {
  const row = base.inventarioMateriaPrima.find((r) => saldoInventario(r) > 0)!;

  it("un consumo no puede superar el saldo", () => {
    rechaza(
      { tipo: "addInventarioMovimiento", rowId: row.id, movimiento: { tipo: "salida", fecha: hoyLocal(), cantidad: saldoInventario(row) + 1 } },
      "cantidad"
    );
  });

  it("alta repetida o de una materia prima que no existe", () => {
    rechaza({ tipo: "addInventarioMateriaPrima", v: { materiaPrimaId: row.materiaPrimaId, existenciaInicial: 0, costoUnitario: 0 } }, "materiaPrimaId");
    rechaza({ tipo: "addInventarioMateriaPrima", v: { materiaPrimaId: 9999, existenciaInicial: 0, costoUnitario: 0 } }, "materiaPrimaId");
  });

  it("existencia negativa o costo 0 con existencia", () => {
    rechaza({ tipo: "updateInventarioMateriaPrima", rowId: row.id, v: { existenciaInicial: -1, costoUnitario: 10 } }, "existenciaInicial");
    rechaza({ tipo: "updateInventarioMateriaPrima", rowId: row.id, v: { existenciaInicial: 5, costoUnitario: 0 } }, "costoUnitario");
  });
});

describe("acciones raras", () => {
  it("tipo desconocido", () => {
    rechaza({ tipo: "borrarTodo" });
  });
});
