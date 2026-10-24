// PDF de los reportes de trazabilidad: la ficha de un lote de licor (hacia
// atrás + destino), el rastreo de un lote de proveedor (hacia adelante) y el
// retiro de un lote (a quién avisar y qué inmovilizar). Mismo estilo que el
// resto de los PDF de la app (exportPdf.ts).

import { numerarPaginas } from "@/app/components/data-table/pdfComun";
import { MARGIN, datos, fecha, nuevoDocumento, seccion, slug, tabla } from "@/app/components/data-table/pdfReporte";
import { formatCantidad, formatComprobante, identificadorCompra, nombreMedioPago } from "./data";
import { clientesDe, type FichaLote, type RastreoLoteProveedor, type RetiroLote } from "./rastreo";

export async function exportFichaLotePdf(ficha: FichaLote) {
  const { lote, orden, insumos, destino, clientes } = ficha;
  const { doc, autoTable, y: y0 } = await nuevoDocumento(
    `Ficha de trazabilidad — Lote ${lote.lote}`,
    `${lote.producto} — ${lote.formato}`
  );

  let y = seccion(doc, "1. Elaboración del lote", y0);
  y = datos(autoTable, doc, y, [
    ["Producto", `${lote.producto} — ${lote.formato}`],
    ["N° de lote", String(lote.lote)],
    ["Orden de producción", orden ? `N° ${orden.id}` : "Sin orden registrada (lote anterior al sistema)"],
    ["Fecha de elaboración (maceración)", orden ? fecha(orden.fechaMaceracion) : "—"],
    ["Fecha de embotellado", orden ? fecha(orden.fechaEmbotellado) : "—"],
    ["Unidades elaboradas", String(orden?.cantidadProducida ?? lote.existenciaInicial)],
    ["Responsable de la producción", orden?.responsable || "—"],
    ["Vencimiento", fecha(lote.fechaVencimiento)],
  ]);

  y = seccion(doc, "2. Materias primas utilizadas y su origen", y);
  y = insumos.length
    ? tabla(
        autoTable,
        doc,
        y,
        ["Materia prima", "Cantidad", "Proveedor", "CUIT", "Lote proveedor", "Compra", "Comprobante"],
        insumos.map((i) => [
          i.materiaPrima,
          formatCantidad(i.cantidad, i.unidad),
          i.proveedor?.razonSocial ?? "Sin compra registrada",
          i.proveedor?.cuitCuil || "—",
          i.compra?.lote || "—",
          i.compra ? `OP N° ${i.compra.id} · ${fecha(i.compra.fecha)}` : "—",
          i.compra ? formatComprobante(i.compra) || "—" : "—",
        ]),
        [1, 3, 4, 5]
      )
    : tabla(autoTable, doc, y, ["Materia prima"], [["Sin orden de producción registrada para este lote."]]);

  y = seccion(doc, "3. Destino del lote", y);
  y = tabla(
    autoTable,
    doc,
    y,
    ["Fecha", "Cliente", "Cantidad", "Operación"],
    destino.ventas.length
      ? destino.ventas.map((v) => [fecha(v.fecha), v.cliente, `${formatCantidad(v.cantidad)} u.`, `OP N° ${v.operacionId}`])
      : [["—", "Sin ventas registradas", "—", "—"]],
    [0, 2, 3]
  );
  datos(autoTable, doc, y - 4, [
    ["Clientes que lo recibieron", clientes.length ? clientes.map((c) => `${c.cliente} (${formatCantidad(c.cantidad)} u.)`).join(", ") : "—"],
    ["Otras salidas (sin cliente)", `${formatCantidad(destino.otrasSalidas)} u.`],
    ["En stock", `${formatCantidad(destino.enStock)} u.`],
  ]);

  numerarPaginas(doc, MARGIN);
  doc.save(`ficha-trazabilidad-lote-${lote.lote}.pdf`);
}

export async function exportRastreoLoteProveedorPdf(r: RastreoLoteProveedor) {
  const primera = r.compras[0];
  const unidad = r.materiaPrima?.unidad;
  const nombre = r.materiaPrima?.nombre ?? "Materia prima";
  const { doc, autoTable, y: y0 } = await nuevoDocumento(
    `Rastreo de ${identificadorCompra(primera)} — ${nombre}`,
    r.proveedor?.razonSocial ?? "Proveedor eliminado"
  );

  let y = seccion(doc, "1. Origen", y0);
  y = datos(autoTable, doc, y, [
    ["Materia prima", nombre],
    ["Proveedor", `${r.proveedor?.razonSocial ?? "—"}${r.proveedor?.cuitCuil ? ` (CUIT ${r.proveedor.cuitCuil})` : ""}`],
    ["Lote del proveedor", primera.lote || "Sin lote (se identifica por el N° de OP)"],
    ["Total comprado", formatCantidad(r.totalComprado, unidad)],
    ["Usado en producción", formatCantidad(r.totalUsado, unidad)],
  ]);
  y = tabla(
    autoTable,
    doc,
    y - 3,
    ["Compra", "Fecha", "Cantidad", "Comprobante", "Medio de pago"],
    r.compras.map((c) => [`OP N° ${c.id}`, fecha(c.fecha), formatCantidad(c.cantidad, unidad), formatComprobante(c) || "—", nombreMedioPago(c.medioPago)]),
    [0, 1, 2, 4]
  );

  y = seccion(doc, "2. Lotes elaborados con esta materia prima", y);
  y = tabla(
    autoTable,
    doc,
    y,
    ["Orden", "Producto", "F. elaboración", "F. embotellado", "Usó", "Lote", "Vendido a", "En stock"],
    r.ordenes.length
      ? r.ordenes.map((o) => [
          `N° ${o.orden.id}`,
          `${o.orden.producto} — ${o.orden.formato}`,
          fecha(o.orden.fechaMaceracion),
          fecha(o.orden.fechaEmbotellado),
          formatCantidad(o.cantidadUsada, unidad),
          o.lote ? `Lote ${o.lote.lote}` : "Sin embotellar",
          o.destino?.ventas.length
            ? clientesDe(o.destino.ventas).map((c) => `${c.cliente} (${formatCantidad(c.cantidad)} u.)`).join(", ")
            : "—",
          o.destino ? `${formatCantidad(o.destino.enStock)} u.` : "—",
        ])
      : [["—", "Todavía no se usó en ninguna orden", "—", "—", "—", "—", "—", "—"]],
    [0, 2, 3, 4, 5, 7]
  );

  y = seccion(doc, "3. Clientes que recibieron producto elaborado con este lote", y);
  tabla(
    autoTable,
    doc,
    y,
    ["Cliente", "Unidades recibidas"],
    r.clientes.length ? r.clientes.map((c) => [c.cliente, `${formatCantidad(c.cantidad)} u.`]) : [["Ninguno todavía", "—"]],
    [1]
  );

  numerarPaginas(doc, MARGIN);
  doc.save(`rastreo-${slug(primera.lote || `op-${primera.id}`)}.pdf`);
}

