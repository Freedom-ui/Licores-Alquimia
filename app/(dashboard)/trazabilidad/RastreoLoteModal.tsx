"use client";

import { useState } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { formatCellValue } from "@/app/components/data-table/format";
import { formatCantidad, formatComprobante, identificadorCompra, nombreMedioPago } from "./data";
import { clientesDe, type RastreoLoteProveedor } from "./rastreo";
import { exportRastreoLoteProveedorPdf } from "./exportTrazabilidadPdf";

const fecha = (v: string | null | undefined) => formatCellValue(v, "date");

/** Hacia adelante: de un lote de proveedor a los lotes de licor y los clientes. */
export default function RastreoLoteModal({ rastreo, onClose }: { rastreo: RastreoLoteProveedor | null; onClose: () => void }) {
  const [exporting, setExporting] = useState(false);
  if (!rastreo) return null;

  const primera = rastreo.compras[0];
  const unidad = rastreo.materiaPrima?.unidad;
  const nombre = rastreo.materiaPrima?.nombre ?? "Materia prima eliminada";

  async function descargar() {
    if (!rastreo) return;
    setExporting(true);
    try {
      await exportRastreoLoteProveedorPdf(rastreo);
    } finally {
      setExporting(false);
    }
  }

  return (
    <ModalShell
      open
      eyebrow="Trazabilidad · Rastreo hacia adelante"
      title={`${identificadorCompra(primera)} — ${nombre}`}
      width={1040}
      onClose={onClose}
    >
      <div className="tz-body">
        <div className="tz-stats">
          <div className="tz-stat">
            <span className="tz-stat-label">Proveedor</span>
            <span className="tz-stat-value">{rastreo.proveedor?.razonSocial ?? "—"}</span>
          </div>
          <div className="tz-stat">
            <span className="tz-stat-label">Comprado</span>
            <span className="tz-stat-value">{formatCantidad(rastreo.totalComprado, unidad)}</span>
          </div>
          <div className="tz-stat">
            <span className="tz-stat-label">Usado en producción</span>
            <span className="tz-stat-value">{formatCantidad(rastreo.totalUsado, unidad)}</span>
          </div>
          <div className="tz-stat">
            <span className="tz-stat-label">Lotes de licor</span>
            <span className="tz-stat-value">{rastreo.ordenes.filter((o) => o.lote).length}</span>
          </div>
          <div className="tz-stat">
            <span className="tz-stat-label">Clientes alcanzados</span>
            <span className="tz-stat-value">{rastreo.clientes.length}</span>
          </div>
        </div>

        <section>
          <h3 className="tz-h">Compras de este lote</h3>
          <div className="tz-table-wrap">
            <table className="dt-table tz-table">
              <thead>
                <tr>
                  <th className="tz-c">OP N°</th>
                  <th className="tz-c">Fecha</th>
                  <th className="tz-c">Cantidad</th>
                  <th>Comprobante</th>
                  <th className="tz-c">Pago</th>
                </tr>
              </thead>
              <tbody>
                {rastreo.compras.map((c) => (
                  <tr key={c.id}>
                    <td className="tz-c">{c.id}</td>
                    <td className="tz-c">{fecha(c.fecha)}</td>
                    <td className="tz-c">{formatCantidad(c.cantidad, unidad)}</td>
                    <td>{formatComprobante(c) || "—"}</td>
                    <td className="tz-c">{nombreMedioPago(c.medioPago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="tz-h">Lotes elaborados con esta materia prima</h3>
          {rastreo.ordenes.length === 0 ? (
            <p className="tz-empty">Todavía no se usó en ninguna orden de producción.</p>
          ) : (
            <div className="tz-table-wrap">
              <table className="dt-table tz-table">
                <thead>
                  <tr>
                    <th className="tz-c">Orden</th>
                    <th>Producto</th>
                    <th className="tz-c">F. elaboración</th>
                    <th className="tz-c">Usó</th>
                    <th className="tz-c">Lote</th>
                    <th>Vendido a</th>
                    <th className="tz-c">En stock</th>
                  </tr>
                </thead>
                <tbody>
                  {rastreo.ordenes.map((o) => (
                    <tr key={o.orden.id}>
                      <td className="tz-c">N° {o.orden.id}</td>
                      <td>
                        {o.orden.producto} — {o.orden.formato}
                      </td>
                      <td className="tz-c">{fecha(o.orden.fechaMaceracion)}</td>
                      <td className="tz-c">{formatCantidad(o.cantidadUsada, unidad)}</td>
                      <td className="tz-c">{o.lote ? `Lote ${o.lote.lote}` : <span className="tz-muted">Sin embotellar</span>}</td>
                      <td className="tz-wrap">
                        {o.destino?.ventas.length
                          ? clientesDe(o.destino.ventas).map((c) => `${c.cliente} (${formatCantidad(c.cantidad)} u.)`).join(", ")
                          : <span className="tz-muted">Sin ventas</span>}
                      </td>
                      <td className="tz-c">{o.destino ? `${formatCantidad(o.destino.enStock)} u.` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3 className="tz-h">Clientes que recibieron producto de este lote</h3>
          {rastreo.clientes.length === 0 ? (
            <p className="tz-empty">Ninguno todavía.</p>
          ) : (
            <div className="tz-chips">
              {rastreo.clientes.map((c) => (
                <span key={c.cliente} className="tz-chip">
                  {c.cliente} <strong>{formatCantidad(c.cantidad)} u.</strong>
                </span>
              ))}
            </div>
          )}
        </section>

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="rf-submit-btn" onClick={descargar} disabled={exporting}>
            {exporting ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
