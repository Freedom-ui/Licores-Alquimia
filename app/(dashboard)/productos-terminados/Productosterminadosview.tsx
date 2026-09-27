"use client";

import { useMemo, useState } from "react";
import { formatCellValue } from "@/app/components/data-table/format";
import { buildKardex } from "@/app/components/data-table/kardex";
import { exportKardexToPdf } from "@/app/components/data-table/exportKardexPdf";
import ConfirmDeleteDialog from "@/app/components/data-table/ConfirmDeleteDialog";
import AgregarMovimientoModal from "./AgregarMovimientoModal";
import EditLoteModal from "./EditLoteModal";
import type { LoteTerminado } from "./data";
import { useStore } from "../store";

export default function ProductosTerminadosView() {
  const { productosTerminados, addMovimiento, updateLote, deleteLote } = useStore();
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"" | "activo" | "agotado">("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [movimientoTarget, setMovimientoTarget] = useState<LoteTerminado | null>(null);
  const [editTarget, setEditTarget] = useState<LoteTerminado | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoteTerminado | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Cada lote es "algo diferente": no es una fila más, es su propia tabla de
  // kardex. Se precalcula acá para no rearmarla en cada render de la tarjeta.
  const lotes = useMemo(
    () =>
      productosTerminados.map((lote) => {
        const filas = buildKardex(lote.existenciaInicial, lote.costoUnitario, lote.movimientos);
        const ultima = filas[filas.length - 1];
        const totalEntradas = lote.movimientos
          .filter((m) => m.tipo === "entrada")
          .reduce((sum, m) => sum + m.cantidad, 0);
        const totalSalidas = lote.movimientos
          .filter((m) => m.tipo === "salida")
          .reduce((sum, m) => sum + m.cantidad, 0);
        return { lote, filas, saldoActual: ultima.saldoC, valorActual: ultima.saldoPT, totalEntradas, totalSalidas };
      }),
    [productosTerminados]
  );

  const filtrados = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lotes.filter(({ lote, saldoActual }) => {
      if (estado === "activo" && saldoActual <= 0) return false;
      if (estado === "agotado" && saldoActual > 0) return false;
      if (!needle) return true;
      return (
        lote.producto.toLowerCase().includes(needle) ||
        lote.formato.toLowerCase().includes(needle) ||
        String(lote.lote).includes(needle)
      );
    });
  }, [lotes, search, estado]);

  const hayFiltros = search.trim() !== "" || estado !== "";
  const todoExpandido = filtrados.length > 0 && filtrados.every(({ lote }) => expanded[lote.id]);

  function toggleLote(id: number) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleTodos() {
    const next = !todoExpandido;
    setExpanded((prev) => {
      const copia = { ...prev };
      for (const { lote } of filtrados) copia[lote.id] = next;
      return copia;
    });
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportKardexToPdf(
        "Productos terminados",
        filtrados.map(({ lote, filas }) => ({
          badge: `Lote ${lote.lote}`,
          title: `${lote.producto} — ${lote.formato}`,
          filas,
        }))
      );
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      deleteLote(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="pt-wrapper">
      <div className="dt-toolbar">
        <input
          type="text"
          className="dt-search"
          placeholder="Buscar por producto, formato o N° de lote…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="dt-filter-select"
          value={estado}
          onChange={(e) => setEstado(e.target.value as "" | "activo" | "agotado")}
        >
          <option value="">Estado (todos)</option>
          <option value="activo">Con stock</option>
          <option value="agotado">Agotado</option>
        </select>

        {hayFiltros && (
          <button
            type="button"
            className="dt-clear-btn"
            onClick={() => {
              setSearch("");
              setEstado("");
            }}
          >
            Limpiar filtros
          </button>
        )}

        <div className="dt-actions">
          <button type="button" className="dt-clear-btn" onClick={toggleTodos} disabled={filtrados.length === 0}>
            {todoExpandido ? "Colapsar todo" : "Expandir todo"}
          </button>
          <button
            type="button"
            className="dt-pdf-btn"
            onClick={handleExportPdf}
            disabled={exporting || filtrados.length === 0}
          >
            {exporting ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="dt-empty">No hay lotes que coincidan con la búsqueda.</div>
      ) : (
        <div className="pt-list">
          {filtrados.map(({ lote, filas, saldoActual, valorActual, totalEntradas, totalSalidas }) => {
            const abierto = Boolean(expanded[lote.id]);
            return (
              <div className="pt-card" key={lote.id}>
                <div className="pt-card-header">
                  <button type="button" className="pt-card-toggle" onClick={() => toggleLote(lote.id)}>
                    <span className={`pt-chevron ${abierto ? "open" : ""}`}>▸</span>
                    <span className="pt-badge">Lote {lote.lote}</span>
                    <span className="pt-card-title">
                      {lote.producto} <span className="pt-card-formato">— {lote.formato}</span>
                    </span>
                    <span className="pt-card-stats">
                      <span title="Total entradas">E: {totalEntradas}</span>
                      <span title="Total salidas">S: {totalSalidas}</span>
                      <span title="Saldo actual" className={saldoActual > 0 ? "pt-stat-ok" : "pt-stat-off"}>
                        Saldo: {saldoActual}
                      </span>
                      <span title="Valor del saldo" className="pt-stat-value">
                        {formatCellValue(valorActual, "currency")}
                      </span>
                      <span title="Vencimiento" className="pt-stat-vencimiento">
                        {lote.fechaVencimiento
                          ? `Vence: ${formatCellValue(lote.fechaVencimiento, "date")}`
                          : "Sin vencimiento"}
                      </span>
                    </span>
                  </button>
                  <div className="pt-card-actions">
                    <button
                      type="button"
                      className="pt-card-add-btn"
                      onClick={() => setMovimientoTarget(lote)}
                    >
                      + Movimiento
                    </button>
                    <button
                      type="button"
                      className="dt-row-action-btn"
                      onClick={() => setEditTarget(lote)}
                      aria-label="Editar lote"
                      title="Editar lote"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
                        <path d="M13.5 6.5l4 4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="dt-row-action-btn danger"
                      onClick={() => setDeleteTarget(lote)}
                      aria-label="Eliminar lote"
                      title="Eliminar lote"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4.5 7h15" />
                        <path d="M9 7V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8V7" />
                        <path d="M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L18.5 7" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>

                {abierto && (
                  <div className="pt-table-scroll">
                    <table className="dt-table pt-kardex-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} title="Fecha de embarque o venta" style={{ textAlign: "center" }}>
                            Fecha
                          </th>
                          <th colSpan={3} style={{ textAlign: "center" }}>Entradas</th>
                          <th colSpan={3} style={{ textAlign: "center" }}>Salidas</th>
                          <th colSpan={3} style={{ textAlign: "center" }}>Saldo</th>
                        </tr>
                        <tr>
                          <th title="Cantidad" style={{ textAlign: "center" }}>C</th>
                          <th title="Precio unitario" style={{ textAlign: "center" }}>PU</th>
                          <th title="Precio total" style={{ textAlign: "center" }}>PT</th>
                          <th title="Cantidad" style={{ textAlign: "center" }}>C</th>
                          <th title="Precio unitario" style={{ textAlign: "center" }}>PU</th>
                          <th title="Precio total" style={{ textAlign: "center" }}>PT</th>
                          <th title="Cantidad" style={{ textAlign: "center" }}>C</th>
                          <th title="Precio unitario" style={{ textAlign: "center" }}>PU</th>
                          <th title="Precio total" style={{ textAlign: "center" }}>PT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((fila) => (
                          <tr key={fila.id}>
                            <td style={{ textAlign: "center" }}>
                              {fila.fecha ? formatCellValue(fila.fecha, "date") : "Exist. inicial"}
                            </td>
                            <td style={{ textAlign: "center" }}>{fila.entradaC ?? "—"}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.entradaPU, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.entradaPT, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{fila.salidaC ?? "—"}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.salidaPU, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.salidaPT, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{fila.saldoC}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.saldoPU, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.saldoPT, "currency")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="dt-footer">
        Mostrando {filtrados.length} de {productosTerminados.length} lotes
      </div>

      <AgregarMovimientoModal
        lote={movimientoTarget}
        onClose={() => setMovimientoTarget(null)}
        onSubmit={addMovimiento}
      />

      <EditLoteModal lote={editTarget} onClose={() => setEditTarget(null)} onSubmit={updateLote} />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        sectionTitle="Productos terminados"
        message={
          deleteTarget
            ? `¿Eliminar el lote ${deleteTarget.lote} (${deleteTarget.producto} — ${deleteTarget.formato})? Esta acción no se puede deshacer.`
            : ""
        }
        confirming={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
