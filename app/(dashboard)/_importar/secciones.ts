// Qué secciones reconoce el importador y cómo se llaman sus columnas. Los
// sinónimos cubren los encabezados de la planilla Alquimia y los nombres más
// comunes (y los de la plantilla limpia que se puede descargar). Se comparan
// con claveEnc: sin tildes, mayúsculas ni signos ("Nº DE OP." = "n de op").
//
// Encabezados en dos filas: cada columna se compara por su texto de abajo
// ("OP.") y por el de arriba + abajo ("Nº DE OP."), así "MEDIO DE PAGO (X) /
// MPR" o "SALDO / C." se distinguen de otras columnas que dicen solo "C".

import type { SeccionId } from "./tipos";

export type TipoCampo = "texto" | "numero" | "fecha" | "cuit" | "marca";

export type CampoDef = {
  id: string;
  etiqueta: string;
  /** En orden de preferencia: si dos columnas encajan, gana la del primer sinónimo. */
  sinonimos: string[];
  tipo: TipoCampo;
  requerido?: boolean;
  /** Cuánto pesa para reconocer la sección (0 = se lee si está, pero no cuenta). */
  peso: number;
};

export type SeccionDef = {
  id: SeccionId;
  nombre: string;
  /** Palabras del título del bloque que la identifican. */
  titulos: string[];
  /** Sin el título no se asigna sola (tablas genéricas con fecha y saldo hay muchas). */
  requiereTitulo?: boolean;
  /** Puede venir en varios bloques (un inventario por materia prima o producto). */
  multiple?: boolean;
  /** Campos que hacen que una fila cuente como dato (si todos están vacíos, se saltea). */
  significativos: string[];
  campos: CampoDef[];
  /** Explicación para la pantalla. */
  descripcion: string;
};

const c = (
  id: string,
  etiqueta: string,
  sinonimos: string[],
  tipo: TipoCampo,
  peso: number,
  requerido = false
): CampoDef => ({ id, etiqueta, sinonimos, tipo, peso, requerido });

// Partes del Libro de compras que también pueden venir en la misma tabla (plantilla limpia).
const camposTrazabilidadCompra = (peso: number) => [
  c("lote", "Lote", ["lote producto", "lote", "lote del proveedor", "n lote"], "texto", peso),
  c("proveedor", "Proveedor", ["proveedor nombre razon social", "proveedor", "nombre razon social", "razon social"], "texto", peso * 2, peso > 0),
  c("comprobanteForm", "Comprobante", ["proveedor form", "form", "comprobante", "forma"], "texto", peso / 2),
  c("comprobanteTipo", "Tipo de comprobante", ["proveedor tipo", "tipo", "tipo de comprobante"], "texto", peso / 2),
  c("comprobanteNumero", "N° de comprobante", ["proveedor n", "n", "numero de comprobante", "n de comprobante", "numero"], "texto", peso),
  c("medioPago", "Medio de pago", ["medio de pago", "forma de pago"], "texto", 0),
  c("pagoMPR", "MPR", ["medio de pago x mpr", "mpr"], "marca", peso / 2),
  c("pagoMPA", "MPA", ["medio de pago x mpa", "mpa"], "marca", peso / 2),
  c("pagoCDNI", "Cuenta DNI", ["medio de pago x cdni", "cdni"], "marca", peso / 2),
  c("pagoEFE", "Efectivo", ["medio de pago x efe", "efe"], "marca", peso / 2),
];

