// Piezas comunes de los reportes en PDF de un registro (ficha de lote, rastreo,
// retiro de lote, remito): encabezado con los datos de la empresa, títulos de
// sección, tablas y bloques "dato: valor". Mismo estilo que el PDF de las
// tablas (exportPdf.ts).

import type { jsPDF as JsPDF } from "jspdf";
import { formatCellValue } from "./format";
import { empresaActual, lineaDatosEmpresa } from "@/app/empresa";

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });
export const MARGIN = 14;

export type AutoTable = (typeof import("jspdf-autotable"))["autoTable"];

export const fecha = (v: string | null | undefined) => formatCellValue(v, "date");

export function finalY(doc: JsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/**
 * Documento nuevo con el encabezado de la empresa (nombre, título del reporte,
 * datos del establecimiento y fecha de generación). Devuelve dónde seguir escribiendo.
 */
export async function nuevoDocumento(titulo: string, subtitulo: string, orientacion: "landscape" | "portrait" = "landscape") {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: orientacion, unit: "mm" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(empresaActual().nombre, MARGIN, 16);
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

export function seccion(doc: JsPDF, texto: string, y: number): number {
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

export function tabla(autoTable: AutoTable, doc: JsPDF, startY: number, head: string[], body: string[][], centradas: number[] = []) {
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
export function datos(autoTable: AutoTable, doc: JsPDF, startY: number, filas: [string, string][]) {
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

export function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
