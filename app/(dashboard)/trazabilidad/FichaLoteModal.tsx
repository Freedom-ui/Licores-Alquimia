"use client";

import { useState } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { formatCellValue } from "@/app/components/data-table/format";
import type { LoteTerminado } from "../productos-terminados/data";
import { formatCantidad, formatComprobante } from "./data";
import { fichaDeLote, type TrazaContexto } from "./rastreo";
import { exportFichaLotePdf } from "./exportTrazabilidadPdf";

const fecha = (v: string | null | undefined) => formatCellValue(v, "date");

/**
 * Hacia atrás: la ficha de un lote de licor — elaboración (lo que pide el
 * punto 6.7 del reglamento PUPAA), origen de cada materia prima y destino.
 * Se monta recién al abrirse, así arranca siempre con el lote más nuevo.
 */
export default function FichaLoteModal({ ctx, onClose }: { ctx: TrazaContexto; onClose: () => void }) {
  const lotes = [...ctx.lotes].sort((a, b) => b.lote - a.lote || b.id - a.id);
  const [loteId, setLoteId] = useState<number | null>(lotes[0]?.id ?? null);
  const [exporting, setExporting] = useState(false);

  const lote: LoteTerminado | undefined = lotes.find((l) => l.id === loteId);
  const ficha = lote ? fichaDeLote(lote, ctx) : null;
  const sinOrigen = ficha ? ficha.insumos.filter((i) => !i.compra).length : 0;

  async function descargar() {
    if (!ficha) return;
    setExporting(true);
    try {
      await exportFichaLotePdf(ficha);
    } finally {
      setExporting(false);
    }
  }

  return (
    <ModalShell open eyebrow="Trazabilidad · Ficha de lote" title="Ficha de trazabilidad de un lote" width={1040} onClose={onClose}>
      <div className="tz-body">
        <div className="rf-field">
          <label htmlFor="ficha-lote">Lote de producto terminado</label>
          <select id="ficha-lote" value={loteId ?? ""} onChange={(e) => setLoteId(Number(e.target.value))}>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                Lote {l.lote} — {l.producto} — {l.formato}
              </option>
            ))}
          </select>
        </div>

        {!ficha ? (
          <p className="tz-empty">Todavía no hay lotes de producto terminado.</p>
        ) : (
          <>
            <section>
              <h3 className="tz-h">1. Elaboración del lote</h3>
              {ficha.orden ? (
                <div className="tz-stats">
                  <div className="tz-stat">
                    <span className="tz-stat-label">Orden de producción</span>
                    <span className="tz-stat-value">N° {ficha.orden.id}</span>
                  </div>
                  <div className="tz-stat">
                    <span className="tz-stat-label">Elaboración (maceración)</span>
                    <span className="tz-stat-value">{fecha(ficha.orden.fechaMaceracion)}</span>
                  </div>
                  <div className="tz-stat">
                    <span className="tz-stat-label">Embotellado</span>
                    <span className="tz-stat-value">{fecha(ficha.orden.fechaEmbotellado)}</span>
                  </div>
                  <div className="tz-stat">
                    <span className="tz-stat-label">Unidades elaboradas</span>
                    <span className="tz-stat-value">{ficha.orden.cantidadProducida}</span>
                  </div>
                  <div className="tz-stat">
                    <span className="tz-stat-label">Responsable</span>
                    <span className="tz-stat-value">{ficha.orden.responsable || "—"}</span>
                  </div>
                  <div className="tz-stat">
                    <span className="tz-stat-label">Vencimiento</span>
                    <span className="tz-stat-value">{fecha(ficha.lote.fechaVencimiento)}</span>
                  </div>
                </div>
              ) : (
                <p className="tz-empty">
                  Lote anterior al sistema: no tiene una orden de producción registrada, así que no se
                  pueden mostrar su elaboración ni sus materias primas.
                </p>
              )}
            </section>

            {ficha.orden && (
              <section>
                <h3 className="tz-h">2. Materias primas utilizadas y su origen</h3>
                {sinOrigen > 0 && (
                  <p className="rf-hint rf-hint-warn">
                    {sinOrigen === 1 ? "1 insumo no tiene" : `${sinOrigen} insumos no tienen`} compra asociada en la orden N°{" "}
                    {ficha.orden.id}: no se pueden rastrear hasta su proveedor. Se completa editando la orden.
                  </p>
                )}
                <div className="tz-table-wrap">
                  <table className="dt-table tz-table">
                    <thead>
                      <tr>
                        <th>Materia prima</th>
                        <th className="tz-c">Cantidad</th>
                        <th>Proveedor</th>
                        <th className="tz-c">Lote proveedor</th>
                        <th className="tz-c">Compra</th>
                        <th>Comprobante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ficha.insumos.map((i, idx) => (
                        <tr key={idx}>
                          <td>{i.materiaPrima}</td>
                          <td className="tz-c">{formatCantidad(i.cantidad, i.unidad)}</td>
                          <td>{i.proveedor?.razonSocial ?? <span className="tz-warn">Sin compra registrada</span>}</td>
                          <td className="tz-c">{i.compra?.lote || "—"}</td>
                          <td className="tz-c">{i.compra ? `OP N° ${i.compra.id} · ${fecha(i.compra.fecha)}` : "—"}</td>
                          <td>{i.compra ? formatComprobante(i.compra) || "—" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h3 className="tz-h">{ficha.orden ? "3." : "2."} Destino del lote</h3>
              <div className="tz-stats">
                <div className="tz-stat">
                  <span className="tz-stat-label">Vendido</span>
                  <span className="tz-stat-value">
                    {formatCantidad(ficha.destino.ventas.reduce((s, v) => s + v.cantidad, 0))} u.
                  </span>
                </div>
                <div className="tz-stat">
                  <span className="tz-stat-label">Otras salidas</span>
                  <span className="tz-stat-value">{formatCantidad(ficha.destino.otrasSalidas)} u.</span>
                </div>
                <div className="tz-stat">
                  <span className="tz-stat-label">En stock</span>
                  <span className="tz-stat-value">{formatCantidad(ficha.destino.enStock)} u.</span>
                </div>
              </div>
              {ficha.destino.ventas.length === 0 ? (
                <p className="tz-empty">Sin ventas registradas.</p>
              ) : (
                <div className="tz-table-wrap">
                  <table className="dt-table tz-table">
                    <thead>
                      <tr>
                        <th className="tz-c">Fecha</th>
                        <th>Cliente</th>
                        <th className="tz-c">Cantidad</th>
                        <th className="tz-c">Operación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ficha.destino.ventas.map((v, idx) => (
                        <tr key={`${v.operacionId}-${idx}`}>
                          <td className="tz-c">{fecha(v.fecha)}</td>
                          <td>{v.cliente}</td>
                          <td className="tz-c">{formatCantidad(v.cantidad)} u.</td>
                          <td className="tz-c">OP N° {v.operacionId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="rf-submit-btn" onClick={descargar} disabled={!ficha || exporting}>
            {exporting ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