export async function exportRetiroPdf(r: RetiroLote) {
  const { doc, autoTable, y: y0 } = await nuevoDocumento(r.titulo, "Retiro de producto del mercado");
  const vendidas = r.entregas.reduce((s, e) => s + e.cantidad, 0);
  const lotes = r.lotes.map((l) => String(l.lote.lote));

  let y = seccion(doc, "1. Qué se retira", y0);
  y = datos(autoTable, doc, y, [
    ...r.origen,
    [lotes.length === 1 ? "Lote de licor afectado" : "Lotes de licor afectados", lotes.length ? `${lotes.length === 1 ? "Lote" : "Lotes"} ${lotes.join(", ")}` : "Ninguno embotellado"],
    ["Unidades entregadas a clientes", `${formatCantidad(vendidas)} u. a ${r.contactos.length} ${r.contactos.length === 1 ? "cliente" : "clientes"}`],
    ["Unidades en stock a inmovilizar", `${formatCantidad(r.enStock)} u.`],
  ]);

  // Pasos a seguir, con casillas para tildar a mano.
  y = seccion(doc, "2. Pasos a seguir", y);
  doc.setFontSize(9);
  doc.setDrawColor(120);
  for (const paso of [
    "Avisar a cada cliente de la lista (punto 4) y pedirle que separe las unidades.",
    "Inmovilizar el stock del depósito y rotularlo como retenido.",
    "Registrar las unidades recuperadas (salida en Productos terminados) y su destino.",
    "Avisar a la autoridad sanitaria si corresponde.",
  ]) {
    y += 5.5;
    doc.rect(MARGIN, y - 3.2, 3.5, 3.5);
    doc.text(paso, MARGIN + 6, y);
  }
  y += 10;

  y = seccion(doc, "3. Lotes afectados", y);
  y = tabla(
    autoTable,
    doc,
    y,
    ["Lote", "Producto", "Orden", "Embotellado", "Vencimiento", "Elaboradas", "Vendidas", "Otras salidas", "En stock"],
    r.lotes.length
      ? r.lotes.map(({ lote, orden, destino }) => [
          String(lote.lote),
          `${lote.producto} — ${lote.formato}`,
          orden ? `N° ${orden.id}` : "—",
          fecha(orden?.fechaEmbotellado),
          fecha(lote.fechaVencimiento),
          `${formatCantidad(orden?.cantidadProducida ?? lote.existenciaInicial)} u.`,
          `${formatCantidad(destino.ventas.reduce((s, v) => s + v.cantidad, 0))} u.`,
          `${formatCantidad(destino.otrasSalidas)} u.`,
          `${formatCantidad(destino.enStock)} u.`,
        ])
      : [["—", "Ningún lote embotellado con esta materia prima", "—", "—", "—", "—", "—", "—", "—"]],
    [0, 2, 3, 4, 5, 6, 7, 8]
  );

  y = seccion(doc, "4. Clientes a avisar", y);
  y = tabla(
    autoTable,
    doc,
    y,
    ["Cliente", "Contacto", "CUIT", "Teléfono", "Email", "Domicilio", "Unidades"],
    r.contactos.length
      ? r.contactos.map((c) => [c.cliente, c.contacto || "—", c.cuit || "—", c.telefono || "—", c.email || "—", c.domicilio || "—", `${formatCantidad(c.cantidad)} u.`])
      : [["Ningún cliente recibió producto de estos lotes", "—", "—", "—", "—", "—", "—"]],
    [2, 3, 6]
  );

  if (r.entregas.length) {
    y = seccion(doc, "5. Detalle de las entregas", y);
    tabla(
      autoTable,
      doc,
      y,
      ["Fecha", "Operación", "Cliente", "Lote", "Unidades"],
      r.entregas.map((e) => [fecha(e.fecha), `OP N° ${e.operacionId}`, e.cliente, String(e.lote), `${formatCantidad(e.cantidad)} u.`]),
      [0, 1, 3, 4]
    );
  }

  numerarPaginas(doc, MARGIN);
  doc.save(`${slug(r.archivo)}.pdf`);
}
