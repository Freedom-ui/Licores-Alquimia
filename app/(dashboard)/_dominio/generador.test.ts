// Los datos de prueba con volumen (los que carga el seed): tienen que pasar las
// mismas reglas que la pantalla y el servidor, y la trazabilidad y los saldos
// tienen que cerrar como si todo se hubiera cargado a mano.

import { describe, expect, it } from "vitest";
import { generarDatos } from "./generador";
import { revisarEstado } from "./revisar";
import { estadoDemo } from "./demo";
import { embotelladoDeLote } from "./reglas";
import { stockMaterias } from "../estadisticas/calculos";
import { construirAlertas } from "../estadisticas/secciones";

// Fecha final fija: así el test no cambia con el día en que se corre.
const HASTA = "2026-10-15";
const e = generarDatos({ hasta: HASTA });

describe("generador de datos de prueba", () => {
  it("todo pasa las reglas y los saldos cierran", () => {
    expect(revisarEstado(e)).toEqual([]);
  });

  it("el demo chico de los tests también pasa", () => {
    expect(revisarEstado(estadoDemo())).toEqual([]);
  });

  it("misma semilla y misma fecha = mismos datos; otra semilla = otros", () => {
    expect(generarDatos({ hasta: HASTA })).toEqual(e);
    expect(generarDatos({ hasta: HASTA, semilla: 2 }).operaciones).not.toEqual(e.operaciones);
  });

  it("volumen y período: de enero de 2024 a la fecha final", () => {
    expect(e.operaciones.length).toBeGreaterThan(1000);
    expect(e.operaciones.length).toBeLessThan(2500);
    expect(e.ordenesProduccion.length).toBeGreaterThan(70);
    expect(e.compras.length).toBeGreaterThan(200);
    expect(e.clientes.length).toBeGreaterThanOrEqual(35);
    expect(e.proveedores.length).toBeGreaterThanOrEqual(15);
    const fechas = e.operaciones.map((o) => o.fecha).sort();
    expect(fechas[0] >= "2024-01-01" && fechas[0] <= "2024-01-07").toBe(true);
    expect(fechas.at(-1)! <= HASTA).toBe(true);
    expect(e.compras.every((c) => c.fecha <= HASTA)).toBe(true);
  });

  it("cada venta sale de lotes ya embotellados a esa fecha", () => {
    for (const l of e.productosTerminados) {
      const embotellado = embotelladoDeLote(l, e)!;
      expect(embotellado).toBeTruthy();
      for (const m of l.movimientos) expect(m.fecha! >= embotellado).toBe(true);
    }
  });

  it("el N° de lote y el embotellado crecen juntos (el FIFO sigue el orden de embotellado)", () => {
    const embotelladas = e.ordenesProduccion.filter((o) => o.fechaEmbotellado);
    for (let i = 1; i < embotelladas.length; i++) {
      expect(embotelladas[i].fechaEmbotellado! > embotelladas[i - 1].fechaEmbotellado!).toBe(true);
    }
  });

  it("trazabilidad: casi todos los insumos salen de una compra anterior a la maceración", () => {
    const insumos = e.ordenesProduccion.flatMap((o) => o.insumos.map((i) => ({ ...i, maceracion: o.fechaMaceracion })));
    const conCompra = insumos.filter((i) => i.compraId !== undefined);
    expect(conCompra.length / insumos.length).toBeGreaterThan(0.9);
    for (const i of conCompra) expect(e.compras.find((c) => c.id === i.compraId)!.fecha <= i.maceracion).toBe(true);
  });

  it("lo fresco (cítricos y hierbas) sale de compras de la última semana", () => {
    const frescos = ["Limón", "Naranja", "Pomelo", "Menta", "Jengibre"];
    for (const o of e.ordenesProduccion) {
      for (const i of o.insumos.filter((x) => x.compraId && frescos.includes(x.materiaPrima))) {
        const compra = e.compras.find((c) => c.id === i.compraId)!;
        const dias = (Date.parse(o.fechaMaceracion) - Date.parse(compra.fecha)) / 86_400_000;
        expect(dias).toBeLessThanOrEqual(7);
      }
    }
  });

  it("las filas de una misma factura tienen el mismo medio de pago", () => {
    const medios = new Map<string, Set<string>>();
    for (const c of e.compras.filter((x) => x.comprobanteNumero)) {
      const clave = `${c.proveedorId}|${c.comprobanteForm}|${c.comprobanteNumero}`;
      medios.set(clave, (medios.get(clave) ?? new Set()).add(c.medioPago));
    }
    expect([...medios.values()].filter((m) => m.size > 1)).toEqual([]);
  });

  it("quedan órdenes macerando, alguna sin cantidad estimada en otra semilla", () => {
    const macerando = e.ordenesProduccion.filter((o) => !o.fechaEmbotellado);
    expect(macerando.length).toBeGreaterThan(0);
    const otras = [2, 3, 4, 5].flatMap((s) => generarDatos({ hasta: HASTA, semilla: s }).ordenesProduccion);
    expect([...macerando, ...otras].some((o) => o.cantidadProducida === null)).toBe(true);
  });

  it("estacionalidad: se vende más en diciembre y enero que en junio y julio", () => {
    const botellas = (meses: string[]) => e.operaciones.filter((o) => meses.includes(o.fecha.slice(0, 7))).reduce((s, o) => s + o.cantidad, 0);
    expect(botellas(["2024-12", "2025-01"])).toBeGreaterThan(botellas(["2024-06", "2024-07"]) * 1.3);
    expect(botellas(["2025-12", "2026-01"])).toBeGreaterThan(botellas(["2025-06", "2025-07"]) * 1.3);
  });

  it("precios con inflación: la lista de hoy es la del catálogo y la de 2024 es bastante menor", () => {
    expect(e.productos.find((p) => p.id === 1)!.precioUnitario).toBe(10000);
    const enero2024 = e.operaciones.find((o) => o.fecha.startsWith("2024-01") && o.canal === "Menor" && o.productoId === 1)!;
    expect(enero2024.pu).toBeLessThan(5000);
  });
});

