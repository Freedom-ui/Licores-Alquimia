// Unitarias de Estadísticas: períodos (bordes de mes, año y bisiesto),
// cortes de los gráficos y las métricas de ventas, costo, margen y stock.
// Los resultados esperados están calculados a mano a partir de los datos de abajo.

import { describe, expect, it } from "vitest";
import type { OperacionRow } from "../operaciones/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { OrdenProduccionRow } from "../ordenes-produccion/data";
import { buckets, diasEntre, granularidadPara, rangoComparacion, resolverPeriodo } from "./periodo";
import { rankingClientes, resumenProduccion, resumenVentas, stockLotes, topN, variacion, ventasEn, type Datos } from "./calculos";

const op = (id: number, fecha: string, clienteId: number, cliente: string, cantidad: number, pu: number, productoId = 1): OperacionRow => ({
  id,
  fecha,
  clienteId,
  cliente,
  vendedor: "ALQUIMIA",
  cantidad,
  productoId,
  descripcion: productoId === 1 ? "Licor Fino de Limón — 500 cc" : "Licor de Naranja — 500 cc",
  canal: "Menor",
  condicion: "Contado",
  pu,
  subTotal: cantidad * pu,
});

const salida = (id: number, fecha: string, cantidad: number, origenOperacionId: number) => ({ id, fecha, tipo: "salida" as const, cantidad, origenOperacionId });

// Lote A: 10 botellas a $2000 de costo; salieron 3 (venta 1) y 2 (venta 2) → quedan 5.
// Lote B: 2 botellas; salieron 3 (se vendió de más) → queda -1.
// La venta 3 es de un producto sin lote cargado: no tiene costo conocido.
const loteA: LoteTerminado = { id: 1, lote: 101, productoId: 1, producto: "Licor Fino de Limón", formato: "500 cc", existenciaInicial: 10, costoUnitario: 2000, fechaVencimiento: "2026-11-30", movimientos: [salida(1, "2026-10-05", 3, 1), salida(2, "2026-10-20", 2, 2)] };
const loteB: LoteTerminado = { id: 2, lote: 102, productoId: 1, producto: "Licor Fino de Limón", formato: "500 cc", existenciaInicial: 2, costoUnitario: 1500, movimientos: [salida(1, "2026-10-21", 3, 99)] };

const datos: Datos = {
  hoy: "2026-10-31",
  operaciones: [
    op(1, "2026-10-05", 1, "BAR UNO", 3, 10000),
    op(2, "2026-10-20", 2, "BAR DOS", 2, 9000),
    op(3, "2026-10-25", 1, "BAR UNO", 4, 10000, 9),
    op(4, "2026-09-30", 2, "BAR DOS", 1, 5000), // fuera de octubre
  ],
  ordenes: [],
  lotes: [loteA, loteB],
  inventario: [],
  materiaPrima: [],
  compras: [],
  proveedores: [],
};
const OCTUBRE = { desde: "2026-10-01", hasta: "2026-10-31" };

