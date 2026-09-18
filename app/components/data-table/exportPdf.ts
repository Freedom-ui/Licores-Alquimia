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

  autoTable(doc, {
    startY: 33,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => formatCellValue(row[c.key], c.type ?? "text"))),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [212, 119, 42], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 242, 236] },
    margin: { top: 33, left: 14, right: 14 },
  });

  doc.save(`${slugify(sectionTitle)}.pdf`);
}
