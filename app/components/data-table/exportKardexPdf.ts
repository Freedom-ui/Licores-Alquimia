import { formatCellValue } from "./format";
import type { KardexFila } from "./kardex";

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

export type KardexGroupPdf = {
  /** Ej. "Lote 8". */
  badge: string;
  /** Ej. "Licor Fino de Limón — 500 cc". */
  title: string;
  filas: KardexFila[];
};

/**
 * Genera y descarga un PDF con una mini-tabla de kardex por grupo (un lote,
 * una materia prima, etc.) — el mismo patrón visual que las tarjetas en
 * pantalla. Reusable: no sabe nada de "lotes" ni de qué sección es.
 */
export async function exportKardexToPdf(sectionTitle: string, grupos: KardexGroupPdf[]) {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
  const margin = { left: 14, right: 14 };
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Licores Alquimia", margin.left, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(sectionTitle, margin.left, 23);

  doc.setFontSize(8);
  doc.setTextColor(130);
  const cantidad = `${grupos.length} lote${grupos.length === 1 ? "" : "s"}`;
  doc.text(`Generado el ${dateTimeFormatter.format(new Date())} · ${cantidad}`, margin.left, 28);
  doc.setTextColor(0);

  let cursorY = 34;

  const head = [
    [
      { content: "Fecha", rowSpan: 2 },
      { content: "Entradas", colSpan: 3 },
      { content: "Salidas", colSpan: 3 },
      { content: "Saldo", colSpan: 3 },
    ],
    ["C", "PU", "PT", "C", "PU", "PT", "C", "PU", "PT"],
  ];

  for (const grupo of grupos) {
    // Si no queda lugar ni para el título + una fila, arrancamos página nueva.
    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = 16;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(212, 119, 42);
    doc.text(`${grupo.badge} — ${grupo.title}`, margin.left, cursorY);
    doc.setTextColor(0);
    cursorY += 3;

    const body = grupo.filas.map((f) => [
      f.fecha ? formatCellValue(f.fecha, "date") : "Exist. inicial",
      f.entradaC ?? "—",
      formatCellValue(f.entradaPU, "currency"),
      formatCellValue(f.entradaPT, "currency"),
      f.salidaC ?? "—",
      formatCellValue(f.salidaPU, "currency"),
      formatCellValue(f.salidaPT, "currency"),
      f.saldoC,
      formatCellValue(f.saldoPU, "currency"),
      formatCellValue(f.saldoPT, "currency"),
    ]);

    autoTable(doc, {
      startY: cursorY,
      head,
      body,
      styles: { font: "helvetica", fontSize: 7, cellPadding: 1.5, halign: "right" },
      headStyles: { fillColor: [212, 119, 42], textColor: 255, fontStyle: "bold", halign: "center" },
      columnStyles: { 0: { halign: "left" } },
      margin: { left: margin.left, right: margin.right },
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  doc.save(`${slugify(sectionTitle)}.pdf`);
}
