// Integración: server action `ejecutar` / `ejecutarVarios` (app/(dashboard)/_datos/acciones.ts)
// + reglas del dominio + repositorio + base SQLite real.
//
// Las unitarias ya prueban cada regla sobre el estado en memoria; acá se
// verifica que la cadena completa funcione: sesión → validación → transacción
// → lo que queda escrito en la base.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ejecutar, ejecutarVarios } from "@/app/(dashboard)/_datos/acciones";
import { galletas } from "./galletas";
import { cargarDemo, entrar, estadoEnBase, stockDe, vaciarBase } from "./ayudantes";

const venta = (extra: Record<string, unknown> = {}) => ({
  tipo: "addOperacion",
  v: { fecha: "2026-09-01", clienteId: 1, vendedor: "ALQUIMIA", productoId: 1, cantidad: 3, canal: "Menor", condicion: "Contado", pu: 10000, ...extra },
});

const cliente = (extra: Record<string, unknown> = {}) => ({
  tipo: "addCliente",
  v: {
    razonSocial: "  Almacén   La Esquina ",
    apellidoNombre: "Pedro Gómez",
    condicionIva: "Monotributo",
    cuit: "20 12345678 6",
    telefono: "223 456 7890",
    email: "pedro@laesquina.com",
    domicilio: "Colón 1234",
    precioTradicional: "6800",
    precioPremium: "",
    ...extra,
  },
});

beforeEach(async () => {
  await vaciarBase();
  await cargarDemo();
});

describe("Sesión: los cambios exigen una sesión válida", () => {
  it("IT-D01 sin cookie de sesión no guarda nada y pide volver a entrar", async () => {
    const antes = await prisma.operacion.count();

    const r = await ejecutar(venta());

    expect(r).toEqual({ ok: false, error: "Tu sesión terminó: volvé a iniciar sesión.", sinSesion: true });
    expect(await prisma.operacion.count()).toBe(antes);
  });

  it("IT-D02 con una cookie inventada tampoco guarda nada", async () => {
    galletas.set("alquimia_sesion", "inventada123");
    const antes = await prisma.operacion.count();

    const r = await ejecutar(venta());

    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ sinSesion: true });
    expect(await prisma.operacion.count()).toBe(antes);
  });

  it("IT-D03 una sesión borrada de la base (cerrada en otro lado) deja de servir", async () => {
    await entrar();
    await prisma.sesion.deleteMany();

    const r = await ejecutar(venta());

    expect(r).toMatchObject({ ok: false, sinSesion: true });
  });
});

describe("Entrada inválida: lo que llega no es una acción", () => {
  beforeEach(() => entrar());

  it.each([
    ["null", null],
    ["un texto", "addOperacion"],
    ["un número", 42],
    ["un objeto sin tipo", { v: {} }],
    ["un tipo que no existe", { tipo: "borrarTodo" }],
  ])("IT-D04 %s → «Acción desconocida.» y la base no cambia", async (_nombre, accion) => {
    const antes = await estadoEnBase();

    const r = await ejecutar(accion);

    expect(r).toEqual({ ok: false, error: "Acción desconocida." });
    expect(await estadoEnBase()).toEqual(antes);
  });
});

describe("Clientes: alta, validación y consistencia", () => {
  beforeEach(() => entrar());

  it("IT-D05 un alta válida queda guardada en la base con los datos limpios", async () => {
    const r = await ejecutar(cliente());

    expect(r.ok).toBe(true);
    const guardado = await prisma.cliente.findFirst({ where: { razonSocial: "Almacén La Esquina" } });
    expect(guardado).toMatchObject({ cuit: "20-12345678-6", precioTradicional: 6800, precioPremium: null });
  });

  it("IT-D06 un CUIT con el dígito verificador mal se rechaza en el campo cuit y no se guarda", async () => {
    const antes = await prisma.cliente.count();

    const r = await ejecutar(cliente({ cuit: "20-12345678-7" }));

    expect(r).toMatchObject({ ok: false, campo: "cuit" });
    expect(await prisma.cliente.count()).toBe(antes);
  });

  it("IT-D07 un campo de más en el pedido («hackeo», id propio) se ignora", async () => {
    const r = await ejecutar(cliente({ id: 1, hackeo: "x" }));

    expect(r.ok).toBe(true);
    const nuevo = await prisma.cliente.findFirst({ where: { razonSocial: "Almacén La Esquina" } });
    expect(nuevo!.id).not.toBe(1);
    expect(await prisma.cliente.findUnique({ where: { id: 1 } })).toMatchObject({ razonSocial: "PARTICULAR" });
  });

  it("IT-D08 renombrar un cliente se ve en sus ventas (el nombre sale del catálogo)", async () => {
    const original = (await estadoEnBase()).clientes.find((c) => c.id === 1)!;

    const r = await ejecutar({ tipo: "updateCliente", id: 1, v: { ...original, razonSocial: "CONSUMIDOR FINAL" } });

    expect(r.ok).toBe(true);
    const ventas = (await estadoEnBase()).operaciones.filter((o) => o.clienteId === 1);
    expect(ventas.length).toBeGreaterThan(0);
    expect(ventas.every((o) => o.cliente === "CONSUMIDOR FINAL")).toBe(true);
  });

  it("IT-D09 no deja borrar un cliente con ventas y no borra nada", async () => {
    const r = await ejecutar({ tipo: "deleteCliente", id: 1 });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("tiene operaciones cargadas");
    expect(await prisma.cliente.findUnique({ where: { id: 1 } })).not.toBeNull();
  });
});

