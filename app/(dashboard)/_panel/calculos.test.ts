// Unitarias del Panel principal (lo primero que se ve al entrar): los
// indicadores del mes, las alertas, las últimas ventas y el gráfico, sobre los
// datos de ejemplo de la app y con una fecha fija.

import { describe, expect, it } from "vitest";
import { estadoDemo } from "../_dominio/demo";
import type { Datos } from "../estadisticas/calculos";
import { fmtMoneda, fmtNumero } from "../estadisticas/formato";
import { construirPanel } from "./calculos";

const demo = estadoDemo();
const datos = (hoy: string, cambios: Partial<Datos> = {}): Datos => ({
  hoy,
  operaciones: demo.operaciones,
  ordenes: demo.ordenesProduccion,
  lotes: demo.productosTerminados,
  inventario: demo.inventarioMateriaPrima,
  materiaPrima: demo.materiaPrima,
  compras: demo.compras,
  proveedores: demo.proveedores,
  ...cambios,
});
const HOY = "2026-08-31";
const kpi = (panel: ReturnType<typeof construirPanel>, id: string) => panel.kpis.find((k) => k.id === id)!;

describe("Panel principal (construirPanel)", () => {
  it("«Ventas del mes» y «Botellas vendidas» suman solo las ventas del 1° del mes a hoy", () => {
    const delMes = demo.operaciones.filter((o) => o.fecha >= "2026-08-01" && o.fecha <= HOY);

    const p = construirPanel(datos(HOY));

    expect(delMes.length).toBeGreaterThan(0);
    expect(kpi(p, "p-ventas").valor).toBe(fmtMoneda(delMes.reduce((s, o) => s + o.subTotal, 0)));
    expect(kpi(p, "p-ventas").nota).toBe(`${fmtNumero(delMes.length)} op.`);
    expect(kpi(p, "p-unidades").valor).toBe(fmtNumero(delMes.reduce((s, o) => s + o.cantidad, 0)));
  });

  it("una venta del mes anterior no cuenta en «Ventas del mes»", () => {
    const julio = { ...demo.operaciones[0], id: 9999, fecha: "2026-07-31", subTotal: 1_000_000, cantidad: 100 };
    const sin = construirPanel(datos(HOY));

    const con = construirPanel(datos(HOY, { operaciones: [...demo.operaciones, julio] }));

    expect(kpi(con, "p-ventas").valor).toBe(kpi(sin, "p-ventas").valor);
  });

  it("el indicador de alertas cuenta las alertas de la lista, y las de afuera (copias) van primero", () => {
    const extra = { nivel: "critico" as const, texto: "Sin copia de seguridad", detalle: "", destino: { href: "/configuracion" } };

    const p = construirPanel(datos(HOY), [extra]);

    expect(p.alertas[0]).toBe(extra);
    expect(kpi(p, "p-alertas").valor).toBe(fmtNumero(p.alertas.length));
  });

  it("un lote con stock negativo aparece como alerta crítica", () => {
    const lote = { ...demo.productosTerminados[0], id: 999, lote: 999, existenciaInicial: 1, fechaVencimiento: null, movimientos: [{ id: 1, fecha: "2026-08-30", tipo: "salida" as const, cantidad: 3 }] };

    const p = construirPanel(datos(HOY, { lotes: [...demo.productosTerminados, lote] }));

    expect(p.alertas).toContainEqual(expect.objectContaining({ nivel: "critico", texto: "Lote 999 con stock negativo" }));
  });

  it("«Últimas ventas» muestra como mucho 5, de la más nueva a la más vieja", () => {
    const p = construirPanel(datos(HOY));

    expect(p.ventas.length).toBeLessThanOrEqual(5);
    const fechas = p.ventas.map((v) => v.fecha.split("/").reverse().join(""));
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });

  it("sin ventas en las últimas 12 semanas el gráfico lo dice en vez de quedar vacío", () => {
    const p = construirPanel(datos("2030-01-15"));

    expect(p.grafico.vacio).toBe("Sin ventas en las últimas 12 semanas");
  });
});
