export type ProductoRow = {
  id: number;
  nombre: string;
  formato: string;
  /** Código real del producto para CODE39 (sin asteriscos, JsBarcode los agrega solo).*/
  codigoBarras: string;
  precioUnitario: number;
};

// Catálogo real de la planilla "BASE DE DATOS PRODUCTOS": son variantes de un
// único producto (Licor Fino de Limón), no productos distintos entre sí — por
// eso "nombre" repite la base y "formato" es lo que las distingue. Reemplazar
// por las llamadas reales a /api/productos cuando el modelo esté en Prisma.
export const productosDemo: ProductoRow[] = [
  { id: 1, nombre: "Licor Fino de Limón", formato: "500 cc", codigoBarras: "2611122201TRA", precioUnitario: 10000 },
  { id: 2, nombre: "Licor Fino de Limón, con M. y J.", formato: "500 cc", codigoBarras: "2611122201LMJ", precioUnitario: 10000 },
  { id: 3, nombre: "Licor Fino de Limón, con N., P. e H.", formato: "500 cc", codigoBarras: "2611122201NPH", precioUnitario: 10000 },
  { id: 4, nombre: "Licor Fino de Limón", formato: "5000 cc", codigoBarras: "2611122201TRA5000", precioUnitario: 35000 },
  { id: 5, nombre: "Licor Fino de Limón", formato: "750 cc Premium", codigoBarras: "2611122201TRAPREM", precioUnitario: 25000 },
  { id: 6, nombre: "Licor Fino de Limón, con M. y J.", formato: "750 cc Premium", codigoBarras: "2611122201LMJPREM", precioUnitario: 25000 },
  { id: 7, nombre: "Licor Fino de Limón, con N., P. e H.", formato: "750 cc Premium", codigoBarras: "2611122201NPHPREM", precioUnitario: 25000 },
];

/** Etiqueta legible para selects que referencian el catálogo (ej. Operaciones, Órdenes de producción). */
export function productoLabel(p: Pick<ProductoRow, "nombre" | "formato">): string {
  return `${p.nombre} — ${p.formato}`;
}

export function findProductoById(id: number | string): ProductoRow | undefined {
  const numId = Number(id);
  return productosDemo.find((p) => p.id === numId);
}
