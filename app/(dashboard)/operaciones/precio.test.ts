import { describe, expect, it } from "vitest";
import { precioSugerido } from "./precio";
import { motivoSinRemito } from "./remito";
import { lineaPorFormato } from "../productos/data";

const tradicional = { precioUnitario: 10000, linea: "Tradicional" as const };
const premium = { precioUnitario: 25000, linea: "Premium" as const };
const bidon = { precioUnitario: 35000, linea: "Lista" as const };
const mayorista = { precioTradicional: 5900, precioPremium: 17000 };
const sinPremium = { precioTradicional: 4900, precioPremium: null };

describe("precio sugerido de una venta", () => {
  it("al público (Menor) va siempre el de lista", () => {
    expect(precioSugerido(tradicional, mayorista, "Menor").precio).toBe(10000);
    expect(precioSugerido(premium, mayorista, "Menor").precio).toBe(25000);
  });

  it("a un mayorista, el precio del cliente para la línea del producto", () => {
    expect(precioSugerido(tradicional, mayorista, "Mayor")).toEqual({ precio: 5900, origen: "Precio del cliente (Tradicional)" });
    expect(precioSugerido(premium, mayorista, "Mayor")).toEqual({ precio: 17000, origen: "Precio del cliente (Premium)" });
  });

  it("sin precio del cliente, sin cliente o con línea Lista, el de lista", () => {
    expect(precioSugerido(premium, sinPremium, "Mayor").precio).toBe(25000);
    expect(precioSugerido(tradicional, { precioTradicional: 0, precioPremium: null }, "Mayor").precio).toBe(10000);
    expect(precioSugerido(tradicional, undefined, "Mayor").precio).toBe(10000);
    expect(precioSugerido(bidon, mayorista, "Mayor").precio).toBe(35000);
    expect(precioSugerido(tradicional, mayorista, "").precio).toBe(10000);
  });

  it("la línea que corresponde a cada formato", () => {
    expect(lineaPorFormato("500 cc")).toBe("Tradicional");
    expect(lineaPorFormato("750 cc Premium")).toBe("Premium");
    expect(lineaPorFormato("750 cc")).toBe("Premium");
    expect(lineaPorFormato(" 5000 cc")).toBe("Lista");
  });
});

describe("remito", () => {
  it("solo con ventas del mismo cliente y la misma fecha", () => {
    expect(motivoSinRemito([{ clienteId: 1, fecha: "2026-10-01" }, { clienteId: 1, fecha: "2026-10-01" }])).toBeNull();
    expect(motivoSinRemito([{ clienteId: 1, fecha: "2026-10-01" }, { clienteId: 2, fecha: "2026-10-01" }])).toMatch(/un solo cliente/);
    expect(motivoSinRemito([{ clienteId: 1, fecha: "2026-10-01" }, { clienteId: 1, fecha: "2026-10-02" }])).toMatch(/una sola fecha/);
    expect(motivoSinRemito([])).not.toBeNull();
  });
});
