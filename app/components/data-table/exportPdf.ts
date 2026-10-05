import type { Column } from "./types";
import { formatCellValue } from "./format";
import JsBarcode from "jsbarcode";
import { EMPRESA, lineaDatosEmpresa } from "@/app/empresa";

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
 * Alineación por tipo de dato, igual al criterio de una tabla impresa (no al
 * de la pantalla, que es siempre a la izquierda tipo listado). Centrado y no
 * a la derecha para número/moneda: en columnas angostas (ej. "OP N°",
 * "Cant.") el ancho lo termina marcando la etiqueta del encabezado, más larga
 * que el propio valor — alinear a la derecha deja un hueco vacío a la
 * izquierda que se ve "tirado" hacia el borde. Centrado, encabezado y dato
 * quedan uno debajo del otro sin ese hueco. El texto libre sigue a la
 * izquierda (leer un párrafo centrado es incómodo).
 */
function alignForColumn<T>(col: Column<T>): "left" | "right" | "center" {
  if (col.align === "center") return "center";
  switch (col.type ?? "text") {
    case "currency":
    case "number":
    case "date":
    case "tag":
    case "barcode":
      return "center";
    default:
      return "left";
  }
}

/** Ancho fijo (mm) para la columna de código de barras: su celda queda casi
 * vacía de texto (la imagen se dibuja aparte), así que el ancho automático
 * por contenido la dejaría demasiado angosta para que entre el código. */
const BARCODE_COLUMN_WIDTH_MM = 58;

const PDF_CELL_PADDING_MM = 2;
// Margen extra sobre el ancho medido: la medición de jsPDF y el ancho real
// que ocupa el texto renderizado no coinciden pixel a pixel — sin este
// colchón, un valor que mide "justo" puede terminar pasando a 2 líneas.
const PDF_WIDTH_SAFETY_MARGIN_MM = 2;
// Columnas con un ancho medido por debajo de esto se consideran "de formato
// fijo" (CUIT, teléfono, fecha, moneda, tag) y nunca se achican para ganar
// espacio — lo que haga falta liberar se lo saca sólo a las columnas de
// texto libre (nombre, domicilio, mail), que sí toleran wrapear sin verse rotas.
const PDF_NARROW_COLUMN_THRESHOLD_MM = 28;

/**
 * Mide, con la fuente real del PDF, el ancho que necesita cada columna para
 * que su valor más largo (encabezado o dato) entre siempre en una sola
 * línea — reemplaza el ancho "auto" nativo de autotable, que bajo presión
 * (cuando la tabla no entra en el ancho de página) achica proporcionalmente
 * TODAS las columnas por igual, incluidas las angostas de formato fijo
 * (ahí es donde CUIT/Tel terminaban partidos en 2 líneas). Si sobra lugar,
 * el excedente se reparte proporcionalmente para que la tabla llene la
 * página, igual que antes.
 */