describe("Ventas: la venta y el stock se guardan juntos", () => {
  beforeEach(() => entrar());

  it("IT-D10 una venta queda en la base y descuenta las botellas del stock", async () => {
    const antes = await estadoEnBase();
    const stockAntes = stockDe(antes, 1);

    const r = await ejecutar(venta({ cantidad: 3 }));

    expect(r.ok).toBe(true);
    const despues = await estadoEnBase();
    expect(despues.operaciones).toHaveLength(antes.operaciones.length + 1);
    const nueva = despues.operaciones.at(-1)!;
    expect(nueva).toMatchObject({ cantidad: 3, pu: 10000, subTotal: 30000, cliente: "PARTICULAR" });
    expect(stockDe(despues, 1)).toBe(stockAntes - 3);
    // La salida del lote apunta a la venta (trazabilidad).
    const salidas = await prisma.movimientoLote.findMany({ where: { origenOperacionId: nueva.id } });
    expect(salidas.reduce((s, m) => s + m.cantidad, 0)).toBe(3);
  });

  it.each([
    ["cantidad negativa", { cantidad: -5 }, "cantidad"],
    ["cantidad cero", { cantidad: 0 }, "cantidad"],
    ["fecha incompleta «20/10»", { fecha: "20/10" }, "fecha"],
    ["fecha imposible 31/02", { fecha: "2026-02-31" }, "fecha"],
    ["cliente inexistente", { clienteId: 99999 }, "clienteId"],
    ["sin producto", { productoId: null }, "productoId"],
    ["vendedor que no está en la lista", { vendedor: "NADIE" }, "vendedor"],
    ["canal inventado", { canal: "Online" }, "canal"],
    ["precio negativo", { pu: -1 }, "pu"],
  ])("IT-D11 venta con %s → rechazada en «%s»… sin tocar ventas ni stock", async (_n, cambio, campo) => {
    const antes = await estadoEnBase();

    const r = await ejecutar(venta(cambio));

    expect(r).toMatchObject({ ok: false, campo });
    const despues = await estadoEnBase();
    expect(despues.operaciones).toEqual(antes.operaciones);
    expect(despues.productosTerminados).toEqual(antes.productosTerminados);
  });

  it("IT-D12 vender más de lo que hay se permite (regla del negocio) y el faltante queda registrado", async () => {
    const stock = stockDe(await estadoEnBase(), 1);

    const r = await ejecutar(venta({ cantidad: stock + 5 }));

    expect(r.ok).toBe(true);
    expect(stockDe(await estadoEnBase(), 1)).toBe(-5);
  });

  it("IT-D13 borrar una venta devuelve las botellas al stock", async () => {
    await ejecutar(venta({ cantidad: 4 }));
    const conVenta = await estadoEnBase();
    const id = conVenta.operaciones.at(-1)!.id;

    const r = await ejecutar({ tipo: "deleteOperacion", id });

    expect(r.ok).toBe(true);
    const despues = await estadoEnBase();
    expect(stockDe(despues, 1)).toBe(stockDe(conVenta, 1) + 4);
    expect(await prisma.movimientoLote.count({ where: { origenOperacionId: id } })).toBe(0);
  });

  it("IT-D14 editar la cantidad de una venta ajusta el stock por la diferencia", async () => {
    await ejecutar(venta({ cantidad: 2 }));
    const conVenta = await estadoEnBase();
    const op = conVenta.operaciones.at(-1)!;

    const r = await ejecutar({ tipo: "updateOperacion", id: op.id, v: { ...venta().v, cantidad: 5 } });

    expect(r.ok).toBe(true);
    expect(stockDe(await estadoEnBase(), 1)).toBe(stockDe(conVenta, 1) - 3);
  });

  it("IT-D15 editar o borrar una venta que no existe se rechaza", async () => {
    const a = await ejecutar({ tipo: "updateOperacion", id: 99999, v: venta().v });
    const b = await ejecutar({ tipo: "deleteOperacion", id: 99999 });

    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });
});

describe("Borrado de varios registros (ejecutarVarios)", () => {
  beforeEach(() => entrar());

  it("IT-D16 borra los que puede y devuelve el motivo de los que no", async () => {
    await ejecutar(cliente());
    const nuevo = (await prisma.cliente.findFirst({ where: { razonSocial: "Almacén La Esquina" } }))!;

    const r = await ejecutarVarios([
      { tipo: "deleteCliente", id: nuevo.id },
      { tipo: "deleteCliente", id: 1 },
    ]);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fallos).toHaveLength(1);
      expect(r.fallos[0].indice).toBe(1);
    }
    expect(await prisma.cliente.findUnique({ where: { id: nuevo.id } })).toBeNull();
    expect(await prisma.cliente.findUnique({ where: { id: 1 } })).not.toBeNull();
  });

  it.each([
    ["una lista vacía", [], "No hay registros seleccionados."],
    ["algo que no es lista", { tipo: "deleteCliente", id: 1 }, "No hay registros seleccionados."],
    ["un alta mezclada (solo se permiten bajas)", [{ tipo: "addCliente", v: {} }], "Acción desconocida."],
  ])("IT-D17 con %s → rechazo sin cambios", async (_n, acciones, mensaje) => {
    const antes = await estadoEnBase();

    const r = await ejecutarVarios(acciones);

    expect(r).toEqual({ ok: false, error: mensaje });
    expect(await estadoEnBase()).toEqual(antes);
  });

  it("IT-D18 sin sesión no borra nada", async () => {
    galletas.clear();

    const r = await ejecutarVarios([{ tipo: "deleteCliente", id: 1 }]);

    expect(r).toMatchObject({ ok: false, sinSesion: true });
  });
});
