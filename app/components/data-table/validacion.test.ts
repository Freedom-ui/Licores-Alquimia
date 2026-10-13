import { describe, expect, it } from "vitest";
import {
  enmascararFecha,
  esFechaReal,
  fechaATexto,
  textoAFecha,
  filtrarNumero,
  hoyLocal,
  normalizarCbu,
  normalizarCodigoBarras,
  normalizarCuit,
  normalizarTexto,
  parsearNumero,
  reglaCantidad,
  reglaMonto,
  validarAlias,
  validarCbu,
  validarCodigoBarras,
  validarCuit,
  validarEmail,
  validarFecha,
  validarNumero,
  validarTelefono,
  validarTexto,
} from "./validacion";

const ok = null;
const falla = expect.any(String);

describe("textos", () => {
  it("recorta y colapsa espacios", () => {
    expect(normalizarTexto("  Juan   Pérez ")).toBe("Juan Pérez");
    expect(normalizarTexto(undefined)).toBe("");
    expect(normalizarTexto({})).toBe("");
  });
  it("obligatorio y largo máximo", () => {
    expect(validarTexto("   ", { que: "el nombre", requerido: true, max: 10 })).toBe("Completá el nombre.");
    expect(validarTexto("", { que: "el nombre", max: 10 })).toBe(ok);
    expect(validarTexto("x".repeat(11), { que: "el nombre", max: 10 })).toMatch(/hasta 10 caracteres/);
  });
});

describe("números", () => {
  it.each([
    ["", null],
    ["12", 12],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["abc", NaN],
    ["1e5", NaN],
    ["12,345,6", NaN],
    ["0x10", NaN],
    [7, 7],
    [Infinity, NaN],
    [null, null],
    [{}, NaN],
  ])("parsearNumero(%j) = %s", (raw, esperado) => {
    expect(parsearNumero(raw)).toEqual(esperado);
  });

  it("cantidades enteras > 0", () => {
    const r = reglaCantidad("la cantidad", true);
    expect(validarNumero(12, r)).toBe(ok);
    expect(validarNumero(null, r)).toMatch(/Ingresá la cantidad, por ejemplo 12/);
    expect(validarNumero(0, r)).toMatch(/mayor a 0/);
    expect(validarNumero(-5, r)).toMatch(/negativo/);
    expect(validarNumero(1.5, r)).toMatch(/entero/);
    expect(validarNumero(NaN, r)).toMatch(/solo números/);
    expect(validarNumero(2_000_000, r)).toMatch(/demasiado grande/);
  });

  it("montos: > 0 y hasta 2 decimales", () => {
    const r = reglaMonto("el precio");
    expect(validarNumero(1500.5, r)).toBe(ok);
    expect(validarNumero(0.01, r)).toBe(ok);
    expect(validarNumero(10.123, r)).toMatch(/2 decimales/);
    expect(validarNumero(0, r)).toMatch(/mayor a 0/);
    expect(validarNumero(1e9, r)).toMatch(/demasiado grande/);
    expect(validarNumero(null, { ...r, requerido: false })).toBe(ok);
  });

  it("el filtro de los inputs no deja escribir letras ni signos", () => {
    expect(filtrarNumero("12a,5b", true)).toBe("12,5");
    expect(filtrarNumero("-3", true)).toBe("3");
    expect(filtrarNumero("1.2.3", true)).toBe("1.23");
    expect(filtrarNumero("1e5", false)).toBe("15");
    expect(filtrarNumero("12,5", false)).toBe("125");
  });
});

describe("fechas", () => {
  it.each(["2026-02-28", "2024-02-29", "2020-01-01"])("%s es real", (f) => expect(esFechaReal(f)).toBe(true));
  it.each(["2026-02-30", "2025-02-29", "8276847-01-01", "43/234/8276847", "2026-13-01", "2026-1-5", ""])(
    "%s no es una fecha real",
    (f) => expect(esFechaReal(f)).toBe(false)
  );

  it("rango: desde 2020 hasta hoy", () => {
    const op = { que: "la fecha", requerido: true };
    expect(validarFecha("2026-01-15", op)).toBe(ok);
    expect(validarFecha(hoyLocal(), op)).toBe(ok);
    expect(validarFecha("2019-12-31", op)).toMatch(/anterior al 01\/01\/2020/);
    expect(validarFecha("2999-01-01", op)).toMatch(/futura/);
    expect(validarFecha("2026-02-30", op)).toMatch(/no es válida/);
    expect(validarFecha("", op)).toBe("Ingresá la fecha (dd/mm/aaaa), por ejemplo 15/03/2026.");
    expect(validarFecha("15/10/20", op)).toMatch(/no es válida/);
    expect(validarFecha("", { que: "la fecha" })).toBe(ok);
    expect(validarFecha("2035-01-01", { que: "el vencimiento", max: "2040-12-31" })).toBe(ok);
  });
});

