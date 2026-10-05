// PDF de los dos reportes de trazabilidad: la ficha de un lote de licor
// (hacia atrás + destino) y el rastreo de un lote de proveedor (hacia
// adelante). Mismo estilo que el resto de los PDF de la app (exportPdf.ts).

import type { jsPDF as JsPDF } from "jspdf";
import { formatCellValue } from "@/app/components/data-table/format";
import { EMPRESA, lineaDatosEmpresa } from "@/app/empresa";
import { formatCantidad, formatComprobante, identificadorCompra, nombreMedioPago } from "./data";
import { clientesDe, type FichaLote, type RastreoLoteProveedor } from "./rastreo";

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });
const MARGIN = 14;

type AutoTable = (typeof import("jspdf-autotable"))["autoTable"];

const fecha = (v: string | null | undefined) => formatCellValue(v, "date");

function finalY(doc: JsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

async function nuevoDocumento(titulo: string, subtitulo: string) {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(EMPRESA.nombre, MARGIN, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(titulo, MARGIN, 23);
  doc.setFontSize(8);
  doc.setTextColor(130);
  let y = 28;
  const datos = lineaDatosEmpresa();
  if (datos) {
    doc.text(datos, MARGIN, y);
    y += 4.5;
  }
  doc.text(`${subtitulo} · Generado el ${dateTimeFormatter.format(new Date())}`, MARGIN, y);
  doc.setTextColor(0);
  return { doc, autoTable, y: y + 6 };
}

function seccion(doc: JsPDF, texto: string, y: number): number {
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(184, 95, 26);
  doc.text(texto, MARGIN, y);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  return y + 2.5;
}

function tabla(autoTable: AutoTable, doc: JsPDF, startY: number, head: string[], body: string[][], centradas: number[] = []) {
  autoTable(doc, {
    startY,
    head: [head],
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2, valign: "middle", lineWidth: 0.2, lineColor: [190, 183, 174] },
    headStyles: { fillColor: [212, 119, 42], textColor: 255, fontStyle: "bold", fontSize: 8, lineColor: [184, 95, 26] },
    alternateRowStyles: { fillColor: [245, 242, 236] },
    // Las columnas centradas son de dato corto (fecha, cantidad, lote): nunca en 2 líneas.
    columnStyles: Object.fromEntries(centradas.map((i) => [i, { cellWidth: "wrap" as const }])),
    didParseCell: (data) => {
      if (centradas.includes(data.column.index)) data.cell.styles.halign = "center";
    },
  });
  return finalY(doc) + 8;
}

/** Tabla de 2 columnas "dato: valor" para la cabecera de un reporte. */
function datos(autoTable: AutoTable, doc: JsPDF, startY: number, filas: [string, string][]) {
  autoTable(doc, {
    startY,
    body: filas,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 52, textColor: [85, 85, 85] } },
  });
  return finalY(doc) + 7;
}

function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function exportFichaLotePdf(ficha: FichaLote) {
  const { lote, orden, insumos, destino, clientes } = ficha;
  const { doc, autoTable, y: y0 } = await nuevoDocumento(
    `Ficha de trazabilidad — Lote ${lote.lote}`,
    `${lote.producto} — ${lote.formato}`
  );

  let y = seccion(doc, "1. Elaboración del lote", y0);
  y = datos(autoTable, doc, y, [
    ["Producto", `${lote.producto} — ${lote.formato}`],
    ["N° de lote", String(lote.lote)],
    ["Orden de producción", orden ? `N° ${orden.id}` : "Sin orden registrada (lote anterior al sistema)"],
    ["Fecha de elaboración (maceración)", orden ? fecha(orden.fechaMaceracion) : "—"],
    ["Fecha de embotellado", orden ? fecha(orden.fechaEmbotellado) : "—"],
    ["Unidades elaboradas", orden ? String(orden.cantidadProducida) : String(lote.existenciaInicial)],
    ["Responsable de la producción", orden?.responsable || "—"],
    ["Vencimiento", fecha(lote.fechaVencimiento)],
  ]);

  y = seccion(doc, "2. Materias primas utilizadas y su origen", y);
  y = insumos.length
    ? tabla(
        autoTable,
        doc,
        y,
        ["Materia prima", "Cantidad", "Proveedor", "CUIT", "Lote proveedor", "Compra", "Comprobante"],
        insumos.map((i) => [
          i.materiaPrima,
          formatCantidad(i.cantidad, i.unidad),
          i.proveedor?.razonSocial ?? "Sin compra registrada",
          i.proveedor?.cuitCuil || "—",
          i.compra?.lote || "—",
          i.compra ? `OP N° ${i.compra.id} · ${fecha(i.compra.fecha)}` : "—",
          i.compra ? formatComprobante(i.compra) || "—" : "—",
        ]),
        [1, 3, 4, 5]
      )
    : tabla(autoTable, doc, y, ["Materia prima"], [["Sin orden de producción registrada para este lote."]]);

  y = seccion(doc, "3. Destino del lote", y);
  y = tabla(
    autoTable,
    doc,
    y,
    ["Fecha", "Cliente", "Cantidad", "Operación"],
    destino.ventas.length
      ? destino.ventas.map((v) => [fecha(v.fecha), v.cliente, `${formatCantidad(v.cantidad)} u.`, `OP N° ${v.operacionId}`])
      : [["—", "Sin ventas registradas", "—", "—"]],
    [0, 2, 3]
  );
  datos(autoTable, doc, y - 4, [
    ["Clientes que lo recibieron", clientes.length ? clientes.map((c) => `${c.cliente} (${formatCantidad(c.cantidad)} u.)`).join(", ") : "—"],
    ["Otras salidas (sin cliente)", `${formatCantidad(destino.otrasSalidas)} u.`],
    ["En stock", `${formatCantidad(destino.enStock)} u.`],
  ]);

  doc.save(`ficha-trazabilidad-lote-${lote.lote}.pdf`);
}

