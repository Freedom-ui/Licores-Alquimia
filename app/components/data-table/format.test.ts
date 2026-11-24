// Unitarias del formato de las celdas de las tablas y del armado de los formularios.

import { describe, expect, it } from "vitest";
import { formatCellValue, getFormGridColumns, rowToFormValues } from "./format";
import type { Column } from "./types";

describe("formatCellValue", () => {
  it("una fecha AAAA-MM-DD se muestra ese mismo día (no un día antes por la zona horaria)", () => {
    expect(formatCellValue("2026-10-01", "date")).toBe("01/10/2026");
    expect(formatCellValue("2026-01-01", "date")).toBe("01/01/2026");
  });

  it("montos en pesos argentinos con dos decimales", () => {
    expect(formatCellValue(12345.5, "currency").replace(/\s/g, " ")).toBe("$ 12.345,50");
  });

  it.each([null, undefined, ""])("un valor vacío (%s) se muestra como «—»", (v) => {
    expect(formatCellValue(v, "currency")).toBe("—");
  });

  it("un valor que no se puede interpretar se muestra tal cual, sin romper la tabla", () => {
    expect(formatCellValue("abc", "currency")).toBe("abc");
    expect(formatCellValue("no-es-fecha", "date")).toBe("no-es-fecha");
  });
});

describe("Formularios", () => {
  it.each([
    [1, 1],
    [2, 2],
    [4, 2],
    [5, 3],
    [9, 3],
    [16, 3],
  ])("%i campos → grilla de %i columnas (tope 3)", (campos, columnas) => {
    expect(getFormGridColumns(campos)).toBe(columnas);
  });

  it("los números de una fila se pasan al formulario con coma decimal y los vacíos como texto vacío", () => {
    const campos = [{ key: "precio" }, { key: "nota" }] as Column<Record<string, unknown>>[];
    expect(rowToFormValues(campos, { precio: 1234.5, nota: null })).toEqual({ precio: "1234,5", nota: "" });
  });
});
