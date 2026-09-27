export type UnidadMedida = "Litros" | "Kilogramos" | "Unidades" | "Metros";

export const UNIDADES_MEDIDA: UnidadMedida[] = ["Litros", "Kilogramos", "Unidades", "Metros"];

export type MateriaPrimaRow = {
  id: number;
  nombre: string;
  /** Necesaria para poder llevar stock/consumo (litros de alcohol vs. unidades de tapas, etc). */
  unidad: UnidadMedida;
};

export const materiaPrimaDemo: MateriaPrimaRow[] = [
  { id: 1, nombre: "Alcohol", unidad: "Litros" },
  { id: 2, nombre: "Limón", unidad: "Kilogramos" },
  { id: 3, nombre: "Azúcar", unidad: "Kilogramos" },
  { id: 4, nombre: "Menta", unidad: "Kilogramos" },
  { id: 5, nombre: "Jengibre", unidad: "Kilogramos" },
  { id: 6, nombre: "Naranja", unidad: "Kilogramos" },
  { id: 7, nombre: "Pomelo", unidad: "Kilogramos" },
  { id: 8, nombre: "Hibiscus", unidad: "Kilogramos" },
  { id: 9, nombre: "Env. 500 ml Transparente", unidad: "Unidades" },
  { id: 10, nombre: "Env. 500 ml Ambar", unidad: "Unidades" },
  { id: 11, nombre: "Tapa gris", unidad: "Unidades" },
  { id: 12, nombre: "Tapa dorada", unidad: "Unidades" },
  { id: 13, nombre: "Bidón 5 lts. Con Tapa", unidad: "Unidades" },
  { id: 14, nombre: "Precintos env. 500 ml", unidad: "Unidades" },
  { id: 15, nombre: "Precintos env. 5000 ml", unidad: "Unidades" },
  { id: 16, nombre: "Etiq. LIM x 500 cc", unidad: "Unidades" },
  { id: 17, nombre: "Etiq. LMJ x 500 cc", unidad: "Unidades" },
  { id: 18, nombre: "Etiq. LNPH x 500 cc", unidad: "Unidades" },
  { id: 19, nombre: "Etiq. LIM x 5000 cc", unidad: "Unidades" },
  { id: 20, nombre: "Bolsas", unidad: "Unidades" },
  { id: 21, nombre: "Caja x 6", unidad: "Unidades" },
  { id: 22, nombre: "Caja x 20", unidad: "Unidades" },
  { id: 23, nombre: "Env. 750 ml Transp. c/tapón", unidad: "Unidades" },
  { id: 24, nombre: "Precintos env. 750 ml", unidad: "Unidades" },
  { id: 25, nombre: "Etiq. LIM Prem. x 750 cc", unidad: "Unidades" },
  { id: 26, nombre: "Etiq. LMJ Prem. x 750 cc", unidad: "Unidades" },
  { id: 27, nombre: "Etiq. LNPH Prem. x 750 cc", unidad: "Unidades" },
];
