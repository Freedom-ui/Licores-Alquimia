// Tests unitarios del TP de testing (Clase 10). Tres reglas de la app con
// valores límite, escritos con el patrón Preparar / Ejecutar / Verificar.
// Se corren con:  npx vitest run "app/(dashboard)/_dominio/entrega.test.ts"

import { describe, expect, it } from "vitest";
import type { Estado } from "./acciones";
import { faltanteDeVenta } from "./reglas";
import { validarCuit } from "@/app/components/data-table/validacion";
import { validarUsuario } from "@/lib/auth/reglas";

// ── 1. Aviso de stock (el mismo caso que CP-002) ────────────────────────────
// Regla: si la venta pide más botellas de las que hay, la app avisa cuántas
// faltan. Un lote con 11 botellas: vender 10 y 11 no falta nada; vender 12 falta 1.

function estadoConUnLote(botellas: number, embotellado: string | null = null): Estado {
  return {
    operaciones: [],
    ordenesProduccion: embotellado ? [{ id: 1, fechaEmbotellado: embotellado }] : [],
    productosTerminados: [
      {
        id: 105,
        lote: 105,
        productoId: 4,
        producto: "Licor Fino de Limón",
        formato: "5000 cc",
        existenciaInicial: botellas,
        costoUnitario: 0,
        origenOrdenId: embotellado ? 1 : undefined,
        movimientos: [],
      },
    ],
  } as unknown as Estado;
}

describe("Aviso de stock al vender (faltanteDeVenta)", () => {
  it("vender 10 con 11 en stock (justo adentro): no falta nada", () => {
    // Preparar
    const estado = estadoConUnLote(11);
    // Ejecutar
    const aviso = faltanteDeVenta(estado, { id: null, productoId: 4, fecha: "2026-10-20", cantidad: 10 });
    // Verificar
    expect(aviso.faltan).toBe(0);
  });

  it("vender 11 con 11 en stock (el límite justo): no falta nada", () => {
    const estado = estadoConUnLote(11);
    const aviso = faltanteDeVenta(estado, { id: null, productoId: 4, fecha: "2026-10-20", cantidad: 11 });
    expect(aviso.faltan).toBe(0);
  });

  it("vender 12 con 11 en stock (justo afuera): falta 1 botella", () => {
    const estado = estadoConUnLote(11);
    const aviso = faltanteDeVenta(estado, { id: null, productoId: 4, fecha: "2026-10-20", cantidad: 12 });
    expect(aviso.faltan).toBe(1);
  });

  it("vender el día antes del embotellado: no hay lote disponible", () => {
    const estado = estadoConUnLote(11, "2026-10-10");
    expect(faltanteDeVenta(estado, { id: null, productoId: 4, fecha: "2026-10-10", cantidad: 1 }).sinLote).toBe(false);
    expect(faltanteDeVenta(estado, { id: null, productoId: 4, fecha: "2026-10-09", cantidad: 1 }).sinLote).toBe(true);
  });
});

// ── 2. CUIT: tiene que tener exactamente 11 números y el dígito verificador bien ──

describe("Validación del CUIT (validarCuit)", () => {
  it("con 11 números y el dígito verificador correcto, lo acepta", () => {
    expect(validarCuit("30-71234567-1")).toBeNull();
  });

  it("con 10 o 12 números (uno menos y uno más), lo rechaza", () => {
    expect(validarCuit("3071234567")).toContain("tiene 10");
    expect(validarCuit("307123456712")).toContain("tiene 12");
  });

  it("con el dígito verificador mal, lo rechaza", () => {
    expect(validarCuit("30-71234567-2")).toContain("dígito verificador");
  });
});

// ── 3. Nombre de usuario: de 3 a 30 caracteres ──────────────────────────────

describe("Largo del nombre de usuario (validarUsuario)", () => {
  it("2 caracteres (justo debajo del mínimo): lo rechaza", () => {
    expect(validarUsuario("ab")).not.toBeNull();
  });

  it("3 y 30 caracteres (los dos límites): los acepta", () => {
    expect(validarUsuario("abc")).toBeNull();
    expect(validarUsuario("a".repeat(30))).toBeNull();
  });

  it("31 caracteres (justo arriba del máximo): lo rechaza", () => {
    expect(validarUsuario("a".repeat(31))).not.toBeNull();
  });
});
