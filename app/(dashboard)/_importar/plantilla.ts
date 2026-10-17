// Plantilla limpia para descargar: una hoja por sección con los encabezados
// que el importador reconoce. Sirve si los datos no están en la planilla
// Alquimia (otra planilla, un sistema anterior): se copian ahí y se importan.

import * as XLSX from "xlsx";

export const HOJAS_PLANTILLA: { hoja: string; columnas: string[] }[] = [
  { hoja: "Productos", columnas: ["Producto", "Formato", "Código de barras", "Precio unitario"] },
  { hoja: "Materias primas", columnas: ["Materia prima", "Unidad"] },
  { hoja: "Proveedores", columnas: ["Razón social", "Contacto", "Producto", "CUIT", "Email", "Teléfono", "CBU", "Alias"] },
  {
    hoja: "Clientes",
    columnas: ["Razón social", "Apellido y nombre", "Condición de IVA", "CUIT", "Teléfono", "Email", "Domicilio", "Precio tradicional", "Precio premium"],
  },
  {
    hoja: "Compras",
    columnas: ["N° de OP", "Fecha", "Materia prima", "Cantidad", "Costo unitario", "Lote", "Proveedor", "Comprobante", "Tipo", "Número", "Medio de pago"],
  },
  {
    hoja: "Órdenes de producción",
    columnas: [
      "O.P. N°",
      "Producto",
      "Fecha de maceración",
      "Fecha de embotellado",
      "Cantidad producida",
      "Responsable",
      "Insumo",
      "Cantidad del insumo",
      "Costo total del insumo",
    ],
  },
  { hoja: "Ventas", columnas: ["OP N°", "Fecha", "Cliente", "Vendedor", "Cantidad", "Producto", "Canal", "Condición", "Precio unitario"] },
];

const INSTRUCCIONES = [
  ["Cómo completar esta plantilla"],
  [""],
  ["• Cada hoja es una sección de la app. No cambies los nombres de las columnas (sí podés dejar columnas vacías)."],
  ["• Fechas como dd/mm/aaaa. Cantidades y precios solo con números (coma o punto para los decimales)."],
  ["• Unidad de materia prima: Litros, Kilogramos, Unidades o Metros."],
  ["• Condición de IVA: R. Inscripto, Monotributo, Exento o Consumidor Final."],
  ["• Medio de pago: MPR, MPA, Cuenta DNI o Efectivo. Canal: Menor o Mayor. Condición: Contado, Crédito o Consignación."],
  ["• Órdenes de producción: una fila por insumo, repitiendo el N° de orden y sus datos en cada fila."],
  ["• Los clientes, productos, materias primas y proveedores de las compras y ventas tienen que estar escritos igual que en sus hojas."],
  ["• Las existencias iniciales (stock anterior) se cargan después en la app, en Inventario de materia prima."],
];

export function descargarPlantilla() {
  const wb = XLSX.utils.book_new();
  for (const { hoja, columnas } of HOJAS_PLANTILLA) {
    const ws = XLSX.utils.aoa_to_sheet([columnas]);
    ws["!cols"] = columnas.map((c) => ({ wch: Math.max(14, c.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, hoja);
  }
  const ayuda = XLSX.utils.aoa_to_sheet(INSTRUCCIONES);
  ayuda["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, ayuda, "Cómo completarla");
  XLSX.writeFile(wb, "Plantilla Licores Alquimia.xlsx");
}
