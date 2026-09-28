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
  /**
   * Decimales fijos con los que se formatean las cantidades ("raw") de este
   * grupo, con separador es-AR (ej. 16,20). Si se omite, se muestran tal cual
   * (enteros, como en Productos terminados).
   */
  quantityDecimals?: number;
};

const quantityFormatters = new Map<number, Intl.NumberFormat>();
function formatQuantity(value: number, decimals: number): string {
  let fmt = quantityFormatters.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    quantityFormatters.set(decimals, fmt);
  }
  return fmt.format(value);
}

/** Una columna de dato dentro de un grupo (ej. "C" dentro de "Entradas"). */
export type KardexPdfColumn = {
  label: string;
  get: (fila: KardexFila) => number | null;
  /** "raw": cantidad tal cual (o "—" si es null). "currency": formateada como moneda. */
  format: "raw" | "currency";
};

/** Un grupo de columnas con encabezado compartido (ej. "Entradas" agrupa C/PU/PT). */
export type KardexPdfColumnGroup = {
  label: string;
  columns: KardexPdfColumn[];
};

/** Estructura de Productos terminados y, en general, cualquier kardex simple de Entradas/Salidas/Saldo. */
const DEFAULT_COLUMN_GROUPS: KardexPdfColumnGroup[] = [
  {
    label: "Entradas",
    columns: [
      { label: "C", get: (f) => f.entradaC, format: "raw" },
      { label: "PU", get: (f) => f.entradaPU, format: "currency" },
      { label: "PT", get: (f) => f.entradaPT, format: "currency" },
    ],
  },
  {
    label: "Salidas",
    columns: [
      { label: "C", get: (f) => f.salidaC, format: "raw" },
      { label: "PU", get: (f) => f.salidaPU, format: "currency" },
      { label: "PT", get: (f) => f.salidaPT, format: "currency" },
    ],
  },
  {
    label: "Saldo",
    columns: [
      { label: "C", get: (f) => f.saldoC, format: "raw" },
      { label: "PU", get: (f) => f.saldoPU, format: "currency" },
      { label: "PT", get: (f) => f.saldoPT, format: "currency" },
    ],
  },
];

/**
 * Genera y descarga un PDF con una mini-tabla de kardex por grupo (un lote,
 * una materia prima, etc.) — el mismo patrón visual que las tarjetas en
 * pantalla. Reusable: no sabe nada de "lotes" ni de qué sección es.
 *
 * `columnGroups` es opcional: por defecto arma Entradas/Salidas/Saldo (C/PU/PT
 * cada una), igual que siempre. Una sección con una estructura de columnas
 * distinta (ej. Inventario de materia prima: Ingresos s/Insumo + Compras +
 * Consumos + Saldo) pasa su propia definición en vez de bifurcar este archivo.
 */
export async function exportKardexToPdf(
  sectionTitle: string,
  grupos: KardexGroupPdf[],
  columnGroups: KardexPdfColumnGroup[] = DEFAULT_COLUMN_GROUPS,
  /** Sustantivo para el contador del encabezado ("8 lotes" vs "5 materias primas"). */
  groupNoun: { singular: string; plural: string } = { singular: "lote", plural: "lotes" }
) {
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
  const cantidad = `${grupos.length} ${grupos.length === 1 ? groupNoun.singular : groupNoun.plural}`;
  doc.text(`Generado el ${dateTimeFormatter.format(new Date())} · ${cantidad}`, margin.left, 28);
  doc.setTextColor(0);

  let cursorY = 34;
  const pageWidth = doc.internal.pageSize.getWidth();

  const head = [
    [
      { content: "Fecha", rowSpan: 2 },
      ...columnGroups.map((g) => ({ content: g.label, colSpan: g.columns.length })),
    ],
    columnGroups.flatMap((g) => g.columns.map((c) => c.label)),
  ];

  // Índice (1-based, Fecha=0) donde arranca cada grupo salvo el primero —
  // ahí va el borde izquierdo más grueso que separa visualmente los grupos.
  const groupStartIndexes = new Set<number>();
  {
    let idx = 1;
    columnGroups.forEach((g, i) => {
      if (i > 0) groupStartIndexes.add(idx);
      idx += g.columns.length;
    });
  }

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
      ...columnGroups.flatMap((g) =>
        g.columns.map((c) => {
          const value = c.get(f);
          if (c.format === "currency") return formatCellValue(value, "currency");
          if (value === null) return "—";
          return grupo.quantityDecimals === undefined ? value : formatQuantity(value, grupo.quantityDecimals);
        })
      ),
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
      // el halign del encabezado) y dibuja la línea divisoria entre grupos de
      // columnas (Entradas/Salidas/Saldo, o los que correspondan) — un borde
      // izquierdo más grueso antes de la primera columna de cada grupo, salvo el primero.
      didParseCell: (data) => {
        data.cell.styles.halign = "center";
        if (groupStartIndexes.has(data.column.index)) {
          data.cell.styles.lineWidth = { top: 0.2, right: 0.2, bottom: 0.2, left: 0.5 };
        }
      },
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  });

  doc.save(`${slugify(sectionTitle)}.pdf`);
}
