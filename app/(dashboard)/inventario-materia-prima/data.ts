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

// Punto de partida del demo: solo la existencia previa al sistema (stock sin
// compra registrada). El resto de los movimientos NO se cargan acá: el store
// los genera al iniciar a partir del Libro de compras (ingresos) y de las
// Órdenes de producción (consumos), con el mismo código que se usa al cargar
// una compra u orden nueva — así el inventario siempre coincide con ambas.
// Las materias primas que se compran por primera vez se agregan solas.
export const inventarioMateriaPrimaDemo: InventarioMateriaPrimaRow[] = [
  {
    id: 1,
    materiaPrimaId: 11, // Tapa gris
    existenciaInicial: 100,
    costoUnitario: 120,
    movimientos: [],
  },
];
