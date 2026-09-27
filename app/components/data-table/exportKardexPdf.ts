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
  const pageWidth = doc.internal.pageSize.getWidth();

  const head = [
    [
      { content: "Fecha", rowSpan: 2 },
      { content: "Entradas", colSpan: 3 },
      { content: "Salidas", colSpan: 3 },
      { content: "Saldo", colSpan: 3 },
    ],
    ["C", "PU", "PT", "C", "PU", "PT", "C", "PU", "PT"],
  ];

  grupos.forEach((grupo, i) => {
    // Si no queda lugar ni para el título + una fila, arrancamos página nueva.
    const pageBreaking = cursorY > pageHeight - 40;
    if (pageBreaking) {
      doc.addPage();
      cursorY = 16;
    }

    // Línea divisoria horizontal entre lotes — no en el primero, ni cuando
    // el lote arranca recién en una página nueva (ahí ya queda al ras del margen).
    if (i > 0 && !pageBreaking) {
      doc.setDrawColor(190, 183, 174);
      doc.setLineWidth(0.3);
      doc.line(margin.left, cursorY, pageWidth - margin.right, cursorY);
      cursorY += 6;
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
      // "center", no "right": los encabezados (C/PU/PT) ya están centrados
      // (headStyles), así que los datos deben centrarse igual para quedar
      // alineados debajo de su columna en vez de pegados al borde derecho.
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 1.5,
        halign: "center",
        // 0.2mm, no menos: más fino y algunos lectores de PDF lo redondean a
        // menos de 1px al abrir el archivo y la línea desaparece hasta hacer zoom.
        lineWidth: 0.2,
        lineColor: [190, 183, 174],
      },
      headStyles: {
        fillColor: [212, 119, 42],
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
        lineColor: [184, 95, 26],
      },
      margin: { left: margin.left, right: margin.right },
      // Fuerza el centrado acá (no alcanza con columnStyles: no siempre pisa
      // el halign del encabezado) y dibuja la línea divisoria entre
      // Entradas/Salidas/Saldo — un borde izquierdo más grueso antes de la
      // primera columna (C) de "Salidas" (índice 4) y de "Saldo" (índice 7).
      didParseCell: (data) => {
        data.cell.styles.halign = "center";
        if (data.column.index === 4 || data.column.index === 7) {
          data.cell.styles.lineWidth = { top: 0.2, right: 0.2, bottom: 0.2, left: 0.5 };
        }
      },
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  });

  doc.save(`${slugify(sectionTitle)}.pdf`);
}
