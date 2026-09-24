"use client";

import { useMemo, useState } from "react";
import { formatCellValue } from "@/app/components/data-table/format";
import { buildKardex, type KardexMovimiento } from "@/app/components/data-table/kardex";
import { exportKardexToPdf } from "@/app/components/data-table/exportKardexPdf";
import AgregarMovimientoModal from "./AgregarMovimientoModal";
import type { LoteTerminado } from "./data";

export default function ProductosTerminadosView({
  initialLotes,
}: {
  initialLotes: LoteTerminado[];
}) {
  const [lotesState, setLotesState] = useState(initialLotes);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"" | "activo" | "agotado">("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [movimientoTarget, setMovimientoTarget] = useState<LoteTerminado | null>(null);

  // Cada lote es "algo diferente": no es una fila más, es su propia tabla de
  // kardex. Se precalcula acá para no rearmarla en cada render de la tarjeta.
  const lotes = useMemo(
    () =>
      lotesState.map((lote) => {
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
    [lotesState]
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

  // Demo en memoria: cuando el modelo esté en Prisma, esto pasa a ser un
  // POST a /api/productos-terminados/[lote]/movimientos.
  function handleAgregarMovimiento(loteId: number, movimiento: Omit<KardexMovimiento, "id">) {
    setLotesState((prev) =>
      prev.map((l) => {
        if (l.id !== loteId) return l;
        const nextId = l.movimientos.reduce((max, m) => Math.max(max, m.id), 0) + 1;
        return { ...l, movimientos: [...l.movimientos, { ...movimiento, id: nextId }] };
      })
    );
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
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pt-card-add-btn"
                    onClick={() => setMovimientoTarget(lote)}
                  >
                    + Movimiento
                  </button>
                </div>

                {abierto && (
                  <div className="pt-table-scroll">
                    <table className="dt-table pt-kardex-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} title="Fecha de embarque o venta">
                            Fecha
                          </th>
                          <th colSpan={3}>Entradas</th>
                          <th colSpan={3}>Salidas</th>
                          <th colSpan={3}>Saldo</th>
                        </tr>
                        <tr>
                          <th title="Cantidad">C</th>
                          <th title="Precio unitario">PU</th>
                          <th title="Precio total">PT</th>
                          <th title="Cantidad">C</th>
                          <th title="Precio unitario">PU</th>
                          <th title="Precio total">PT</th>
                          <th title="Cantidad">C</th>
                          <th title="Precio unitario">PU</th>
                          <th title="Precio total">PT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((fila) => (
                          <tr key={fila.id}>
                            <td>{fila.fecha ? formatCellValue(fila.fecha, "date") : "Exist. inicial"}</td>
                            <td style={{ textAlign: "right" }}>{fila.entradaC ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.entradaPU, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.entradaPT, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{fila.salidaC ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.salidaPU, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.salidaPT, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{fila.saldoC}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.saldoPU, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.saldoPT, "currency")}</td>
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
        Mostrando {filtrados.length} de {lotesState.length} lotes
      </div>

      <AgregarMovimientoModal
        lote={movimientoTarget}
        onClose={() => setMovimientoTarget(null)}
        onSubmit={handleAgregarMovimiento}
      />
    </div>
  );
}
