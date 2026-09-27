// Kardex de Inventario de materia prima: una fila del catálogo `materiaPrima`
// (store.tsx) = una tabla de Ingresos s/Insumo + Compras + Consumos + Saldo.
// Reusa el mismo patrón y motor de cálculo que Productos terminados
// (buildKardex en app/components/data-table/kardex.ts), con una diferencia:
// la entrada acá también puede traer una `cantidadSecundaria` (ej. kilos de
// cáscara al ingresar un cítrico), que es la columna "C (Cáscara)" de la
// planilla — informativa, no afecta el saldo.
//
// A propósito, este módulo NO define un catálogo propio de materias primas:
// `materiaPrimaId` referencia el catálogo que ya existe en
// app/(dashboard)/materia-prima/data.ts (nombre + unidad de medida). Acá solo
// vive el estado de inventario (existencia inicial, costo, movimientos) de
// las materias primas que ya se empezaron a trackear.

import type { KardexMovimiento } from "@/app/components/data-table/kardex";

export type { KardexMovimiento };

export type InventarioMateriaPrimaRow = {
  id: number;
  /** FK al catálogo de Materia prima (app/(dashboard)/materia-prima/data.ts). */
  materiaPrimaId: number;
  existenciaInicial: number;
  /** Costo unitario usado para valorizar Compras y Saldo (CU/CT de la planilla). */
  costoUnitario: number;
  movimientos: KardexMovimiento[];
};

export const inventarioMateriaPrimaDemo: InventarioMateriaPrimaRow[] = [
  {
    id: 1,
    materiaPrimaId: 1, // Alcohol
    existenciaInicial: 0,
    costoUnitario: 2785.55,
    movimientos: [
      { id: 1, fecha: "2026-08-02", tipo: "entrada", cantidad: 16.2, puEntrada: 2785.55 },
      { id: 2, fecha: "2026-08-03", tipo: "salida", cantidad: 6 },
      { id: 3, fecha: "2026-08-03", tipo: "salida", cantidad: 4.7 },
      { id: 4, fecha: "2026-08-06", tipo: "salida", cantidad: 5 },
      { id: 5, fecha: "2026-08-26", tipo: "entrada", cantidad: 10.8, puEntrada: 2785.55 },
      { id: 6, fecha: "2026-08-27", tipo: "salida", cantidad: 6 },
      { id: 7, fecha: "2026-08-27", tipo: "salida", cantidad: 3.7 },
      { id: 8, fecha: "2026-09-09", tipo: "entrada", cantidad: 10.8, puEntrada: 2785.55 },
      { id: 9, fecha: "2026-09-10", tipo: "salida", cantidad: 4.5 },
    ],
  },
  {
    id: 2,
    materiaPrimaId: 2, // Limón
    existenciaInicial: 5,
    costoUnitario: 850,
    movimientos: [
      { id: 1, fecha: "2026-08-05", tipo: "entrada", cantidad: 40, puEntrada: 850, cantidadSecundaria: 9.5 },
      { id: 2, fecha: "2026-08-08", tipo: "salida", cantidad: 12 },
      { id: 3, fecha: "2026-08-16", tipo: "salida", cantidad: 10 },
      { id: 4, fecha: "2026-08-24", tipo: "entrada", cantidad: 30, puEntrada: 850, cantidadSecundaria: 7.2 },
      { id: 5, fecha: "2026-08-25", tipo: "salida", cantidad: 18 },
    ],
  },
  {
    id: 3,
    materiaPrimaId: 3, // Azúcar
    existenciaInicial: 12,
    costoUnitario: 980,
    movimientos: [
      { id: 1, fecha: "2026-08-10", tipo: "salida", cantidad: 5 },
      { id: 2, fecha: "2026-08-24", tipo: "salida", cantidad: 7 },
    ],
  },
  {
    id: 4,
    materiaPrimaId: 9, // Env. 500 ml Transparente
    existenciaInicial: 200,
    costoUnitario: 145,
    movimientos: [
      { id: 1, fecha: "2026-08-08", tipo: "salida", cantidad: 1 },
      { id: 2, fecha: "2026-08-24", tipo: "salida", cantidad: 20 },
      { id: 3, fecha: "2026-09-01", tipo: "entrada", cantidad: 500, puEntrada: 145 },
    ],
  },
];
