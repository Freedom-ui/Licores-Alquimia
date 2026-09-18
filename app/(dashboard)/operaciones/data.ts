export type OperacionRow = {
  id: number;
  fecha: string;
  cliente: string;
  vendedor: string;
  cantidad: number;
  descripcion: string;
  canal: string;
  condicion: string;
  pu: number;
  subTotal: number;
};

export const operacionesDemo: OperacionRow[] = [
  { id: 1, fecha: "2026-08-08", cliente: "PARTICULAR", vendedor: "MONEY, LEANDRO", cantidad: 1, descripcion: "Licor Fino de Limón 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 2, fecha: "2026-08-10", cliente: "PARTICULAR", vendedor: "VIOLINO, CLAUDIO", cantidad: 2, descripcion: "Licor Fino de Limón 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 20000 },
  { id: 3, fecha: "2026-08-16", cliente: "PARTICULAR", vendedor: "VICENTE, RODRIGO", cantidad: 1, descripcion: "Licor Fino de Limón, con N., P. e H. 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 4, fecha: "2026-08-16", cliente: "PARTICULAR", vendedor: "VICENTE, RODRIGO", cantidad: 2, descripcion: "Licor Fino de Limón 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 20000 },
  { id: 5, fecha: "2026-08-22", cliente: "PARTICULAR", vendedor: "ALQUIMIA", cantidad: 3, descripcion: "Licor Fino de Limón 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 30000 },
  { id: 6, fecha: "2026-08-22", cliente: "PARTICULAR", vendedor: "ALQUIMIA", cantidad: 2, descripcion: "Licor Fino de Limón, con M. y J. 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 20000 },
  { id: 7, fecha: "2026-08-22", cliente: "PARTICULAR", vendedor: "ALQUIMIA", cantidad: 4, descripcion: "Licor Fino de Limón, con N., P. e H. 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 40000 },
  { id: 8, fecha: "2026-08-22", cliente: "PARTICULAR", vendedor: "ALQUIMIA", cantidad: 1, descripcion: "Licor Fino de Limón, con N., P. e H. 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 9, fecha: "2026-08-24", cliente: "BOUCHEE BEBIDAS SRL", vendedor: "ALQUIMIA", cantidad: 20, descripcion: "Licor Fino de Limón 500 cc", canal: "Mayor", condicion: "Crédito", pu: 5900, subTotal: 118000 },
  { id: 10, fecha: "2026-08-25", cliente: "FANROZ DOBLEA SRL", vendedor: "ALQUIMIA", cantidad: 4, descripcion: "Licor Fino de Limón 500 cc", canal: "Mayor", condicion: "Crédito", pu: 7000, subTotal: 28000 },
  { id: 11, fecha: "2026-08-25", cliente: "PARTICULAR", vendedor: "VIOLINO, CLAUDIO", cantidad: 1, descripcion: "Licor Fino de Limón 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 12, fecha: "2026-08-25", cliente: "PARTICULAR", vendedor: "VIOLINO, CLAUDIO", cantidad: 1, descripcion: "Licor Fino de Limón, con N., P. e H. 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 13, fecha: "2026-09-04", cliente: "CAVA MITRE", vendedor: "ALQUIMIA", cantidad: 2, descripcion: "Licor Fino de Limón 750 cc Prem", canal: "Mayor", condicion: "Crédito", pu: 17000, subTotal: 34000 },
  { id: 14, fecha: "2026-09-04", cliente: "CAVA MITRE", vendedor: "ALQUIMIA", cantidad: 2, descripcion: "Licor Fino de Limón, con M. y J. 750 cc Prem", canal: "Mayor", condicion: "Crédito", pu: 17000, subTotal: 34000 },
  { id: 15, fecha: "2026-09-04", cliente: "CAVA MITRE", vendedor: "ALQUIMIA", cantidad: 2, descripcion: "Licor Fino de Limón, con N., P. e H. 750 cc Prem", canal: "Mayor", condicion: "Crédito", pu: 17000, subTotal: 34000 },
  { id: 16, fecha: "2026-09-04", cliente: "PARTICULAR", vendedor: "FERRARO, DOMINGO", cantidad: 1, descripcion: "Licor Fino de Limón 500 cc", canal: "Menor", condicion: "Contado", pu: 10000, subTotal: 10000 },
  { id: 17, fecha: "2026-09-08", cliente: "PARTICULAR", vendedor: "VICENTE, RODRIGO", cantidad: 1, descripcion: "Licor Fino de Limón 750 cc Prem", canal: "Menor", condicion: "Contado", pu: 25000, subTotal: 25000 },
];