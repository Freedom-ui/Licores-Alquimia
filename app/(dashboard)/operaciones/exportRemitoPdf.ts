// PDF del remito de entrega (ver remito.ts): datos del cliente, productos con
// su lote y vencimiento, total y lugar para la firma de quien recibe.

import { formatCellValue } from "@/app/components/data-table/format";
import { numerarPaginas } from "@/app/components/data-table/pdfComun";
import { MARGIN, datos, fecha, finalY, nuevoDocumento, seccion, slug, tabla } from "@/app/components/data-table/pdfReporte";
import { fmtNumero } from "@/app/components/data-table/validacion";
import type { ClienteRow } from "../clientes/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { OperacionRow } from "./data";
import { lotesDeVenta } from "./remito";

const moneda = (n: number) => formatCellValue(n, "currency");
const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export async function exportRemitoPdf(ventas: OperacionRow[], cliente: ClienteRow | undefined, lotes: LoteTerminado[]) {
  const ordenadas = [...ventas].sort((a, b) => a.id - b.id);
  const primera = ordenadas[0];
  const nombre = cliente?.razonSocial ?? primera.cliente;
  const ops = ordenadas.map((v) => v.id);
  const { doc, autoTable, y: y0 } = await nuevoDocumento("Remito de entrega", `${nombre} · ${fecha(primera.fecha)}`, "portrait");

  let y = seccion(doc, "Cliente", y0);
  y = datos(autoTable, doc, y, [
    ["Razón social", nombre],
    ...(cliente?.apellidoNombre ? ([["Contacto", cliente.apellidoNombre]] as [string, string][]) : []),
    ["CUIT", cliente?.cuit || "—"],
    ["Condición frente al IVA", cliente?.condicionIva || "—"],
    ["Domicilio", cliente?.domicilio || "—"],
    ["Teléfono", cliente?.telefono || "—"],
  ]);

  y = seccion(doc, "Entrega", y - 2);
  y = datos(autoTable, doc, y, [
    ["Fecha", fecha(primera.fecha)],
    [ops.length === 1 ? "Operación" : "Operaciones", ops.map((id) => `OP N° ${id}`).join(", ")],
    ["Vendedor", unicos(ordenadas.map((v) => v.vendedor)).join(", ") || "—"],
    ["Condición de venta", unicos(ordenadas.map((v) => v.condicion)).join(", ") || "—"],
  ]);

  y = seccion(doc, "Detalle", y - 2);
  y = tabla(
    autoTable,
    doc,
    y,
    ["Cant.", "Producto", "Lote", "Vencimiento", "P. U.", "Subtotal"],
    ordenadas.map((v) => {
      const deLote = lotesDeVenta(v, lotes);
      const conCantidad = deLote.length > 1;
      return [
        fmtNumero(v.cantidad),
        v.descripcion,
        deLote.length ? deLote.map(({ lote, cantidad }) => (conCantidad ? `${lote.lote} (${fmtNumero(cantidad)} u.)` : String(lote.lote))).join(", ") : "Sin lote",
        unicos(deLote.map(({ lote }) => (lote.fechaVencimiento ? fecha(lote.fechaVencimiento) : ""))).join(", ") || "—",
        moneda(v.pu),
        moneda(v.subTotal),
      ];
    }),
    [0, 2, 3, 4, 5]
  );

  // Total, alineado con la columna de subtotales.
  const ancho = doc.internal.pageSize.getWidth();
  const total = ordenadas.reduce((s, v) => s + v.subTotal, 0);
  const botellas = ordenadas.reduce((s, v) => s + v.cantidad, 0);
  y = finalY(doc) + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${fmtNumero(botellas)} ${botellas === 1 ? "unidad" : "unidades"}`, MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Total: ${moneda(total)}`, ancho - MARGIN, y, { align: "right" });
  doc.setFont("helvetica", "normal");

  // Firma de quien recibe (si no entra en la página, va en una nueva).
  y += 14;
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 24;
  }
  doc.setFontSize(9);
  doc.text("Recibí conforme la mercadería detallada:", MARGIN, y);
  y += 16;
  const campos = ["Firma", "Aclaración", "DNI", "Fecha"];
  const anchoCampo = (ancho - MARGIN * 2 - 8 * (campos.length - 1)) / campos.length;
  doc.setDrawColor(120);
  campos.forEach((c, i) => {
    const x = MARGIN + i * (anchoCampo + 8);
    doc.line(x, y, x + anchoCampo, y);
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(c, x, y + 4);
  });
  doc.setTextColor(0);

  doc.setFontSize(7.5);
  doc.setTextColor(130);
  doc.text("Documento no válido como factura.", MARGIN, doc.internal.pageSize.getHeight() - 6);
  doc.setTextColor(0);

  numerarPaginas(doc, MARGIN);
  doc.save(`remito-op-${ops.join("-")}-${slug(nombre)}.pdf`);
}
