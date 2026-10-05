// Libro de compras — Trazabilidad. Replica la planilla "LIBRO DE COMPRAS -
// TRAZABILIDAD" del cliente (N° de OP, Lote producto, Proveedor con su
// comprobante y Medio de pago), sin la parte de Transporte. Suma Fecha,
// Materia prima y Cantidad: sin esos tres datos un lote de proveedor no se
// puede vincular con el inventario ni con las órdenes que lo usaron.
//
// Una fila = una operación = una materia prima con su lote. Si una factura
// trae varios productos se carga una operación por cada uno (mismo
// comprobante), igual que en la planilla.
//
// Cada compra genera automáticamente su ingreso en el Inventario de materia
// prima (ver store.tsx) y las Órdenes de producción indican de qué compra
// sale cada insumo (OrdenInsumo.compraId): eso es lo que permite rastrear un
// lote de punta a punta.

export type MedioPago = "MPR" | "MPA" | "CDNI" | "EFE";

// Los códigos son los de la planilla; en pantalla y PDF se muestra el nombre.
export const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: "MPR", label: "MPR" },
  { value: "MPA", label: "MPA" },
  { value: "CDNI", label: "Cuenta DNI" },
  { value: "EFE", label: "Efectivo" },
];

export function nombreMedioPago(m: MedioPago): string {
  return MEDIOS_PAGO.find((x) => x.value === m)?.label ?? m;
}

export const COMPROBANTE_FORMS = ["Factura", "Remito", "Ticket", "Recibo"];
export const COMPROBANTE_TIPOS = ["A", "B", "C", "X"];

/** Punto de venta (4 o 5 dígitos) - número (8 dígitos), ej. "0001 - 00021952". */
const COMPROBANTE_NUMERO_RE = /^(\d{4,5})\s*-\s*(\d{8})$/;

export function normalizarNumeroComprobante(raw: string): string | null {
  const m = COMPROBANTE_NUMERO_RE.exec(raw.trim());
  return m ? `${m[1]} - ${m[2]}` : null;
}

export type CompraRow = {
  /** N° de OP. */
  id: number;
  fecha: string;
  materiaPrimaId: number;
  cantidad: number;
  costoUnitario: number;
  /** Kilos de cáscara al ingresar un cítrico (columna "C (Cáscara)" del inventario). */
  cantidadCascara?: number;
  /** Lote del producto comprado, tal como viene del proveedor. Vacío si no trae. */
  lote: string;
  proveedorId: number;
  comprobanteForm: string;
  comprobanteTipo: string;
  comprobanteNumero: string;
  medioPago: MedioPago;
};

export type CompraInput = Omit<CompraRow, "id">;

export function formatComprobante(c: Pick<CompraRow, "comprobanteForm" | "comprobanteTipo" | "comprobanteNumero">): string {
  return [c.comprobanteForm, c.comprobanteTipo, c.comprobanteNumero].filter(Boolean).join(" ");
}

/** Cómo se identifica una compra en el rastreo: por su lote, o por su N° de OP si no trae lote. */
export function identificadorCompra(c: Pick<CompraRow, "id" | "lote">): string {
  return c.lote ? `Lote ${c.lote}` : `OP N° ${c.id} (sin lote)`;
}

export function unidadCorta(unidad: string): string {
  switch (unidad) {
    case "Litros":
      return "L";
    case "Kilogramos":
      return "kg";
    case "Unidades":
      return "u.";
    case "Metros":
      return "m";
    default:
      return "";
  }
}

const cantidadFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export function formatCantidad(n: number, unidad?: string): string {
  const u = unidad ? unidadCorta(unidad) : "";
  return u ? `${cantidadFormatter.format(n)} ${u}` : cantidadFormatter.format(n);
}

// Proveedores, lotes y comprobantes tomados de la planilla del cliente;
// fechas y cantidades de demo, coherentes con las Órdenes de producción
// (cada compra es anterior a las órdenes que la usan).
export const comprasDemo: CompraRow[] = [
  { id: 1, fecha: "2026-07-10", materiaPrimaId: 1, cantidad: 48, costoUnitario: 2785.55, lote: "CE2210281", proveedorId: 4, comprobanteForm: "", comprobanteTipo: "", comprobanteNumero: "", medioPago: "MPR" },
  { id: 2, fecha: "2026-07-14", materiaPrimaId: 3, cantidad: 25, costoUnitario: 980, lote: "L20/01/26M1", proveedorId: 5, comprobanteForm: "Factura", comprobanteTipo: "A", comprobanteNumero: "0013 - 00001695", medioPago: "MPR" },
  { id: 3, fecha: "2026-07-15", materiaPrimaId: 14, cantidad: 300, costoUnitario: 45, lote: "", proveedorId: 8, comprobanteForm: "Factura", comprobanteTipo: "B", comprobanteNumero: "0008 - 00033606", medioPago: "MPR" },
  { id: 4, fecha: "2026-07-16", materiaPrimaId: 9, cantidad: 300, costoUnitario: 145, lote: "", proveedorId: 6, comprobanteForm: "Factura", comprobanteTipo: "A", comprobanteNumero: "0001 - 00021952", medioPago: "MPR" },
  { id: 5, fecha: "2026-07-18", materiaPrimaId: 2, cantidad: 30, costoUnitario: 850, cantidadCascara: 7.2, lote: "", proveedorId: 3, comprobanteForm: "", comprobanteTipo: "", comprobanteNumero: "", medioPago: "EFE" },
  { id: 6, fecha: "2026-07-22", materiaPrimaId: 8, cantidad: 3, costoUnitario: 1600, lote: "", proveedorId: 7, comprobanteForm: "", comprobanteTipo: "", comprobanteNumero: "", medioPago: "MPR" },
  { id: 7, fecha: "2026-08-10", materiaPrimaId: 3, cantidad: 25, costoUnitario: 980, lote: "L20/01/26M1", proveedorId: 5, comprobanteForm: "Factura", comprobanteTipo: "A", comprobanteNumero: "0013 - 00001707", medioPago: "MPR" },
  { id: 8, fecha: "2026-08-12", materiaPrimaId: 1, cantidad: 10.8, costoUnitario: 2785.55, lote: "L19/11/25", proveedorId: 4, comprobanteForm: "", comprobanteTipo: "", comprobanteNumero: "", medioPago: "EFE" },
  { id: 9, fecha: "2026-08-14", materiaPrimaId: 23, cantidad: 60, costoUnitario: 1450, lote: "", proveedorId: 2, comprobanteForm: "Factura", comprobanteTipo: "A", comprobanteNumero: "0003 - 00001288", medioPago: "MPA" },
  { id: 10, fecha: "2026-08-15", materiaPrimaId: 2, cantidad: 20, costoUnitario: 850, cantidadCascara: 4.8, lote: "", proveedorId: 3, comprobanteForm: "", comprobanteTipo: "", comprobanteNumero: "", medioPago: "CDNI" },
  { id: 11, fecha: "2026-08-18", materiaPrimaId: 1, cantidad: 10.8, costoUnitario: 2785.55, lote: "L19/11/25", proveedorId: 4, comprobanteForm: "", comprobanteTipo: "", comprobanteNumero: "", medioPago: "MPR" },
];
