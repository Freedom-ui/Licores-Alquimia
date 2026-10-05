// Kardex de productos terminados: un lote = una tabla de Entradas / Salidas / Saldo,
// igual a la planilla de Excel que se usaba antes. Datos de demo en memoria; cuando
// el modelo de Lote/MovimientoStock tenga estos campos, reemplazar por /api/productos-terminados.
// La lógica de kardex (KardexMovimiento, buildKardex) vive en
// app/components/data-table/kardex.ts, compartida con Inventario de materia prima.

import type { KardexMovimiento } from "@/app/components/data-table/kardex";

export type { KardexMovimiento };

export type LoteTerminado = {
  id: number;
  lote: number;
  /** FK al catálogo de Productos, si el lote corresponde a un SKU vigente (permite matchear ventas automáticamente). */
  productoId?: number;
  producto: string;
  formato: string;
  existenciaInicial: number;
  /** Costo unitario del lote, usado para valorizar el saldo y las salidas (kardex). */
  costoUnitario: number;
  /** Vencimiento del lote, si aplica (no todos los productos lo tienen cargado todavía). */
  fechaVencimiento?: string | null;
  /** Si este lote lo generó automáticamente una Orden de producción al embotellarse. */
  origenOrdenId?: number;
  movimientos: KardexMovimiento[];
};

// Las ventas (salidas) no se cargan acá: el store las genera al iniciar a
// partir de Operaciones, igual que al registrar una venta nueva, y la
// existencia/costo de los lotes que vienen de una orden se recalculan desde
// esa orden. Así cada lote sabe exactamente a qué clientes se vendió.
export const productosTerminadosDemo: LoteTerminado[] = [
  {
    id: 1,
    lote: 8,
    productoId: 1,
    origenOrdenId: 8,
    producto: "Licor Fino de Limón",
    formato: "500 cc",
    existenciaInicial: 53,
    costoUnitario: 0,
    fechaVencimiento: null,
    movimientos: [],
  },
  {
    id: 2,
    lote: 9,
    productoId: 3,
    origenOrdenId: 9,
    producto: "Licor Fino de Limón, con N., P. e H.",
    formato: "500 cc",
    existenciaInicial: 30,
    costoUnitario: 0,
    fechaVencimiento: null,
    movimientos: [],
  },
  {
    id: 3,
    lote: 10,
    productoId: 2,
    origenOrdenId: 10,
    producto: "Licor Fino de Limón, con M. y J.",
    formato: "500 cc",
    existenciaInicial: 20,
    costoUnitario: 0,
    fechaVencimiento: null,
    movimientos: [],
  },
  {
    id: 4,
    lote: 11,
    productoId: 5,
    origenOrdenId: 11,
    producto: "Licor Fino de Limón",
    formato: "750 cc Premium",
    existenciaInicial: 24,
    costoUnitario: 0,
    fechaVencimiento: "2028-09-02",
    movimientos: [],
  },
  {
    id: 5,
    // Lote histórico, anterior a que el número de lote pasara a coincidir con
    // el N° de Orden de producción (ver store.tsx: syncLoteParaOrden usa
    // `lote: orden.id`) — por eso su número no sigue esa secuencia.
    lote: 1,
    // Sin productoId: lote de un producto que ya no está en el catálogo vigente
    // (no participa del descuento automático de stock al cargar una venta).
    producto: "Licor de Menta (descontinuado)",
    formato: "500 cc",
    existenciaInicial: 18,
    costoUnitario: 3120.4,
    fechaVencimiento: null,
    movimientos: [],
  },
];
