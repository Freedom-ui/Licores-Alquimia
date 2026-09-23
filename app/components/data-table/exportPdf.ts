import type { Column } from "./types";
import { formatCellValue } from "./format";
import JsBarcode from "jsbarcode";

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

type BarcodeImage = { uri: string; width: number; height: number };

// El canvas se genera varias veces más grande de lo que se va a ver en el PDF
// ("supersampling"): como se termina achicando para entrar en la celda, tener
// de entrada muchos más píxeles que los necesarios es lo que lo mantiene
// nítido al hacer zoom en el PDF, en vez de pixelarse.
const PDF_BARCODE_RESOLUTION = 2;

/**
 * Genera un PNG (data-URI) de un código CODE39 usando un canvas en memoria.
 * Guarda también el ancho/alto reales del canvas para poder escalar la imagen
 * en el PDF sin deformarla (jsPDF no respeta la proporción por su cuenta).
 */
function generateBarcode(value: string): BarcodeImage | null {
  if (!value) return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format: "CODE39",
      width: 1.5 * PDF_BARCODE_RESOLUTION,
      height: 40 * PDF_BARCODE_RESOLUTION,
      displayValue: true,
      fontSize: 12 * PDF_BARCODE_RESOLUTION,
      margin: 4 * PDF_BARCODE_RESOLUTION,
    });
    return { uri: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    // Valor inválido para CODE39 (raro, pero por las dudas no rompemos el export)
    return null;
  }
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

  // Índices de columnas tipo "barcode"
  const barcodeColIndexes = new Set(
    columns.map((c, i) => (c.type === "barcode" ? i : -1)).filter((i) => i !== -1)
  );

  // Una imagen por fila x columna barcode, generadas de antemano (sincrónico)
  const barcodeImages = new Map<string, BarcodeImage>(); // key: `${rowIndex}-${colIndex}`
  if (barcodeColIndexes.size > 0) {
    rows.forEach((row, rowIndex) => {
      columns.forEach((col, colIndex) => {
        if (col.type !== "barcode") return;
        const raw = row[col.key];
        const img = generateBarcode(raw ? String(raw) : "");
        if (img) barcodeImages.set(`${rowIndex}-${colIndex}`, img);
      });
    });
  }

  // Alto mínimo de fila (mm) para que el código de barras tenga lugar y no
  // quede aplastado contra una fila pensada para una línea de texto.
  const BARCODE_ROW_HEIGHT = 14;

  autoTable(doc, {
    startY: margin.top,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) =>
      columns.map((c) =>
        c.type === "barcode" ? "" : formatCellValue(row[c.key], c.type ?? "text")
      )
    ),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [212, 119, 42], textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 242, 236] },
    columnStyles,
    margin: { top: margin.top, left: margin.left, right: margin.right },
    didParseCell: (data) => {
      if (data.section === "body" && barcodeColIndexes.has(data.column.index)) {
        data.cell.styles.minCellHeight = BARCODE_ROW_HEIGHT;
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      if (!barcodeColIndexes.has(data.column.index)) return;
      const key = `${data.row.index}-${data.column.index}`;
      const img = barcodeImages.get(key);
      if (!img) return;

      // Achicar la imagen manteniendo su proporción real (contain), no estirarla
      // para llenar la celda — así no se deforma el código de barras.
      const { cell } = data;
      const maxW = cell.width - 2;
      const maxH = cell.height - 2;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      // Alineado a la izquierda, igual que el título de la columna (no centrado).
      const x = cell.x + 2;
      const y = cell.y + (cell.height - h) / 2;
      doc.addImage(img.uri, "PNG", x, y, w, h);
    },
  });

  doc.save(`${slugify(sectionTitle)}.pdf`);
}