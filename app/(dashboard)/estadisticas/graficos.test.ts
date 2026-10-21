import { describe, expect, it } from "vitest";
import { ajustarAlAncho, barras, barrasAgrupadas, dona } from "./graficos";

const productos = ["Limón — 500 cc", "Limón — 5000 cc", "Limón, con N., P. e H. — 500 cc", "Limón, con M. y J. — 500 cc"];
const eje = (o: ReturnType<typeof ajustarAlAncho>, k: "xAxis" | "yAxis") =>
  (o[k] as { axisLabel: { width?: number; rotate?: number; overflow?: string } }).axisLabel;

describe("ajustarAlAncho", () => {
  it("las etiquetas de categorías miden lo que su lugar en el eje", () => {
    const o = barras(productos, [1, 2, 3, 4], "moneda");
    const ancho = eje(ajustarAlAncho(o, 872), "xAxis");
    expect(ancho.width).toBe(192);
    expect(ancho.rotate).toBeUndefined();
  });

  it("si no entran derechas, van inclinadas", () => {
    const o = barrasAgrupadas([...productos, ...productos], [{ nombre: "a", datos: [1, 2, 3, 4, 5, 6, 7, 8], color: "#000" }], "moneda");
    const angosto = eje(ajustarAlAncho(o, 420), "xAxis");
    expect(angosto.rotate).toBe(35);
    expect(angosto.overflow).toBe("truncate");
  });

  it("en barras horizontales angostas los nombres no pasan de un tercio", () => {
    const o = barras(productos, [1, 2, 3, 4], "numero", { horizontal: true });
    expect(eje(ajustarAlAncho(o, 300), "yAxis").width).toBe(100);
    expect(eje(ajustarAlAncho(o, 900), "yAxis").width).toBe(140);
  });

  it("la leyenda de una dona con muchas porciones baja si no entra al lado", () => {
    const pares = productos.map((nombre, i) => ({ nombre, valor: i + 1 }));
    const o = dona(pares, "numero");
    expect((ajustarAlAncho(o, 380).legend as { orient: string }).orient).toBe("horizontal");
    expect((ajustarAlAncho(o, 640).legend as { orient: string }).orient).toBe("vertical");
  });

  it("sin ancho no cambia nada", () => {
    const o = barras(productos, [1, 2, 3, 4], "moneda");
    expect(ajustarAlAncho(o, 0)).toBe(o);
  });
});

describe("ajustarAlAncho con alto", () => {
  it("la dona deja abajo el lugar de los renglones de la leyenda", () => {
    const pares = productos.concat(["Limón — 750 cc Premium", "Otros"]).map((nombre, i) => ({ nombre, valor: i + 1 }));
    const serie = (ancho: number) =>
      (ajustarAlAncho(dona(pares, "numero"), ancho, 330).series as { center: [string, number]; radius: [number, number] }[])[0];
    // 270 px → un ítem por renglón → 6 renglones (120 px): quedan 198 px arriba.
    expect(serie(270).center[1]).toBe(99);
    expect(serie(270).radius[1]).toBeLessThanOrEqual(99);
    // Más ancho entran de a dos: menos renglones, la dona baja.
    expect(serie(420).center[1]).toBeGreaterThan(99);
  });

  it("en una tarjeta estirada (mucho más alta que ancha) la dona no se pasa del ancho", () => {
    const pares = ["MPR", "MPA", "Efectivo", "Cuenta DNI"].map((nombre, i) => ({ nombre, valor: i + 1 }));
    const serie = (ajustarAlAncho(dona(pares, "numero"), 330, 1000).series as { radius: [number, number] }[])[0];
    expect(serie.radius[1]).toBeLessThanOrEqual(330 * 0.4);
  });
});

describe("ajustarAlAncho con etiquetas cortas", () => {
  it("no inclina etiquetas que entran derechas aunque el lugar sea chico", () => {
    const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const o = barras(dias, [1, 2, 3, 4, 5, 6, 7], "moneda");
    expect(eje(ajustarAlAncho(o, 330), "xAxis").rotate).toBeUndefined();
  });
});

describe("ajustarAlAncho en tarjetas angostas", () => {
  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  it("no parte una palabra corta en dos renglones", () => {
    const o = ajustarAlAncho(barras(dias, [1, 2, 3, 4, 5, 6, 7], "moneda"), 330);
    expect(eje(o, "xAxis").width).toBeGreaterThanOrEqual(3 * 6.2 + 8);
  });

  it("oculta los montos sobre barras si no entran", () => {
    const serie = (ancho: number) => (ajustarAlAncho(barras(dias, [1, 2, 3, 4, 5, 6, 7], "moneda"), ancho).series as { label: { show: boolean } }[])[0];
    expect(serie(330).label.show).toBe(false);
    expect(serie(700).label.show).toBe(true);
  });

  it("los deja en el gráfico del Panel en 1366 (12 semanas en ~730 px)", () => {
    const semanas = Array.from({ length: 12 }, (_, i) => `${i + 1}/10`);
    const o = ajustarAlAncho(barras(semanas, semanas.map((_, i) => i * 1000), "moneda"), 730);
    expect((o.series as { label: { show: boolean } }[])[0].label.show).toBe(true);
  });
});

describe("ajustarAlAncho: porcentajes dentro de la dona", () => {
  const pares = ["Contado", "Crédito", "Consignación"].map((nombre, i) => ({ nombre, valor: i + 1 }));
  const label = (ancho: number, alto: number) =>
    (ajustarAlAncho(dona(pares, "numero"), ancho, alto).series as { label: { show?: boolean } }[])[0].label.show;

  it("se ocultan si el anillo es más angosto que el texto", () => {
    // 260 px: radio 130 → anillo de 42 % a 72 % = 39 px.
    expect(label(260, 400)).toBe(false);
  });

  it("se muestran si hay lugar", () => {
    expect(label(600, 400)).not.toBe(false);
  });
});