export const SECCIONES: SeccionDef[] = [
  {
    id: "productos",
    nombre: "Productos",
    titulos: ["base de datos productos", "productos"],
    significativos: ["nombre"],
    descripcion: "Catálogo de productos con su formato, código de barras y precio.",
    campos: [
      c("nombre", "Producto", ["productos", "producto", "nombre del producto", "nombre", "descripcion"], "texto", 2, true),
      c("formato", "Formato", ["formato", "presentacion"], "texto", 0.5),
      c("codigoBarras", "Código de barras", ["codigo de barras", "cod de barras", "codigo", "ean"], "texto", 1),
      c("precioUnitario", "Precio unitario", ["precio unitario", "precio", "pu"], "numero", 1),
    ],
  },
  {
    id: "materiaPrima",
    nombre: "Materia prima",
    titulos: ["materias primas", "materia prima"],
    significativos: ["nombre"],
    descripcion: "Lista de materias primas e insumos.",
    campos: [
      c("nombre", "Materia prima", ["materias primas", "materia prima", "insumo", "insumos", "nombre"], "texto", 2, true),
      c("unidad", "Unidad", ["unidad", "unidad de medida", "um"], "texto", 0.5),
    ],
  },
  {
    id: "proveedores",
    nombre: "Proveedores",
    titulos: ["base de datos proveedores", "proveedores"],
    significativos: ["razonSocial"],
    descripcion: "Proveedores con contacto, CUIT y datos bancarios.",
    campos: [
      c("razonSocial", "Razón social", ["razon social", "proveedor", "nombre razon social", "nombre"], "texto", 2, true),
      c("contacto", "Contacto", ["contacto"], "texto", 1),
      c("producto", "Producto", ["producto", "rubro", "que le compramos", "productos"], "texto", 1),
      c("cuitCuil", "CUIT / CUIL", ["cuit cuil", "cuit", "cuil"], "cuit", 1),
      c("email", "Email", ["mail", "email", "e mail", "correo"], "texto", 0.5),
      c("telefono", "Teléfono", ["tel cel", "telefono", "celular", "tel"], "texto", 0.5),
      c("cbuAlias", "CBU o alias", ["cbu o alias", "cbu alias", "datos bancarios"], "texto", 1),
      c("cbu", "CBU", ["cbu"], "texto", 0.5),
      c("alias", "Alias", ["alias"], "texto", 0.5),
    ],
  },
  {
    id: "clientes",
    nombre: "Clientes",
    titulos: ["distribuidores y clientes", "clientes", "distribuidores"],
    significativos: ["razonSocial"],
    descripcion: "Clientes y distribuidores con sus precios.",
    campos: [
      c("razonSocial", "Razón social", ["razon social", "cliente", "nombre"], "texto", 2, true),
      c("apellidoNombre", "Apellido y nombre", ["apellido y nombre", "contacto"], "texto", 1),
      c("condicionIva", "Condición de IVA", ["cond iva", "condicion iva", "condicion de iva", "iva"], "texto", 1),
      c("cuit", "CUIT", ["cuit", "cuit cuil", "cuil"], "cuit", 1),
      c("telefono", "Teléfono", ["tel cel", "telefono", "celular", "tel"], "texto", 0.5),
      c("email", "Email", ["mail", "email", "e mail", "correo"], "texto", 0.5),
      c("domicilio", "Domicilio", ["domicilio", "direccion"], "texto", 1),
      c("precioTradicional", "Precio tradicional", ["$ trad", "precio tradicional", "trad"], "numero", 1),
      c("precioPremium", "Precio premium", ["$ prem", "precio premium", "prem"], "numero", 1),
    ],
  },
  {
    id: "compras",
    nombre: "Libro de compras",
    titulos: ["libro de compras operaciones", "libro de compras", "compras"],
    significativos: ["materiaPrima"],
    descripcion: "Compras de materia prima (fecha, cantidad y precio).",
    campos: [
      c("numero", "N° de OP", ["n de op", "op", "n op", "nro de op", "numero de op", "n de operacion"], "numero", 0.5),
      c("fecha", "Fecha", ["fecha", "fecha de compra"], "fecha", 2, true),
      c("materiaPrima", "Materia prima", ["descripcion", "materia prima", "insumo", "producto"], "texto", 2, true),
      c("cantidad", "Cantidad", ["c", "cantidad", "cant"], "numero", 2, true),
      c("costoUnitario", "Costo unitario", ["pu final", "costo unitario", "precio unitario pu", "pu", "precio unitario"], "numero", 1),
      c("total", "Total", ["pt final", "total", "precio unitario pt", "pt", "importe"], "numero", 0),
      ...camposTrazabilidadCompra(0),
    ],
  },
  {
    id: "comprasTrazabilidad",
    nombre: "Libro de compras (trazabilidad)",
    titulos: ["libro de compras trazabilidad", "trazabilidad"],
    significativos: ["lote", "proveedor", "comprobanteNumero", "pagoMPR", "pagoMPA", "pagoCDNI", "pagoEFE", "medioPago"],
    descripcion: "Lote, proveedor, comprobante y medio de pago de cada compra (se une con el libro de compras por el N° de OP).",
    campos: [
      c("numero", "N° de OP", ["n de op", "op", "n op", "nro de op", "numero de op"], "numero", 2, true),
      ...camposTrazabilidadCompra(1),
    ],
  },
  {
    id: "ordenes",
    nombre: "Órdenes de producción",
    titulos: ["orden de produccion", "ordenes de produccion"],
    significativos: ["producto"],
    descripcion: "Órdenes con sus fechas, botellas producidas e insumos.",
    campos: [
      c("numero", "O.P. N°", ["o p n", "op n", "n de orden", "orden", "o p", "op", "n"], "numero", 1, true),
      c("producto", "Producto", ["producto"], "texto", 2, true),
      c("fechaMaceracion", "Fecha de maceración", ["fecha de maceracion", "maceracion", "fecha maceracion"], "fecha", 2, true),
      c("fechaEmbotellado", "Fecha de embotellado", ["fecha de embotellado", "fecha embotellado", "embotellado fecha"], "fecha", 1),
      c("cantidadProducida", "Cantidad producida", ["embotellado cantidad", "cantidad producida", "botellas", "cantidad"], "numero", 1),
      c("responsable", "Responsable", ["responsable"], "texto", 0),
      c("insumo", "Insumo", ["insumo", "insumos descripcion", "descripcion insumo"], "texto", 0),
      c("insumoCantidad", "Cantidad del insumo", ["cantidad insumo", "insumos cantidad", "cantidad del insumo"], "numero", 0),
      c("insumoCosto", "Costo total del insumo", ["costo total insumo", "costo total del insumo", "insumos costo total", "costo del insumo"], "numero", 0),
    ],
  },
  {
    id: "ventas",
    nombre: "Ventas (Operaciones)",
    titulos: ["libro de ventas operaciones", "libro de ventas", "ventas"],
    significativos: ["producto", "cliente"],
    descripcion: "Ventas con cliente, vendedor, producto, cantidad y precio.",
    campos: [
      c("numero", "OP N°", ["op n", "n de op", "op", "n"], "numero", 0.5),
      c("fecha", "Fecha", ["fecha", "fecha de venta"], "fecha", 2, true),
      c("cliente", "Cliente", ["cliente", "razon social"], "texto", 2, true),
      c("vendedor", "Vendedor", ["vendedor"], "texto", 1),
      c("cantidad", "Cantidad", ["cantidad", "cant", "c", "unidades"], "numero", 2, true),
      c("producto", "Producto", ["descripcion", "producto"], "texto", 2, true),
      c("canal", "Canal", ["condiciones de venta canal", "canal"], "texto", 0.5),
      c("condicion", "Condición", ["condiciones de venta condicion", "condicion", "condicion de venta"], "texto", 0.5),
      c("pu", "Precio unitario", ["pu", "precio unitario", "precio"], "numero", 1),
      c("total", "Subtotal", ["sub total", "subtotal", "total"], "numero", 0),
    ],
  },
  {
    id: "inventarioMP",
    nombre: "Inventario de materia prima",
    titulos: ["inventario de materias primas", "inventario de materia prima"],
    requiereTitulo: true,
    multiple: true,
    significativos: ["fecha", "saldo"],
    descripcion: "Se toma la existencia inicial (fila EI) y el saldo final para comparar.",
    campos: [
      c("fecha", "Fecha", ["fecha"], "fecha", 1, true),
      c("cantidad", "Ingreso", ["ingresos s insumo c", "compras c", "entradas c", "ingresos c"], "numero", 1),
      c("cascara", "Cáscara", ["ingresos s insumo c cascara", "c cascara", "cascara"], "numero", 0.5),
      c("cu", "Costo unitario", ["compras cu", "ingresos s insumo cu", "cu"], "numero", 0.5),
      c("saldo", "Saldo", ["saldo c", "saldo cantidad", "saldo"], "numero", 2, true),
      c("saldoCu", "Costo del saldo", ["saldo cu", "saldo costo unitario"], "numero", 1),
    ],
  },
  {
    id: "inventarioPT",
    nombre: "Inventario de productos terminados",
    titulos: ["inventario de productos terminados", "inventario de producto terminado"],
    requiereTitulo: true,
    multiple: true,
    significativos: ["fecha", "saldo"],
    descripcion: "Se toman los lotes con existencia inicial (fila EI).",
    campos: [
      c("lote", "Lote", ["n lote", "lote", "n de lote"], "texto", 1),
      c("fecha", "Fecha", ["fecha emb vta", "fecha", "fecha emb"], "fecha", 1, true),
      c("vencimiento", "Vencimiento", ["fecha vencim", "vencimiento", "fecha de vencimiento"], "fecha", 0.5),
      c("saldo", "Saldo", ["saldo c", "saldo cantidad", "saldo"], "numero", 2, true),
      c("saldoPu", "Costo del saldo", ["saldo pu", "saldo costo unitario"], "numero", 1),
    ],
  },
];

export const seccionDef = (id: SeccionId): SeccionDef => SECCIONES.find((s) => s.id === id)!;
