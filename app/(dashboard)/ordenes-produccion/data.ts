export type OrdenInsumo = {
  materiaPrima: string;
  cantidad: number;
  costoUnitario: number;
  /**
   * Compra del Libro de compras (Trazabilidad) de la que sale este insumo: es
   * el vínculo lote de proveedor → lote de producto. Sin valor = stock sin
   * compra registrada (ej. existencia previa al sistema). Si un insumo sale
   * de dos compras distintas, se carga en dos líneas.
   */
  compraId?: number;
};

export type OrdenProduccionRow = {
  id: number;
  /** FK al catálogo de Productos — de acá se derivan `producto`/`formato` para mostrar en la tabla. */
  productoId: number;
  producto: string;
  formato: string;
  fechaMaceracion: string;
  /** null = todavía no se embotelló. */
  fechaEmbotellado: string | null;
  responsable: string;
  cantidadProducida: number;
  insumos: OrdenInsumo[];
  /** Suma de cantidad × costoUnitario de los insumos. Se recalcula al guardar. */
  costoTotal: number;
};

export function calcularCostoTotal(insumos: OrdenInsumo[]): number {
  return insumos.reduce((sum, i) => sum + i.cantidad * i.costoUnitario, 0);
}

type OrdenSinCosto = Omit<OrdenProduccionRow, "costoTotal">;

// Demo en memoria, mismo patrón que el resto de las secciones: cuando el
// modelo de OrdenProduccion esté en Prisma, reemplazar por /api/ordenes-produccion.
// Al embotellarse (fechaEmbotellado != null) esta orden genera/actualiza
// automáticamente su lote en Productos terminados (ver store.tsx) — por eso
// cada orden referencia un `productoId` real del catálogo, no un nombre libre.
// `costoTotal` se calcula acá mismo a partir de los insumos (nunca a mano),
// para que nunca quede desincronizado con la suma real de la sub-tabla.
const ordenesSinCosto: OrdenSinCosto[] = [
  {
    id: 8,
    productoId: 1,
    producto: "Licor Fino de Limón",
    formato: "500 cc",
    fechaMaceracion: "2026-07-20",
    fechaEmbotellado: "2026-08-05",
    responsable: "ALQUIMIA",
    cantidadProducida: 53,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 25, costoUnitario: 2785.55, compraId: 1 },
      { materiaPrima: "Limón", cantidad: 18, costoUnitario: 850, compraId: 5 },
      { materiaPrima: "Azúcar", cantidad: 12, costoUnitario: 980, compraId: 2 },
      { materiaPrima: "Env. 500 ml Transparente", cantidad: 53, costoUnitario: 145, compraId: 4 },
      { materiaPrima: "Tapa gris", cantidad: 53, costoUnitario: 120 },
      { materiaPrima: "Etiq. LIM x 500 cc", cantidad: 53, costoUnitario: 180 },
      { materiaPrima: "Precintos env. 500 ml", cantidad: 53, costoUnitario: 45, compraId: 3 },
    ],
  },
  {
    id: 9,
    productoId: 3,
    producto: "Licor Fino de Limón, con N., P. e H.",
    formato: "500 cc",
    fechaMaceracion: "2026-07-28",
    fechaEmbotellado: "2026-08-14",
    responsable: "ALQUIMIA",
    cantidadProducida: 30,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 14, costoUnitario: 2785.55, compraId: 1 },
      { materiaPrima: "Limón", cantidad: 10, costoUnitario: 850, compraId: 5 },
      { materiaPrima: "Naranja", cantidad: 6, costoUnitario: 700 },
      { materiaPrima: "Pomelo", cantidad: 6, costoUnitario: 750 },
      { materiaPrima: "Hibiscus", cantidad: 2, costoUnitario: 1600, compraId: 6 },
      { materiaPrima: "Env. 500 ml Ambar", cantidad: 30, costoUnitario: 900 },
      { materiaPrima: "Tapa dorada", cantidad: 30, costoUnitario: 140 },
    ],
  },
  {
    id: 10,
    productoId: 2,
    producto: "Licor Fino de Limón, con M. y J.",
    formato: "500 cc",
    fechaMaceracion: "2026-08-02",
    fechaEmbotellado: "2026-08-18",
    responsable: "VICENTE, RODRIGO",
    cantidadProducida: 20,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 9, costoUnitario: 2785.55, compraId: 1 },
      { materiaPrima: "Menta", cantidad: 4, costoUnitario: 1300 },
      { materiaPrima: "Jengibre", cantidad: 2, costoUnitario: 950 },
      { materiaPrima: "Env. 500 ml Transparente", cantidad: 20, costoUnitario: 145, compraId: 4 },
      { materiaPrima: "Etiq. LMJ x 500 cc", cantidad: 20, costoUnitario: 180 },
    ],
  },
  {
    id: 11,
    productoId: 5,
    producto: "Licor Fino de Limón",
    formato: "750 cc Premium",
    fechaMaceracion: "2026-08-20",
    fechaEmbotellado: "2026-09-02",
    responsable: "ALQUIMIA",
    cantidadProducida: 24,
    insumos: [
      // El alcohol sale de dos compras del mismo lote de proveedor: una línea por compra.
      { materiaPrima: "Alcohol", cantidad: 10.8, costoUnitario: 2785.55, compraId: 8 },
      { materiaPrima: "Alcohol", cantidad: 4.2, costoUnitario: 2785.55, compraId: 11 },
      { materiaPrima: "Limón", cantidad: 11, costoUnitario: 850, compraId: 10 },
      { materiaPrima: "Env. 750 ml Transp. c/tapón", cantidad: 24, costoUnitario: 1450, compraId: 9 },
      { materiaPrima: "Etiq. LIM Prem. x 750 cc", cantidad: 24, costoUnitario: 260 },
      { materiaPrima: "Precintos env. 750 ml", cantidad: 24, costoUnitario: 60 },
    ],
  },
  // En maceración: todavía sin embotellar (la cantidad es la estimada).
  {
    id: 12,
    productoId: 1,
    producto: "Licor Fino de Limón",
    formato: "500 cc",
    fechaMaceracion: "2026-09-23",
    fechaEmbotellado: null,
    responsable: "ALQUIMIA",
    cantidadProducida: 55,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 25, costoUnitario: 2950, compraId: 12 },
      { materiaPrima: "Limón", cantidad: 18, costoUnitario: 900, compraId: 13 },
      { materiaPrima: "Azúcar", cantidad: 12, costoUnitario: 980, compraId: 7 },
    ],
  },
  {
    id: 13,
    productoId: 2,
    producto: "Licor Fino de Limón, con M. y J.",
    formato: "500 cc",
    fechaMaceracion: "2026-10-01",
    fechaEmbotellado: null,
    responsable: "VICENTE, RODRIGO",
    cantidadProducida: 22,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 9, costoUnitario: 2950, compraId: 12 },
      { materiaPrima: "Menta", cantidad: 4, costoUnitario: 1300 },
      { materiaPrima: "Jengibre", cantidad: 2, costoUnitario: 950 },
      { materiaPrima: "Azúcar", cantidad: 6, costoUnitario: 980, compraId: 7 },
    ],
  },
];

export const ordenesProduccionDemo: OrdenProduccionRow[] = ordenesSinCosto.map((o) => ({
  ...o,
  costoTotal: calcularCostoTotal(o.insumos),
}));
