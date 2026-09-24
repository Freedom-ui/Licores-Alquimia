export type OrdenInsumo = {
  materiaPrima: string;
  cantidad: number;
  costoUnitario: number;
};

export type OrdenProduccionRow = {
  id: number;
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
// El producto/lote resultante es lo que después alimenta a Productos terminados.
// `costoTotal` se calcula acá mismo a partir de los insumos (nunca a mano),
// para que nunca quede desincronizado con la suma real de la sub-tabla.
const ordenesSinCosto: OrdenSinCosto[] = [
  {
    id: 8,
    producto: "Licor fino de limon",
    formato: "500cc",
    fechaMaceracion: "2026-07-20",
    fechaEmbotellado: "2026-08-05",
    responsable: "ALQUIMIA",
    cantidadProducida: 53,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 25, costoUnitario: 4200 },
      { materiaPrima: "Limón", cantidad: 18, costoUnitario: 900 },
      { materiaPrima: "Azúcar", cantidad: 12, costoUnitario: 1100 },
      { materiaPrima: "Env. 500 ml Transparente", cantidad: 53, costoUnitario: 850 },
      { materiaPrima: "Tapa gris", cantidad: 53, costoUnitario: 120 },
      { materiaPrima: "Etiq. LIM x 500 cc", cantidad: 53, costoUnitario: 180 },
      { materiaPrima: "Precintos env. 500 ml", cantidad: 53, costoUnitario: 45 },
    ],
  },
  {
    id: 9,
    producto: "Licor fino de limon",
    formato: "500cc",
    fechaMaceracion: "2026-07-28",
    fechaEmbotellado: "2026-08-14",
    responsable: "ALQUIMIA",
    cantidadProducida: 30,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 14, costoUnitario: 4200 },
      { materiaPrima: "Limón", cantidad: 10, costoUnitario: 900 },
      { materiaPrima: "Naranja", cantidad: 6, costoUnitario: 700 },
      { materiaPrima: "Pomelo", cantidad: 6, costoUnitario: 750 },
      { materiaPrima: "Hibiscus", cantidad: 2, costoUnitario: 1600 },
      { materiaPrima: "Env. 500 ml Ambar", cantidad: 30, costoUnitario: 900 },
      { materiaPrima: "Tapa dorada", cantidad: 30, costoUnitario: 140 },
    ],
  },
  {
    id: 10,
    producto: "Licor de Menta",
    formato: "500cc",
    fechaMaceracion: "2026-08-02",
    fechaEmbotellado: "2026-08-18",
    responsable: "VICENTE, RODRIGO",
    cantidadProducida: 20,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 9, costoUnitario: 4200 },
      { materiaPrima: "Menta", cantidad: 4, costoUnitario: 1300 },
      { materiaPrima: "Jengibre", cantidad: 2, costoUnitario: 950 },
      { materiaPrima: "Env. 500 ml Transparente", cantidad: 20, costoUnitario: 850 },
      { materiaPrima: "Etiq. LMJ x 500 cc", cantidad: 20, costoUnitario: 180 },
    ],
  },
  {
    id: 11,
    producto: "Licor fino de limon",
    formato: "750cc Premium",
    fechaMaceracion: "2026-08-20",
    fechaEmbotellado: null,
    responsable: "ALQUIMIA",
    cantidadProducida: 24,
    insumos: [
      { materiaPrima: "Alcohol", cantidad: 15, costoUnitario: 4200 },
      { materiaPrima: "Limón", cantidad: 11, costoUnitario: 900 },
      { materiaPrima: "Env. 750 ml Transp. c/tapón", cantidad: 24, costoUnitario: 1450 },
      { materiaPrima: "Etiq. LIM Prem. x 750 cc", cantidad: 24, costoUnitario: 260 },
      { materiaPrima: "Precintos env. 750 ml", cantidad: 24, costoUnitario: 60 },
    ],
  },
];

export const ordenesProduccionDemo: OrdenProduccionRow[] = ordenesSinCosto.map((o) => ({
  ...o,
  costoTotal: calcularCostoTotal(o.insumos),
}));
