// PDF de Estadísticas: una o varias pantallas, cada una desde una página
// nueva, con los mismos bloques que se ven en pantalla. Los bloques se
// acomodan en filas según su ancho (span sobre 12), igual que la grilla.

import type { jsPDF as JsPDF } from "jspdf";
import { EMPRESA, lineaDatosEmpresa } from "@/app/empresa";
import { graficoComoImagen } from "./Grafico";
import type { Bloque, Seccion } from "./secciones";

const MARGEN = 12;
const GAP = 4;
const PX_POR_MM = 4;
const NARANJA: [number, number, number] = [212, 119, 42];
const TONO = { bueno: [46, 125, 66], malo: [178, 58, 58], neutro: [120, 115, 110] } as const;
const NIVEL = { critico: { texto: "Crítico", color: [178, 58, 58] }, aviso: { texto: "Aviso", color: [192, 138, 30] }, info: { texto: "Info", color: [111, 107, 102] } } as const;

type AutoTable = (typeof import("jspdf-autotable"))["autoTable"];
type Meta = { periodo: string; comparacion: string | null };

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

function finalY(doc: JsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function filas(bloques: Bloque[]): Bloque[][] {
  const out: Bloque[][] = [];
  let actual: Bloque[] = [];
  let suma = 0;
  for (const b of bloques) {
    if (suma + b.span > 12 && actual.length) {
      out.push(actual);
      actual = [];
      suma = 0;
    }
    actual.push(b);
    suma += b.span;
  }
  if (actual.length) out.push(actual);
  return out;
}

const altoGraficoMm = (altoPx: number) => Math.min(altoPx * 0.26, 95);

function altoEstimado(b: Bloque): number {
  const cabecera = b.titulo ? (b.subtitulo ? 10 : 6) : 0;
  switch (b.tipo) {
    case "kpis":
      return Math.ceil(b.items.length / 7) * 19;
    case "grafico":
      return cabecera + altoGraficoMm(b.alto);
    case "tabla":
      return cabecera + 8 + Math.max(b.filas.length, 1) * 6.5;
    case "alertas":
      return cabecera + 8 + Math.max(b.items.length, 1) * 9;
  }
}

function cabecera(doc: JsPDF, seccion: Seccion, meta: Meta): number {
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(EMPRESA.nombre, MARGEN, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Estadísticas — ${seccion.titulo}`, MARGEN, 20.5);
  doc.setFontSize(8);
  doc.setTextColor(120);
  const lineas = [
    lineaDatosEmpresa(),
    seccion.id === "stock"
      ? `Situación al ${meta.periodo.split(" – ")[1]} · Generado el ${dateTimeFormatter.format(new Date())}`
      : `Período: ${meta.periodo}${meta.comparacion ? ` · Comparado con: ${meta.comparacion}` : ""} · Generado el ${dateTimeFormatter.format(new Date())}`,
    seccion.descripcion,
  ].filter(Boolean);
  let y = 25.5;
  for (const l of lineas) {
    doc.text(l, MARGEN, y);
    y += 4;
  }
  doc.setTextColor(0);
  return y + 2;
}

function tituloBloque(doc: JsPDF, b: Bloque, x: number, y: number, ancho: number): number {
  if (!b.titulo) return y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(184, 95, 26);
  doc.text(b.titulo, x, y + 3.5, { maxWidth: ancho });
  let yy = y + 6;
  if (b.subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(b.subtitulo, x, yy + 1.5, { maxWidth: ancho });
    yy += 4;
  }
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  return yy;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Misma tira que en pantalla: una franja con divisiones finas; cada celda con su sparkline o barrita. */
function dibujarKpis(doc: JsPDF, b: Extract<Bloque, { tipo: "kpis" }>, x: number, y: number, ancho: number): number {
  const porFila = Math.min(b.items.length, 7);
  const filasTotal = Math.ceil(b.items.length / porFila);
  const h = 19;
  doc.setDrawColor(200, 195, 188);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, ancho, h * filasTotal, 1.8, 1.8, "S");

  for (let f = 0; f < filasTotal; f++) {
    const items = b.items.slice(f * porFila, (f + 1) * porFila);
    const w = ancho / items.length;
    const by = y + f * h;
    if (f > 0) doc.line(x, by, x + ancho, by);
    items.forEach((k, i) => {
      const bx = x + i * w;
      if (i > 0) {
        doc.setDrawColor(200, 195, 188);
        doc.line(bx, by, bx, by + h);
      }
      const izq = bx + 3;
      const util = w - 6;
      // Etiqueta · nota
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.3);
      doc.setTextColor(110);
      const etiqueta = k.etiqueta.toUpperCase();
      doc.text(etiqueta, izq, by + 4.6, { maxWidth: util });
      if (k.nota) {
        const ew = doc.getTextWidth(etiqueta);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(140);
        const nota = ` · ${k.nota}`;
        // Solo si entra entera en la misma línea: partida en dos se veía rota.
        if (ew + doc.getTextWidth(nota) <= util) doc.text(nota, izq + ew, by + 4.6);
      }
      // Valor + variación
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(28);
      doc.text(k.valor, izq, by + 10.6);
      if (k.delta) {
        const [r, g, bl] = TONO[k.delta.tono];
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(r, g, bl);
        doc.text(k.delta.texto, bx + w - 3, by + 10.4, { align: "right" });
      }
      // Sparkline o barrita de composición, a lo ancho de la celda
      const sy = by + 12.8;
      const sh = 4.4;
      if (k.tendencia) {
        const pts = k.tendencia.map((v, j) => ({ j, v })).filter((p): p is { j: number; v: number } => p.v !== null);
        if (pts.length >= 2) {
          const min = Math.min(...pts.map((p) => p.v));
          const max = Math.max(...pts.map((p) => p.v));
          const px = (j: number) => izq + (j / Math.max(k.tendencia!.length - 1, 1)) * util;
          const py = (v: number) => (max === min ? (max === 0 ? sy + sh : sy + sh / 2) : sy + sh - ((v - min) / (max - min)) * sh);
          doc.setDrawColor(...NARANJA);
          doc.setLineWidth(0.35);
          for (let n = 1; n < pts.length; n++) doc.line(px(pts[n - 1].j), py(pts[n - 1].v), px(pts[n].j), py(pts[n].v));
        }
      } else if (k.composicion) {
        const total = k.composicion.reduce((s, p) => s + Math.max(p.valor, 0), 0);
        let cx = izq;
        for (const p of k.composicion) {
          if (!total || p.valor <= 0) continue;
          const pw = (p.valor / total) * util;
          doc.setFillColor(...hexRgb(p.color));
          doc.rect(cx, sy + 1.4, Math.max(pw - 0.4, 0.4), 1.8, "F");
          cx += pw;
        }
      }
      doc.setLineWidth(0.25);
    });
  }
  doc.setTextColor(0);
  return y + h * filasTotal;
}

function dibujarTabla(autoTable: AutoTable, doc: JsPDF, b: Extract<Bloque, { tipo: "tabla" }>, x: number, y: number, ancho: number): number {
  const anchoPagina = doc.internal.pageSize.getWidth();
  const alineacion = b.columnas.map((c) => (c.alinear === "der" ? "right" : c.alinear === "centro" ? "center" : "left"));
  autoTable(doc, {
    startY: y,
    head: [b.columnas.map((c) => c.titulo)],
    body: b.filas.length ? b.filas : [[b.vacio, ...b.columnas.slice(1).map(() => "")]],
    margin: { left: x, right: anchoPagina - x - ancho, top: MARGEN },
    tableWidth: ancho,
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.8, lineWidth: 0.2, lineColor: [200, 195, 188], valign: "middle" },
    headStyles: { fillColor: NARANJA, textColor: 255, fontStyle: "bold", fontSize: 7.5, lineColor: [184, 95, 26] },
    alternateRowStyles: { fillColor: [245, 242, 236] },
    didParseCell: (data) => {
      data.cell.styles.halign = alineacion[data.column.index] as "left" | "right" | "center";
    },
  });
  return finalY(doc);
}

function dibujarAlertas(autoTable: AutoTable, doc: JsPDF, b: Extract<Bloque, { tipo: "alertas" }>, x: number, y: number, ancho: number): number {
  const anchoPagina = doc.internal.pageSize.getWidth();
  autoTable(doc, {
    startY: y,
    body: b.items.length
      ? b.items.map((a) => [NIVEL[a.nivel].texto, a.detalle ? `${a.texto}\n${a.detalle}` : a.texto])
      : [["", b.vacio]],
    margin: { left: x, right: anchoPagina - x - ancho, top: MARGEN },
    tableWidth: ancho,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.6, lineWidth: { bottom: 0.2 }, lineColor: [225, 220, 212], valign: "middle" },
    columnStyles: { 0: { cellWidth: 14, fontStyle: "bold" } },
    didParseCell: (data) => {
      const alerta = b.items[data.row.index];
      if (data.column.index === 0 && alerta) data.cell.styles.textColor = [...NIVEL[alerta.nivel].color];
    },
  });
  return finalY(doc);
}

export async function exportEstadisticasPdf(secciones: Seccion[], meta: Meta, archivo: string) {
  const [{ default: jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const util = anchoPagina - MARGEN * 2;

  secciones.forEach((seccion, si) => {
    if (si > 0) doc.addPage();
    let y = cabecera(doc, seccion, meta);

    for (const fila of filas(seccion.bloques)) {
      const altoFila = Math.max(...fila.map(altoEstimado));
      if (y + Math.min(altoFila, 120) > altoPagina - MARGEN) {
        doc.addPage();
        y = MARGEN + 2;
      }
      const spanTotal = fila.reduce((s, b) => s + b.span, 0);
      const anchoDisponible = util - GAP * (fila.length - 1);
      let x = MARGEN;
      let yFin = y;
      let pagina = doc.getNumberOfPages();
      for (const b of fila) {
        // Una fila que no completa las 12 columnas igual ocupa todo el ancho.
        const ancho = (anchoDisponible * b.span) / spanTotal;
        const yContenido = tituloBloque(doc, b, x, y, ancho);
        let fin: number;
        if (b.tipo === "kpis") fin = dibujarKpis(doc, b, x, yContenido, ancho);
        else if (b.tipo === "tabla") fin = dibujarTabla(autoTable, doc, b, x, yContenido + 1, ancho);
        else if (b.tipo === "alertas") fin = dibujarAlertas(autoTable, doc, b, x, yContenido + 1, ancho);
        else {
          const alto = altoGraficoMm(b.alto);
          if (b.vacio) {
            doc.setDrawColor(200, 195, 188);
            doc.setLineDashPattern([1, 1], 0);
            doc.rect(x, yContenido + 1, ancho, 20);
            doc.setLineDashPattern([], 0);
            doc.setFontSize(8);
            doc.setTextColor(130);
            doc.text(b.vacio, x + ancho / 2, yContenido + 12.5, { align: "center" });
            doc.setTextColor(0);
            fin = yContenido + 21;
          } else {
            const img = graficoComoImagen(b.option, Math.round(ancho * PX_POR_MM), Math.round(alto * PX_POR_MM));
            doc.addImage(img, "JPEG", x, yContenido + 1, ancho, alto);
            fin = yContenido + 1 + alto;
          }
        }
        // Si una tabla larga pasó de página, lo que sigue arranca debajo de ella en la página nueva.
        if (doc.getNumberOfPages() > pagina) {
          pagina = doc.getNumberOfPages();
          yFin = fin;
        } else {
          yFin = Math.max(yFin, fin);
        }
        x += ancho + GAP;
      }
      y = yFin + 7;
    }
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(`Página ${i} de ${total}`, anchoPagina - MARGEN, altoPagina - 6, { align: "right" });
  }

  doc.save(archivo);
}
