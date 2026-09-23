export type ProductoRow = {
  id: number;
  nombre: string;
  formato: string;
  /** Código real del producto para CODE39 (sin asteriscos, JsBarcode los agrega solo).*/
  codigoBarras: string;
  precioUnitario: number;
};

// Datos de demo en memoria, mismo patrón que Clientes: cuando el modelo de
// Producto tenga estos campos en Prisma (formato, codigoBarras, precio),
// reemplazar por las llamadas reales a /api/productos.
export const productosDemo: ProductoRow[] = [
  { id: 1, nombre: "Licor fino de limon", formato: "750cc", codigoBarras: "TRA0750", precioUnitario: 10000 },
  { id: 2, nombre: "Licor fino de limon", formato: "750cc Premium", codigoBarras: "TRA0751", precioUnitario: 20000 },
  { id: 3, nombre: "Licor de Menta", formato: "500cc", codigoBarras: "LMJ0500", precioUnitario: 20000 },
  { id: 4, nombre: "Licor de Menta", formato: "5000cc", codigoBarras: "LMJ5000", precioUnitario: 42000 },
  { id: 5, nombre: "Licor de dulce de leche", formato: "750cc", codigoBarras: "NPH0750", precioUnitario: 20000 },
];