describe("alertas de materia prima", () => {
  it("lo que se compra para cada orden no avisa que falta stock", () => {
    const datos = {
      hoy: HASTA,
      operaciones: e.operaciones,
      ordenes: e.ordenesProduccion,
      lotes: e.productosTerminados,
      inventario: e.inventarioMateriaPrima,
      materiaPrima: e.materiaPrima,
      compras: e.compras,
      proveedores: e.proveedores,
    };
    const frescos = e.materiaPrima.filter((m) => m.reposicion === "Para cada orden").map((m) => m.nombre);
    expect(frescos.sort()).toEqual(["Jengibre", "Limón", "Menta", "Naranja", "Pomelo"]);
    for (const m of stockMaterias(datos)) {
      if (frescos.includes(m.nombre)) expect(m.estado).toBe("por-orden");
    }
    const alertas = construirAlertas(datos).map((a) => a.texto);
    for (const nombre of frescos) expect(alertas.some((t) => t.includes(nombre))).toBe(false);
  });
});

describe("pagos a proveedores", () => {
  const datos = {
    hoy: HASTA,
    operaciones: e.operaciones,
    ordenes: e.ordenesProduccion,
    lotes: e.productosTerminados,
    inventario: e.inventarioMateriaPrima,
    materiaPrima: e.materiaPrima,
    compras: e.compras,
    proveedores: e.proveedores,
  };

  it("en efectivo se paga en el día; el resto, hasta 30 días después o queda pendiente", () => {
    for (const c of e.compras) {
      if (c.medioPago === "EFE") expect(c.fechaPago).toBe(c.fecha);
      if (c.fechaPago) expect(c.fechaPago >= c.fecha && c.fechaPago <= HASTA).toBe(true);
    }
    const pendientes = e.compras.filter((c) => !c.fechaPago);
    expect(pendientes.length).toBeGreaterThan(0);
    expect(pendientes.every((c) => c.fecha >= "2026-08-01")).toBe(true);
  });

  it("las compras impagas de más de 30 días dan una alerta", () => {
    const atrasadas = e.compras.filter((c) => !c.fechaPago && c.fecha < "2026-09-15");
    const alerta = construirAlertas(datos).find((a) => a.texto.startsWith("Pagos a proveedores atrasados"));
    if (atrasadas.length === 0) expect(alerta).toBeUndefined();
    else expect(alerta?.detalle).toMatch(new RegExp(`^${atrasadas.length} compra`));
    const alDia = construirAlertas({ ...datos, compras: e.compras.map((c) => ({ ...c, fechaPago: c.fechaPago ?? c.fecha })) });
    expect(alDia.some((a) => a.texto.startsWith("Pagos a proveedores atrasados"))).toBe(false);
  });
});
