// Kardex de productos terminados: un lote = una tabla de Entradas / Salidas / Saldo,
// igual a la planilla de Excel que se usaba antes. Datos de demo en memoria; cuando
// el modelo de Lote/MovimientoStock tenga estos campos, reemplazar por /api/productos-terminados.

export type KardexMovimiento = {
  id: number;
  /** null = fila de "Existencia Inicial" (EI), sin fecha. */
  fecha: string | null;
  tipo: "entrada" | "salida";
  cantidad: number;
  /** Costo cargado en la entrada (0 si no se informó, como en la planilla original). */
  puEntrada?: number;
};

export type LoteTerminado = {
  id: number;
  lote: number;
  producto: string;
  formato: string;
  existenciaInicial: number;
  /** Costo unitario del lote, usado para valorizar el saldo y las salidas (kardex). */
  costoUnitario: number;
  movimientos: KardexMovimiento[];
};

export const productosTerminadosDemo: LoteTerminado[] = [
  {
    id: 1,
    lote: 8,
    producto: "Licor Fino de Limón",
    formato: "500 cc",
    existenciaInicial: 53,
    costoUnitario: 3490.82,
    movimientos: [
      { id: 1, fecha: "2026-08-08", tipo: "salida", cantidad: 1 },
      { id: 2, fecha: "2026-08-10", tipo: "salida", cantidad: 2 },
      { id: 3, fecha: "2026-08-16", tipo: "salida", cantidad: 2 },
      { id: 4, fecha: "2026-08-22", tipo: "salida", cantidad: 3 },
      { id: 5, fecha: "2026-08-24", tipo: "salida", cantidad: 20 },
      { id: 6, fecha: "2026-08-25", tipo: "salida", cantidad: 4 },
      { id: 7, fecha: "2026-08-25", tipo: "salida", cantidad: 1 },
      { id: 8, fecha: "2026-09-04", tipo: "salida", cantidad: 1 },
    ],
  },
  {
    id: 2,
    lote: 9,
    producto: "Licor Fino de Limón, con Naranja, Pomelo e Hibiscus",
    formato: "500 cc",
    existenciaInicial: 30,
    costoUnitario: 3490.82,
    movimientos: [
      { id: 1, fecha: "2026-08-16", tipo: "salida", cantidad: 1 },
      { id: 2, fecha: "2026-08-22", tipo: "salida", cantidad: 4 },
      { id: 3, fecha: "2026-08-22", tipo: "salida", cantidad: 1 },
      { id: 4, fecha: "2026-08-25", tipo: "salida", cantidad: 1 },
    ],
  },
  {
    id: 3,
    lote: 10,
    producto: "Licor Fino de Limón, con Menta y Jengibre",
    formato: "500 cc",
    existenciaInicial: 20,
    costoUnitario: 3490.82,
    movimientos: [{ id: 1, fecha: "2026-08-22", tipo: "salida", cantidad: 2 }],
  },
  {
    id: 4,
    lote: 11,
    producto: "Licor Fino de Limón Premium",
    formato: "750 cc",
    existenciaInicial: 12,
    costoUnitario: 5980.15,
    movimientos: [
      { id: 1, fecha: "2026-09-04", tipo: "salida", cantidad: 2 },
      { id: 2, fecha: "2026-09-08", tipo: "salida", cantidad: 1 },
      { id: 3, fecha: "2026-09-15", tipo: "entrada", cantidad: 24, puEntrada: 5980.15 },
    ],
  },
  {
    id: 5,
    lote: 12,
    producto: "Licor de Menta",
    formato: "500 cc",
    existenciaInicial: 18,
    costoUnitario: 3120.4,
    movimientos: [],
  },
];