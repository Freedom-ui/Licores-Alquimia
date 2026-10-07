export type OperacionRow = {
  id: number;
  fecha: string;
  /** FK a Clientes — `cliente` se deriva de acá para mostrar en la tabla. */
  clienteId: number;
  cliente: string;
  vendedor: string;
  cantidad: number;
  /** FK a Productos — `descripcion` se deriva de acá para mostrar en la tabla. */
  productoId: number;
  descripcion: string;
  canal: string;
  condicion: string;
  pu: number;
  subTotal: number;
};

// Vendedores habituales (hoy no hay un módulo de Usuarios/vendedores propio en
// la UI — Prisma ya tiene `Usuario`, pero la conexión a la base de datos se
// deja para más adelante). Lista fija para que el campo sea un select y no
// texto libre con riesgo de typos.
export const VENDEDORES = [
  "ALQUIMIA",
  "MONEY, LEANDRO",
  "VIOLINO, CLAUDIO",
  "VICENTE, RODRIGO",
  "FERRARO, DOMINGO",
];

export const operacionesDemo: OperacionRow[] = [
  { id: 1, fecha: "2026-08-08", clienteId: 1, cliente: "PARTICULAR", vendedor: "MONEY, LEANDRO", cantidad: 1, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 2, fecha: "2026-08-10", clienteId: 1, cliente: "PARTICULAR", vendedor: "VIOLINO, CLAUDIO", cantidad: 2, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 20000 },
  { id: 3, fecha: "2026-08-16", clienteId: 1, cliente: "PARTICULAR", vendedor: "VICENTE, RODRIGO", cantidad: 1, productoId: 3, descripcion: "Licor Fino de Limón, con N., P. e H. — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 4, fecha: "2026-08-16", clienteId: 1, cliente: "PARTICULAR", vendedor: "VICENTE, RODRIGO", cantidad: 2, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 20000 },
  { id: 5, fecha: "2026-08-22", clienteId: 1, cliente: "PARTICULAR", vendedor: "ALQUIMIA", cantidad: 3, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 30000 },
  { id: 6, fecha: "2026-08-22", clienteId: 1, cliente: "PARTICULAR", vendedor: "ALQUIMIA", cantidad: 2, productoId: 2, descripcion: "Licor Fino de Limón, con M. y J. — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 20000 },
  { id: 7, fecha: "2026-08-22", clienteId: 1, cliente: "PARTICULAR", vendedor: "ALQUIMIA", cantidad: 4, productoId: 3, descripcion: "Licor Fino de Limón, con N., P. e H. — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 40000 },
  { id: 8, fecha: "2026-08-22", clienteId: 1, cliente: "PARTICULAR", vendedor: "ALQUIMIA", cantidad: 1, productoId: 3, descripcion: "Licor Fino de Limón, con N., P. e H. — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 9, fecha: "2026-08-24", clienteId: 4, cliente: "BOUCHEE BEBIDAS SRL", vendedor: "ALQUIMIA", cantidad: 20, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Mayor", condicion: "Crédito", pu: 5900, subTotal: 118000 },
  { id: 10, fecha: "2026-08-25", clienteId: 23, cliente: "FANROZ DOBLEA SRL", vendedor: "ALQUIMIA", cantidad: 4, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Mayor", condicion: "Crédito", pu: 7000, subTotal: 28000 },
  { id: 11, fecha: "2026-08-25", clienteId: 1, cliente: "PARTICULAR", vendedor: "VIOLINO, CLAUDIO", cantidad: 1, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 12, fecha: "2026-08-25", clienteId: 1, cliente: "PARTICULAR", vendedor: "VIOLINO, CLAUDIO", cantidad: 1, productoId: 3, descripcion: "Licor Fino de Limón, con N., P. e H. — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 13, fecha: "2026-09-04", clienteId: 20, cliente: "CAVA MITRE", vendedor: "ALQUIMIA", cantidad: 2, productoId: 5, descripcion: "Licor Fino de Limón — 750 cc Premium", canal: "Mayor", condicion: "Crédito", pu: 17000, subTotal: 34000 },
  { id: 14, fecha: "2026-09-04", clienteId: 20, cliente: "CAVA MITRE", vendedor: "ALQUIMIA", cantidad: 2, productoId: 6, descripcion: "Licor Fino de Limón, con M. y J. — 750 cc Premium", canal: "Mayor", condicion: "Crédito", pu: 17000, subTotal: 34000 },
  { id: 15, fecha: "2026-09-04", clienteId: 20, cliente: "CAVA MITRE", vendedor: "ALQUIMIA", cantidad: 2, productoId: 7, descripcion: "Licor Fino de Limón, con N., P. e H. — 750 cc Premium", canal: "Mayor", condicion: "Crédito", pu: 17000, subTotal: 34000 },
  { id: 16, fecha: "2026-09-04", clienteId: 1, cliente: "PARTICULAR", vendedor: "FERRARO, DOMINGO", cantidad: 1, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 17, fecha: "2026-09-08", clienteId: 1, cliente: "PARTICULAR", vendedor: "VICENTE, RODRIGO", cantidad: 1, productoId: 5, descripcion: "Licor Fino de Limón — 750 cc Premium", canal: "Menor", condicion: "Contado", pu: 25000, subTotal: 25000 },
  { id: 18, fecha: "2026-09-15", clienteId: 2, cliente: "COOP. NUEVO AMANECER", vendedor: "ALQUIMIA", cantidad: 6, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Mayor", condicion: "Crédito", pu: 4900, subTotal: 29400 },
  { id: 19, fecha: "2026-09-19", clienteId: 1, cliente: "PARTICULAR", vendedor: "VIOLINO, CLAUDIO", cantidad: 2, productoId: 3, descripcion: "Licor Fino de Limón, con N., P. e H. — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 20000 },
  { id: 20, fecha: "2026-09-24", clienteId: 20, cliente: "CAVA MITRE", vendedor: "ALQUIMIA", cantidad: 3, productoId: 5, descripcion: "Licor Fino de Limón — 750 cc Premium", canal: "Mayor", condicion: "Crédito", pu: 17000, subTotal: 51000 },
  { id: 21, fecha: "2026-09-27", clienteId: 1, cliente: "PARTICULAR", vendedor: "MONEY, LEANDRO", cantidad: 1, productoId: 2, descripcion: "Licor Fino de Limón, con M. y J. — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 22, fecha: "2026-10-01", clienteId: 23, cliente: "FANROZ DOBLEA SRL", vendedor: "ALQUIMIA", cantidad: 6, productoId: 3, descripcion: "Licor Fino de Limón, con N., P. e H. — 500 cc", canal: "Mayor", condicion: "Crédito", pu: 6600, subTotal: 39600 },
  { id: 23, fecha: "2026-10-02", clienteId: 1, cliente: "PARTICULAR", vendedor: "FERRARO, DOMINGO", cantidad: 2, productoId: 1, descripcion: "Licor Fino de Limón — 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 20000 },
  { id: 24, fecha: "2026-10-03", clienteId: 3, cliente: "UTT", vendedor: "ALQUIMIA", cantidad: 4, productoId: 2, descripcion: "Licor Fino de Limón, con M. y J. — 500 cc", canal: "Mayor", condicion: "Crédito", pu: 5000, subTotal: 20000 },
  { id: 25, fecha: "2026-10-05", clienteId: 1, cliente: "PARTICULAR", vendedor: "VICENTE, RODRIGO", cantidad: 1, productoId: 5, descripcion: "Licor Fino de Limón — 750 cc Premium", canal: "Menor", condicion: "Contado", pu: 25000, subTotal: 25000 },
];