function computeColumnWidthsMm<T extends Record<string, unknown>>(
  doc: { setFont: (f: string, s: string) => void; setFontSize: (n: number) => void; getTextWidth: (t: string) => number },
  columns: Column<T>[],
  rows: T[],
  usableWidth: number,
  barcodeColIndexes: Set<number>
): number[] {
  const minWidths = columns.map((col, i) => {
    if (barcodeColIndexes.has(i)) return BARCODE_COLUMN_WIDTH_MM;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const headerW = doc.getTextWidth(col.label);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const bodyW = rows.reduce((max, row) => {
      const text = formatCellValue(row[col.key], col.type ?? "text");
      return Math.max(max, doc.getTextWidth(text));
    }, 0);

    return Math.max(headerW, bodyW) + PDF_CELL_PADDING_MM * 2 + PDF_WIDTH_SAFETY_MARGIN_MM;
  });

  const totalMin = minWidths.reduce((sum, w) => sum + w, 0);

  if (totalMin <= usableWidth) {
    const surplus = usableWidth - totalMin;
    return minWidths.map((w) => w + surplus * (w / totalMin));
  }

  // No entra todo: se achican sólo las columnas anchas (texto libre) lo
  // necesario para que la tabla quepa, sin tocar las angostas.
  const isWide = minWidths.map((w, i) => w > PDF_NARROW_COLUMN_THRESHOLD_MM && !barcodeColIndexes.has(i));
  const narrowTotal = minWidths.reduce((sum, w, i) => (isWide[i] ? sum : sum + w), 0);
  const wideTotal = totalMin - narrowTotal;
  const wideBudget = Math.max(0, usableWidth - narrowTotal);
  const shrinkRatio = wideTotal > 0 ? wideBudget / wideTotal : 1;

  return minWidths.map((w, i) => (isWide[i] ? w * shrinkRatio : w));
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
  doc.text(EMPRESA.nombre, 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(sectionTitle, 14, 23);

  doc.setFontSize(8);
  doc.setTextColor(130);
  const cantidad = `${rows.length} registro${rows.length === 1 ? "" : "s"}`;
  const datosEmpresa = lineaDatosEmpresa();
  let y = 28;
  if (datosEmpresa) {
    doc.text(datosEmpresa, 14, y);
    y += 4.5;
  }
  doc.text(`Generado el ${dateTimeFormatter.format(new Date())} · ${cantidad}`, 14, y);

  const margin = { top: y + 5, left: 14, right: 14 };
  const usableWidth = doc.internal.pageSize.getWidth() - margin.left - margin.right;

  // Índices de columnas tipo "barcode"
  const barcodeColIndexes = new Set(
    columns.map((c, i) => (c.type === "barcode" ? i : -1)).filter((i) => i !== -1)
  );

  // Cada columna se ajusta a su propio contenido más largo (igual que la
  // tabla en pantalla): así "OP N°" o "Cantidad" quedan angostas y en una
  // sola línea, y el espacio sobrante se lo queda el texto libre
  // (Descripción, Domicilio, Email) en vez de repartirse por igual. Antes
  // se reciclaba el ancho en % pensado para la tipografía de la pantalla,
  // que no tiene nada que ver con el tamaño de letra del PDF.
  const columnWidthsMm = computeColumnWidthsMm(doc, columns, rows, usableWidth, barcodeColIndexes);
  const columnStyles = Object.fromEntries(columnWidthsMm.map((w, i) => [i, { cellWidth: w }]));

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
  // quede aplastado contra una fila pensada para una línea de texto. Más
  // grande que el mínimo técnico: el resto de las columnas no ocupan tanto,
  // así que hay margen de sobra para que el código se vea más grande.
  const BARCODE_ROW_HEIGHT = 20;

  // Con columnas agrupadas el encabezado va en 2 filas, igual que en pantalla:
  // las columnas sueltas ocupan las 2 (rowSpan) y cada grupo una celda común arriba.
  type HeadCell = { content: string; colSpan?: number; rowSpan?: number };
  const hasGroups = columns.some((c) => c.group);
  const head: HeadCell[][] = [];
  if (hasGroups) {
    const top: HeadCell[] = [];
    columns.forEach((c, i) => {
      if (!c.group) top.push({ content: c.label, rowSpan: 2 });
      else if (i === 0 || columns[i - 1].group !== c.group) {
        let span = 1;
        while (columns[i + span]?.group === c.group) span++;
        top.push({ content: c.group, colSpan: span });
      }
    });
    head.push(top, columns.filter((c) => c.group).map((c) => ({ content: c.label })));
  } else {
    head.push(columns.map((c) => ({ content: c.label })));
  }

  autoTable(doc, {
    startY: margin.top,
    head,
    body: rows.map((row) =>
      columns.map((c) =>
        c.type === "barcode" ? "" : formatCellValue(row[c.key], c.type ?? "text")
      )
    ),
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "middle",
      // Líneas divisorias en toda la grilla (fila y columna) — antes no había
      // ninguna. 0.2mm (no 0.1): más fino que eso, algunos lectores de PDF
      // lo redondean a menos de 1px al abrir y la línea directamente
      // desaparece hasta hacer zoom.
      lineWidth: 0.2,
      lineColor: [190, 183, 174],
    },
    headStyles: {
      fillColor: [212, 119, 42],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
      lineColor: [184, 95, 26],
    },
    alternateRowStyles: { fillColor: [245, 242, 236] },
    columnStyles,
    margin: { top: margin.top, left: margin.left, right: margin.right },
    // `columnStyles[i].halign` no siempre pisa el halign del encabezado (queda
    // a la izquierda aunque el dato de esa columna esté centrado/a la derecha,
    // como pasaba con "OP N°"/"Cantidad") — se fuerza acá para que encabezado
    // y datos queden siempre alineados entre sí, en ambas secciones.
    didParseCell: (data) => {
      const esGrupo = data.section === "head" && hasGroups && data.row.index === 0 && (data.cell.colSpan ?? 1) > 1;
      data.cell.styles.halign = esGrupo ? "center" : alignForColumn(columns[data.column.index]);
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
      // Centrado, igual que el título de la columna.
      const x = cell.x + (cell.width - w) / 2;
      const y = cell.y + (cell.height - h) / 2;
      doc.addImage(img.uri, "PNG", x, y, w, h);
    },
  });

  doc.save(`${slugify(sectionTitle)}.pdf`);
}