export async function exportRastreoLoteProveedorPdf(r: RastreoLoteProveedor) {
  const primera = r.compras[0];
  const unidad = r.materiaPrima?.unidad;
  const nombre = r.materiaPrima?.nombre ?? "Materia prima";
  const { doc, autoTable, y: y0 } = await nuevoDocumento(
    `Rastreo de ${identificadorCompra(primera)} — ${nombre}`,
    r.proveedor?.razonSocial ?? "Proveedor eliminado"
  );

  let y = seccion(doc, "1. Origen", y0);
  y = datos(autoTable, doc, y, [
    ["Materia prima", nombre],
    ["Proveedor", `${r.proveedor?.razonSocial ?? "—"}${r.proveedor?.cuitCuil ? ` (CUIT ${r.proveedor.cuitCuil})` : ""}`],
    ["Lote del proveedor", primera.lote || "Sin lote (se identifica por el N° de OP)"],
    ["Total comprado", formatCantidad(r.totalComprado, unidad)],
    ["Usado en producción", formatCantidad(r.totalUsado, unidad)],
  ]);
  y = tabla(
    autoTable,
    doc,
    y - 3,
    ["Compra", "Fecha", "Cantidad", "Comprobante", "Medio de pago"],
    r.compras.map((c) => [`OP N° ${c.id}`, fecha(c.fecha), formatCantidad(c.cantidad, unidad), formatComprobante(c) || "—", nombreMedioPago(c.medioPago)]),
    [0, 1, 2, 4]
  );

  y = seccion(doc, "2. Lotes elaborados con esta materia prima", y);
  y = tabla(
    autoTable,
    doc,
    y,
    ["Orden", "Producto", "F. elaboración", "F. embotellado", "Usó", "Lote", "Vendido a", "En stock"],
    r.ordenes.length
      ? r.ordenes.map((o) => [
          `N° ${o.orden.id}`,
          `${o.orden.producto} — ${o.orden.formato}`,
          fecha(o.orden.fechaMaceracion),
          fecha(o.orden.fechaEmbotellado),
          formatCantidad(o.cantidadUsada, unidad),
          o.lote ? `Lote ${o.lote.lote}` : "Sin embotellar",
          o.destino?.ventas.length
            ? clientesDe(o.destino.ventas).map((c) => `${c.cliente} (${formatCantidad(c.cantidad)} u.)`).join(", ")
            : "—",
          o.destino ? `${formatCantidad(o.destino.enStock)} u.` : "—",
        ])
      : [["—", "Todavía no se usó en ninguna orden", "—", "—", "—", "—", "—", "—"]],
    [0, 2, 3, 4, 5, 7]
  );

  y = seccion(doc, "3. Clientes que recibieron producto elaborado con este lote", y);
  tabla(
    autoTable,
    doc,
    y,
    ["Cliente", "Unidades recibidas"],
    r.clientes.length ? r.clientes.map((c) => [c.cliente, `${formatCantidad(c.cantidad)} u.`]) : [["Ninguno todavía", "—"]],
    [1]
  );

  doc.save(`rastreo-${slug(primera.lote || `op-${primera.id}`)}.pdf`);
}
