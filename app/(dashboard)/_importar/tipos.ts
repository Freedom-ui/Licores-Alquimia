// Tipos de la importación de la planilla Excel. Todo es serializable (JSON):
// lo que arma el navegador viaja tal cual a la server action.

/** Valor de una celda ya leído: texto, número o fecha ("YYYY-MM-DD"). Vacío = null. */
export type Valor = string | number | null;

/** Una hoja del libro como grilla (0-based). Las filas pueden tener huecos. */
export type Hoja = {
  nombre: string;
  filas: Valor[][];
  /** Celdas combinadas (0-based, inclusive). */
  combinadas: { r0: number; c0: number; r1: number; c1: number }[];
};

/** Secciones que reconoce el importador (algunas son partes de una sección de la app). */
export type SeccionId =
  | "productos"
  | "materiaPrima"
  | "proveedores"
  | "clientes"
  | "compras"
  | "comprasTrazabilidad"
  | "ordenes"
  | "ventas"
  | "inventarioMP"
  | "inventarioPT";

/** Un bloque de celdas con título: en la planilla Alquimia hay varios por hoja, lado a lado. */
export type Bloque = {
  /** Ej. "CUENTAS DE ACTIVO!FF2". */
  id: string;
  hoja: string;
  /** Textos de la fila del título, en orden (ej. ["INVENTARIO DE MATERIAS PRIMAS:", "Alcohol"]). */
  textos: string[];
  filaTitulo: number;
  col0: number;
  col1: number;
};

export type Columna = { col: number; encabezado: string; campo: string | null };

/** Qué es cada bloque y cómo se leen sus columnas. */
export type Deteccion = {
  bloque: Bloque;
  titulo: string;
  /** Sección asignada (null = no se importa). */
  seccion: SeccionId | null;
  /** La sección que mejor encaja aunque no alcance para asignarla sola. */
  sugerida: SeccionId | null;
  puntaje: number;
  /** El título del bloque nombra a la sección sugerida. */
  tituloCoincide: boolean;
  confianza: "alta" | "media" | "baja";
  filasEncabezado: number[];
  filaDatos: number;
  columnas: Columna[];
  /** Filas con datos (aprox., para mostrar). */
  cantidadFilas: number;
};

/** Ubicación en la planilla (fila como la ve el usuario, desde 1). */
export type Origen = { hoja: string; fila: number };

/**
 * Secciones de lo que se importa, ya con las partes unidas. Los vendedores no
 * tienen sección propia: se agregan los que figuran en las ventas.
 */
export type SeccionRegistro =
  | "materiaPrima"
  | "productos"
  | "proveedores"
  | "clientes"
  | "existenciaMP"
  | "existenciaPT"
  | "compras"
  | "ordenes"
  | "ventas";

export type Insumo = { origen: Origen; v: Record<string, Valor> };

/** Una fila de la planilla convertida al formato de la app (todavía sin validar). */
export type Registro = {
  seccion: SeccionRegistro;
  /** Único en toda la importación: sección, bloque y fila, ej. "compras:CUENTAS DE ACTIVO!FF2:5". */
  clave: string;
  origen: Origen;
  v: Record<string, Valor>;
  insumos?: Insumo[];
};

/** Números de la planilla para comparar con lo que queda en la app. */
export type Referencias = {
  totalCompras: number | null;
  totalVentas: number | null;
  unidadesVendidas: number | null;
  /** Último saldo de cada inventario de materia prima de la planilla. */
  saldosMP: { materia: string; saldo: number }[];
};

export type Extraccion = { registros: Registro[]; referencias: Referencias };