describe("Períodos (resolverPeriodo / rangoComparacion)", () => {
  it("«Este mes» va del 1° a hoy", () => {
    expect(resolverPeriodo("mes", OCTUBRE, "2026-10-17")).toEqual({ desde: "2026-10-01", hasta: "2026-10-17" });
  });

  it("«Mes anterior» en enero es diciembre del año anterior, completo", () => {
    expect(resolverPeriodo("mesAnterior", OCTUBRE, "2026-01-10")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
  });

  it("«Mes anterior» en marzo de un año bisiesto termina el 29 de febrero", () => {
    expect(resolverPeriodo("mesAnterior", OCTUBRE, "2028-03-05")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });

  it("«Últimos 30 días» incluye hoy: son 30 días, no 31", () => {
    const r = resolverPeriodo("30d", OCTUBRE, "2026-10-31");
    expect(diasEntre(r.desde, r.hasta) + 1).toBe(30);
  });

  it("un rango personalizado al revés (desde > hasta) se da vuelta", () => {
    expect(resolverPeriodo("personalizado", { desde: "2026-10-31", hasta: "2026-10-01" }, "2026-11-01")).toEqual(OCTUBRE);
  });

  it("el período anterior tiene el mismo largo y termina el día antes", () => {
    expect(rangoComparacion(OCTUBRE, "anterior")).toEqual({ desde: "2026-08-31", hasta: "2026-09-30" });
  });

  it("«vs. año anterior» corre las fechas un año; «sin comparar» no da rango", () => {
    expect(rangoComparacion(OCTUBRE, "anioAnterior")).toEqual({ desde: "2025-10-01", hasta: "2025-10-31" });
    expect(rangoComparacion(OCTUBRE, "ninguna")).toBeNull();
  });
});

describe("Cortes de los gráficos (granularidadPara / buckets)", () => {
  it.each([
    [31, "dia"],
    [32, "semana"],
    [120, "semana"],
    [121, "mes"],
  ])("un rango de %i días se muestra por %s", (dias, esperado) => {
    const desde = "2026-01-01";
    const hasta = new Date(2026, 0, dias);
    const r = { desde, hasta: `${hasta.getFullYear()}-${String(hasta.getMonth() + 1).padStart(2, "0")}-${String(hasta.getDate()).padStart(2, "0")}` };
    expect(granularidadPara(r)).toBe(esperado);
  });

  it("por mes, el primer y el último corte se recortan al rango", () => {
    const b = buckets({ desde: "2026-01-15", hasta: "2026-03-10" }, "mes");
    expect(b.map((x) => [x.desde, x.hasta, x.etiqueta])).toEqual([
      ["2026-01-15", "2026-01-31", "Ene 26"],
      ["2026-02-01", "2026-02-28", "Feb 26"],
      ["2026-03-01", "2026-03-10", "Mar 26"],
    ]);
  });

  it("por semana, la última semana incompleta termina en el fin del rango", () => {
    const b = buckets({ desde: "2026-10-01", hasta: "2026-10-10" }, "semana");
    expect(b).toHaveLength(2);
    expect(b[1]).toMatchObject({ desde: "2026-10-08", hasta: "2026-10-10" });
  });
});

describe("Ventas, costo y margen (ventasEn / resumenVentas)", () => {
  const octubre = ventasEn(datos, OCTUBRE);

  it("toma solo las ventas del período", () => {
    expect(octubre.map((v) => v.id)).toEqual([1, 2, 3]);
  });

  it("el costo de cada venta sale de los lotes de los que salió", () => {
    expect(octubre.map((v) => [v.costo, v.conCosto])).toEqual([
      [6000, true], // 3 × $2000
      [4000, true], // 2 × $2000
      [0, false], // sin lote: costo desconocido
    ]);
  });

  it("resumen del mes: facturación, ticket, margen y cobertura", () => {
    const r = resumenVentas(octubre);

    expect(r).toMatchObject({
      facturacion: 88000, // 30000 + 18000 + 40000
      unidades: 9,
      operaciones: 3,
      ticket: 29333.33, // 88000 / 3
      precioUnidad: 9777.78, // 88000 / 9
      clientes: 2,
      facturacionConCosto: 48000, // la venta 3 no entra en el margen
      costo: 10000,
      margen: 38000,
    });
    expect(r.margenPct).toBeCloseTo(38000 / 48000, 10);
    expect(r.cobertura).toBeCloseTo(48000 / 88000, 10);
  });

  it("sin ventas: todo en cero y sin porcentajes (no divide por cero)", () => {
    expect(resumenVentas([])).toMatchObject({ facturacion: 0, ticket: 0, precioUnidad: 0, margenPct: null, cobertura: null });
  });

  it("ranking de clientes: ordenado por facturación y las participaciones suman 100 %", () => {
    const r = rankingClientes(octubre);

    expect(r.map((c) => [c.cliente, c.operaciones, c.unidades, c.facturacion, c.ultimaCompra])).toEqual([
      ["BAR UNO", 2, 7, 70000, "2026-10-25"],
      ["BAR DOS", 1, 2, 18000, "2026-10-20"],
    ]);
    expect(r.reduce((s, c) => s + c.participacion, 0)).toBeCloseTo(1, 10);
  });
});

describe("Variación y agrupado", () => {
  it.each([
    [120, 100, 0.2],
    [80, 100, -0.2],
    [50, -100, 1.5],
  ])("de %i a %i (anterior) es %f", (actual, previo, esperado) => {
    expect(variacion(actual, previo)).toBeCloseTo(esperado, 10);
  });

  it("sin período anterior o con cero no hay variación (no es infinito)", () => {
    expect(variacion(100, 0)).toBeNull();
    expect(variacion(100, null)).toBeNull();
  });

  it("topN deja los primeros y suma el resto en «Otros»", () => {
    const pares = [5, 4, 3, 2, 1].map((v, i) => ({ nombre: `P${i}`, valor: v }));
    expect(topN(pares, 3)).toEqual([...pares.slice(0, 3), { nombre: "Otros", valor: 3 }]);
    expect(topN(pares, 5)).toEqual(pares);
  });
});

describe("Stock y producción", () => {
  it("saldo, valor y días para vencer de cada lote; un saldo negativo no vale plata negativa", () => {
    const s = stockLotes(datos);

    expect(s.map((l) => [l.lote.lote, l.saldo, l.valor, l.diasParaVencer, l.ultimoMovimiento])).toEqual([
      [101, 5, 10000, 30, "2026-10-20"],
      [102, -1, 0, null, "2026-10-21"],
    ]);
  });

  it("producción del período: unidades, costo por botella y días de maceración promedio", () => {
    const orden = (id: number, maceracion: string, embotellado: string | null, cantidad: number | null, costo: number) =>
      ({ id, fechaMaceracion: maceracion, fechaEmbotellado: embotellado, cantidadProducida: cantidad, costoTotal: costo, insumos: [] }) as unknown as OrdenProduccionRow;
    const d = {
      ...datos,
      ordenes: [orden(1, "2026-09-01", "2026-10-01", 100, 50000), orden(2, "2026-09-11", "2026-10-11", 50, 40000), orden(3, "2026-10-15", null, null, 0)],
    };

    const r = resumenProduccion(d, OCTUBRE);

    expect(r).toMatchObject({ unidades: 150, costoTotal: 90000, costoPorBotella: 600, diasMaceracionPromedio: 30, iniciadas: 1 });
  });
});