describe("fecha escrita como dd/mm/aaaa", () => {
  it("pone las barras solas y no deja escribir letras ni más de 8 números", () => {
    expect(enmascararFecha("1")).toBe("1");
    expect(enmascararFecha("15")).toBe("15");
    expect(enmascararFecha("151")).toBe("15/1");
    expect(enmascararFecha("1510")).toBe("15/10");
    expect(enmascararFecha("15102026")).toBe("15/10/2026");
    expect(enmascararFecha("15/10/2026999")).toBe("15/10/2026");
    expect(enmascararFecha("1a5-10x")).toBe("15/10");
  });
  it("convierte a la fecha que se guarda solo si está completa y existe", () => {
    expect(textoAFecha("15/10/2026")).toBe("2026-10-15");
    expect(textoAFecha("31/02/2026")).toBe("31/02/2026");
    expect(textoAFecha("15/10/20")).toBe("15/10/20");
    expect(textoAFecha("")).toBe("");
    expect(fechaATexto("2026-10-15")).toBe("15/10/2026");
    expect(fechaATexto("15/10")).toBe("15/10");
  });
});

describe("CUIT / CUIL", () => {
  it.each(["30-71401632-2", "30714016322", "30 - 71401632 - 2", "20-38277358-7", "27-30456712-6"])("%s es válido", (c) =>
    expect(validarCuit(c)).toBe(ok)
  );
  it("normaliza a XX-XXXXXXXX-X", () => {
    expect(normalizarCuit("30 71401632 2")).toBe("30-71401632-2");
    expect(normalizarCuit("30.71401632.2")).toBe("30-71401632-2");
  });
  it("rechaza los inválidos con un mensaje claro", () => {
    expect(validarCuit("30-71401632-3")).toMatch(/dígito verificador/);
    expect(validarCuit("30-7140163-2")).toMatch(/11 números/);
    expect(validarCuit("99-71401632-2")).toMatch(/dos primeros/);
    expect(validarCuit("30-7140A632-2")).toMatch(/solo números/);
    expect(validarCuit("", { requerido: true })).toMatch(/Ingresá el CUIT/);
    expect(validarCuit("")).toBe(ok);
  });
});

describe("contacto", () => {
  it("email", () => {
    expect(validarEmail("ventas@empresa.com.ar")).toBe(ok);
    expect(validarEmail("")).toBe(ok);
    expect(validarEmail("ventas@empresa")).toEqual(falla);
    expect(validarEmail("ventas empresa.com")).toEqual(falla);
    expect(validarEmail("a@b.c")).toEqual(falla);
  });
  it("teléfono", () => {
    expect(validarTelefono("223 - 519 - 9971")).toBe(ok);
    expect(validarTelefono("+54 9 (223) 519-9971")).toBe(ok);
    expect(validarTelefono("223-abc")).toMatch(/solo números/);
    expect(validarTelefono("1234")).toMatch(/entre 8 y 15/);
  });
});

describe("datos bancarios", () => {
  it("CBU con sus dos dígitos verificadores", () => {
    expect(validarCbu("0070199620000004630951")).toBe(ok);
    expect(validarCbu("0070 1996 2000 0004 6309 51")).toBe(ok);
    expect(normalizarCbu("0070-1996-20000004630951")).toBe("0070199620000004630951");
    expect(validarCbu("0070199620000004630952")).toMatch(/verificadores/);
    expect(validarCbu("007019962000000463095")).toMatch(/22 números/);
    expect(validarCbu("")).toBe(ok);
  });
  it("alias", () => {
    expect(validarAlias("CIBARTSRL")).toBe(ok);
    expect(validarAlias("mi.alias-mp")).toBe(ok);
    expect(validarAlias("corto")).toMatch(/entre 6 y 20/);
    expect(validarAlias("con espacio")).toEqual(falla);
    expect(validarAlias("ñandú.pago")).toEqual(falla);
  });
});

describe("código de barras CODE39", () => {
  it("acepta lo que imprime CODE39 y pasa a mayúsculas", () => {
    expect(normalizarCodigoBarras(" 2611122201tra ")).toBe("2611122201TRA");
    expect(validarCodigoBarras("2611122201tra")).toBe(ok);
    expect(validarCodigoBarras("ABC-123 $/+%.")).toBe(ok);
  });
  it("rechaza caracteres que CODE39 no puede imprimir", () => {
    expect(validarCodigoBarras("ÑANDÚ")).toEqual(falla);
    expect(validarCodigoBarras("A*B")).toEqual(falla);
    expect(validarCodigoBarras("")).toEqual(falla);
    expect(validarCodigoBarras("X".repeat(41))).toMatch(/hasta 40/);
  });
});
