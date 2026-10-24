import { describe, expect, it } from "vitest";
import { estadoDemo } from "../_dominio/demo";
import { aplicar } from "../_dominio/acciones";
import type { Estado } from "../_dominio/acciones";
import { clientesDe, contactosDeRetiro, rastrearLoteProveedor, retiroDeLote, retiroDeLoteProveedor, type TrazaContexto } from "./rastreo";

const ctxDe = (e: Estado): TrazaContexto => ({
  compras: e.compras,
  proveedores: e.proveedores,
  materiaPrima: e.materiaPrima,
  ordenes: e.ordenesProduccion,
  lotes: e.productosTerminados,
  operaciones: e.operaciones,
  clientes: e.clientes,
});

const base = estadoDemo();

describe("clientes de un lote", () => {
  it("dos clientes con el mismo nombre no se mezclan", () => {
    const ventas = [
      { operacionId: 1, fecha: "2026-10-01", clienteId: 1, cliente: "KIOSCO", cantidad: 2 },
      { operacionId: 2, fecha: "2026-10-02", clienteId: 2, cliente: "KIOSCO", cantidad: 3 },
      { operacionId: 3, fecha: "2026-10-03", clienteId: 1, cliente: "KIOSCO", cantidad: 1 },
    ];
    expect(clientesDe(ventas)).toEqual([
      { clienteId: 1, cliente: "KIOSCO", cantidad: 3 },
      { clienteId: 2, cliente: "KIOSCO", cantidad: 3 },
    ]);
  });

  it("los contactos traen los datos del cliente", () => {
    const c = base.clientes.find((x) => x.telefono)!;
    const [contacto] = contactosDeRetiro([{ operacionId: 1, fecha: "2026-10-01", clienteId: c.id, cliente: c.razonSocial, cantidad: 4 }], base.clientes);
    expect(contacto).toMatchObject({ clienteId: c.id, telefono: c.telefono, email: c.email, cuit: c.cuit, domicilio: c.domicilio, cantidad: 4 });
  });
});

describe("retiro de lote", () => {
  it("un lote de licor: cada venta, sus clientes y el stock a inmovilizar", () => {
    const lote = base.productosTerminados.find((l) => l.movimientos.some((m) => m.origenOperacionId))!;
    const r = retiroDeLote(lote, ctxDe(base));
    const ventas = lote.movimientos.filter((m) => m.origenOperacionId);
    expect(r.entregas).toHaveLength(ventas.length);
    expect(r.entregas.every((x) => x.lote === lote.lote)).toBe(true);
    expect(r.contactos.reduce((s, c) => s + c.cantidad, 0)).toBeCloseTo(ventas.reduce((s, m) => s + m.cantidad, 0));
    expect(r.enStock).toBe(Math.max(0, r.lotes[0].destino.enStock));
  });

  it("un lote de proveedor junta todos los lotes de licor que lo usaron", () => {
    const compra = base.compras.find((c) => c.lote && base.ordenesProduccion.some((o) => o.insumos.some((i) => i.compraId === c.id)))!;
    const rastreo = rastrearLoteProveedor(compra, ctxDe(base));
    const r = retiroDeLoteProveedor(rastreo, ctxDe(base));
    expect(r.lotes.map((l) => l.lote.id).sort()).toEqual(rastreo.ordenes.filter((o) => o.lote).map((o) => o.lote!.id).sort());
    expect(r.contactos.map((c) => c.clienteId).sort()).toEqual(rastreo.clientes.map((c) => c.clienteId).sort());
  });

  it("un lote de stock previo también entra en el FIFO de su producto y suma su stock", () => {
    const e = aplicar(base, { tipo: "addLote", v: { productoId: base.productos[0].id, lote: "999", existenciaInicial: "10", costoUnitario: "100" } });
    const lote = e.productosTerminados.at(-1)!;
    const r = retiroDeLote(lote, ctxDe(e));
    const vendidas = r.entregas.reduce((s, x) => s + x.cantidad, 0);
    expect(r.enStock).toBe(Math.max(0, 10 - vendidas));
    expect(r.origen).toContainEqual(["Orden de producción", "Sin orden registrada (lote anterior al sistema)"]);
  });
});
