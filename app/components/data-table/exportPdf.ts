import type { Column } from "./types";
import { formatCellValue } from "./format";

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Lee un ancho tipo "12%" definido en la columna. Ignora anchos en otras unidades (px, etc). */
function parseWidthPercent<T>(col: Column<T>): number | null {
  const m = /^(\d+(?:\.\d+)?)%$/.exec((col.width ?? "").trim());
  return m ? parseFloat(m[1]) : null;
}

/**
 * Reparte el ancho disponible entre las columnas, respetando los `width` en %
 * que ya definió cada sección para su tabla en pantalla (si no especificó,
 * reparte el resto por partes iguales). Así el PDF queda proporcionado igual
 * que la tabla, en vez de que cada columna se autoajuste por contenido.
 */
function computeColumnWidths<T>(columns: Column<T>[], usableWidth: number): number[] {
  const specified = columns.map((c) => parseWidthPercent(c));
  const specifiedSum = specified.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const unspecifiedCount = specified.filter((w) => w === null).length;
  const fallback = unspecifiedCount > 0 ? Math.max(0, 100 - specifiedSum) / unspecifiedCount : 0;

  const weights = specified.map((w) => w ?? fallback);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

  return weights.map((w) => (w / totalWeight) * usableWidth);
}

/**
 * Genera y descarga un PDF de la tabla actual (columnas + filas ya filtradas/ordenadas).
 * jsPDF y jspdf-autotable se cargan de forma dinámica para no pesar el bundle
 * de páginas que nunca exportan.
 */
export async function exportRowsToPdf<T extends Record<string, unknown>>(
  sectionTitle: string,
  columns: Column<T>[],
  rows: T[]
) {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const orientation = columns.length > 5 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Licores Alquimia", 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(sectionTitle, 14, 23);

  doc.setFontSize(8);
  doc.setTextColor(130);
  const cantidad = `${rows.length} registro${rows.length === 1 ? "" : "s"}`;
  doc.text(`Generado el ${dateTimeFormatter.format(new Date())} · ${cantidad}`, 14, 28);

  const margin = { top: 33, left: 14, right: 14 };
  const usableWidth = doc.internal.pageSize.getWidth() - margin.left - margin.right;
  const columnWidths = computeColumnWidths(columns, usableWidth);
  const columnStyles = Object.fromEntries(
    columnWidths.map((w, i) => [i, { cellWidth: w }])
  );

  autoTable(doc, {
    startY: margin.top,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => formatCellValue(row[c.key], c.type ?? "text"))),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [212, 119, 42], textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 242, 236] },
    columnStyles,
    margin: { top: margin.top, left: margin.left, right: margin.right },
  });

  doc.save(`${slugify(sectionTitle)}.pdf`);
}
