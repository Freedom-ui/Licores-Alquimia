import { describe, expect, it } from "vitest";
import { copiasABorrar, leerNombre, nombreCopia, type InfoCopia, type Motivo } from "./nombres";

const copia = (fecha: Date, motivo: Motivo = "automatica"): InfoCopia => ({ nombre: nombreCopia(fecha, motivo), fecha, motivo });

describe("nombres de copias", () => {
  it("ida y vuelta con fecha local y motivo", () => {
    const f = new Date(2026, 9, 24, 7, 5, 9);
    expect(nombreCopia(f, "antes-de-importar")).toBe("alquimia-2026-10-24-070509-antes-de-importar.db");
    expect(leerNombre("alquimia-2026-10-24-070509-antes-de-importar.db")).toEqual({
      nombre: "alquimia-2026-10-24-070509-antes-de-importar.db",
      fecha: f,
      motivo: "antes-de-importar",
    });
    expect(leerNombre("alquimia-2026-10-24-070509-manual.db.gz")?.motivo).toBe("manual");
  });

  it("ignora lo que no es una copia de la app", () => {
    expect(leerNombre("antes-de-importar-20261015-190127.db")).toBeNull();
    expect(leerNombre("alquimia-2026-10-24-070509-otro.db")).toBeNull();
    expect(leerNombre("alquimia-2026-02-30-070509-manual.db")).toBeNull();
    expect(leerNombre("dev.db")).toBeNull();
  });
});

describe("copiasABorrar", () => {
  const ahora = new Date(2026, 9, 24, 12, 0, 0);
  const haceDias = (d: number, h = 10) => new Date(2026, 9, 24 - d, h, 0, 0);

  it("conserva todo lo de los últimos 2 días", () => {
    const copias = [copia(haceDias(0, 9)), copia(haceDias(0, 11)), copia(haceDias(1, 9)), copia(haceDias(1, 20))];
    expect(copiasABorrar(copias, ahora)).toEqual([]);
  });

  it("de ahí a 30 días, la última de cada día", () => {
    const temprano = copia(haceDias(5, 9));
    const tarde = copia(haceDias(5, 20));
    expect(copiasABorrar([temprano, tarde], ahora)).toEqual([temprano]);
  });

  it("más viejas, la última de cada mes durante 24 meses; siempre queda la más nueva", () => {
    const mayo1 = copia(new Date(2026, 4, 3));
    const mayo2 = copia(new Date(2026, 4, 28));
    const viejisima = copia(new Date(2023, 0, 10));
    const nueva = copia(haceDias(0));
    expect(copiasABorrar([mayo1, mayo2, viejisima, nueva], ahora)).toEqual([mayo1, viejisima]);
    expect(copiasABorrar([viejisima], ahora)).toEqual([]);
  });

  it("las de antes de importar / restaurar duran 60 días y no ocupan el lugar del día", () => {
    const importar = copia(haceDias(10, 21), "antes-de-importar");
    const auto = copia(haceDias(10, 8));
    const vieja = copia(haceDias(70), "antes-de-restaurar");
    expect(copiasABorrar([importar, auto, vieja, copia(haceDias(0))], ahora)).toEqual([vieja]);
  });
});
