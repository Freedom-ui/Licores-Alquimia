import { describe, expect, it } from "vitest";
import { paginasVisibles, rango } from "./paginacion";
import { numeroATexto } from "./validacion";

describe("paginador", () => {
  it("pocas páginas: todas", () => {
    expect(paginasVisibles(0, 1)).toEqual([0]);
    expect(paginasVisibles(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("muchas páginas: primera, última y vecinas, con saltos", () => {
    expect(paginasVisibles(0, 34)).toEqual([0, 1, 2, 3, 4, "…", 33]);
    expect(paginasVisibles(9, 34)).toEqual([0, "…", 8, 9, 10, "…", 33]);
    expect(paginasVisibles(33, 34)).toEqual([0, "…", 29, 30, 31, 32, 33]);
  });
});

describe("rango de selección", () => {
  const claves = [10, 20, 30, 40, 50];
  it("de la activa a la clickeada, en cualquier dirección", () => {
    expect(rango(claves, 20, 40)).toEqual([20, 30, 40]);
    expect(rango(claves, 40, 20)).toEqual([20, 30, 40]);
    expect(rango(claves, 30, 30)).toEqual([30]);
  });
  it("si la activa ya no se ve (filtrada), solo la clickeada", () => {
    expect(rango(claves, 99, 30)).toEqual([30]);
  });
});

describe("números en los formularios", () => {
  it("con coma decimal y sin separador de miles", () => {
    expect(numeroATexto(1129.81)).toBe("1129,81");
    expect(numeroATexto(1500)).toBe("1500");
    expect(numeroATexto(null)).toBe("");
  });
});
