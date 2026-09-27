"use client";

import { useMemo, useState } from "react";
import { formatCellValue } from "@/app/components/data-table/format";
import { buildKardex } from "@/app/components/data-table/kardex";
import { exportKardexToPdf, type KardexPdfColumnGroup } from "@/app/components/data-table/exportKardexPdf";
import ConfirmDeleteDialog from "@/app/components/data-table/ConfirmDeleteDialog";
import AgregarMovimientoInventarioModal from "./AgregarMovimientoInventarioModal";
import AgregarMateriaPrimaInventarioModal from "./AgregarMateriaPrimaInventarioModal";
import EditInventarioModal from "./EditInventarioModal";
import type { InventarioMateriaPrimaRow } from "./data";
import { useStore } from "../store";

const qtyFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatQty(v: number | null): string {
  return v === null || v === undefined ? "—" : qtyFormatter.format(v);
}

// Estructura propia de esta sección para el PDF: a diferencia de Productos
// terminados (Entradas/Salidas/Saldo, 3x3), acá "Entradas" se muestra
// separada en dos grupos —Ingresos s/Insumo (cantidades) y Compras
// (valorización)— más la columna informativa de Cáscara. La lógica de
// acumulación (buildKardex) es la misma; esto sólo reordena cómo se pintan
// sus campos.
const PDF_COLUMN_GROUPS: KardexPdfColumnGroup[] = [
  {
    label: "Ingresos s/Insumo",
    columns: [
      { label: "C", get: (f) => f.entradaC, format: "raw" },
      { label: "C (Cáscara)", get: (f) => f.entradaSecundariaC, format: "raw" },
    ],
  },
  {
    label: "Compras",
    columns: [
      { label: "CU", get: (f) => f.entradaPU, format: "currency" },
      { label: "CT", get: (f) => f.entradaPT, format: "currency" },
    ],
  },
  {
    label: "Consumos",
    columns: [
      { label: "C", get: (f) => f.salidaC, format: "raw" },
      { label: "CU", get: (f) => f.salidaPU, format: "currency" },
      { label: "CT", get: (f) => f.salidaPT, format: "currency" },
    ],
  },
  {
    label: "Saldo",
    columns: [
      { label: "C", get: (f) => f.saldoC, format: "raw" },
      { label: "CU", get: (f) => f.saldoPU, format: "currency" },
      { label: "CT", get: (f) => f.saldoPT, format: "currency" },
    ],
  },
];

export default function InventarioMateriaPrimaView() {
  const {
    materiaPrima,
    inventarioMateriaPrima,
    addInventarioMateriaPrima,
    addInventarioMovimiento,
    updateInventarioMateriaPrima,
    deleteInventarioMateriaPrima,
  } = useStore();

  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"" | "activo" | "agotado">("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [addingNueva, setAddingNueva] = useState(false);
  const [movimientoTarget, setMovimientoTarget] = useState<InventarioMateriaPrimaRow | null>(null);
  const [editTarget, setEditTarget] = useState<InventarioMateriaPrimaRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventarioMateriaPrimaRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Cada materia prima trackeada es su propia tabla de kardex — se precalcula
  // acá, uniendo con el catálogo (nombre/unidad) para no rearmarlo por tarjeta.
  const filas = useMemo(
    () =>
      inventarioMateriaPrima.map((row) => {
        const catalogo = materiaPrima.find((m) => m.id === row.materiaPrimaId);
        const kardex = buildKardex(row.existenciaInicial, row.costoUnitario, row.movimientos);
        const ultima = kardex[kardex.length - 1];
        const totalIngresos = row.movimientos
          .filter((m) => m.tipo === "entrada")
          .reduce((sum, m) => sum + m.cantidad, 0);
        const totalConsumos = row.movimientos
          .filter((m) => m.tipo === "salida")
          .reduce((sum, m) => sum + m.cantidad, 0);
        return {
          row,
          nombre: catalogo?.nombre ?? "Materia prima eliminada del catálogo",
          unidad: catalogo?.unidad ?? "",
          kardex,
          saldoActual: ultima.saldoC,
          valorActual: ultima.saldoPT,
          totalIngresos,
          totalConsumos,
        };
      }),
    [inventarioMateriaPrima, materiaPrima]
  );

  const filtradas = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return filas.filter(({ nombre, unidad, saldoActual }) => {
      if (estado === "activo" && saldoActual <= 0) return false;
      if (estado === "agotado" && saldoActual > 0) return false;
      if (!needle) return true;
      return nombre.toLowerCase().includes(needle) || unidad.toLowerCase().includes(needle);
    });
  }, [filas, search, estado]);

  // Materias primas del catálogo que todavía no tienen kardex en esta sección
  // (para no poder elegir dos veces la misma en el modal de alta).
  const disponiblesParaTrackear = useMemo(
    () => materiaPrima.filter((m) => !inventarioMateriaPrima.some((r) => r.materiaPrimaId === m.id)),
    [materiaPrima, inventarioMateriaPrima]
  );

  const hayFiltros = search.trim() !== "" || estado !== "";
  const todoExpandido = filtradas.length > 0 && filtradas.every(({ row }) => expanded[row.id]);

  function toggleFila(id: number) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleTodos() {
    const next = !todoExpandido;
    setExpanded((prev) => {
      const copia = { ...prev };
      for (const { row } of filtradas) copia[row.id] = next;
      return copia;
    });
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportKardexToPdf(
        "Inventario de materia prima",
        filtradas.map(({ nombre, unidad, kardex }) => ({
          badge: unidad,
          title: nombre,
          filas: kardex,
        })),
        PDF_COLUMN_GROUPS,
        { singular: "materia prima", plural: "materias primas" }
      );
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      deleteInventarioMateriaPrima(deleteTarget.id);
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
          placeholder="Buscar por materia prima o unidad…"
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
          <button type="button" className="dt-clear-btn" onClick={toggleTodos} disabled={filtradas.length === 0}>
            {todoExpandido ? "Colapsar todo" : "Expandir todo"}
          </button>
          <button
            type="button"
            className="dt-pdf-btn"
            onClick={handleExportPdf}
            disabled={exporting || filtradas.length === 0}
          >
            {exporting ? "Generando…" : "Descargar PDF"}
          </button>
          <button
            type="button"
            className="rf-trigger-btn"
            onClick={() => setAddingNueva(true)}
            disabled={disponiblesParaTrackear.length === 0}
            title={disponiblesParaTrackear.length === 0 ? "Ya se está trackeando todo el catálogo" : undefined}
          >
            + Materia prima
          </button>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="dt-empty">
          {inventarioMateriaPrima.length === 0
            ? "Todavía no se agregó ninguna materia prima al inventario."
            : "No hay materias primas que coincidan con la búsqueda."}
        </div>
      ) : (
        <div className="pt-list">
          {filtradas.map(({ row, nombre, unidad, kardex, saldoActual, valorActual, totalIngresos, totalConsumos }) => {
            const abierto = Boolean(expanded[row.id]);
            return (
              <div className="pt-card" key={row.id}>
                <div className="pt-card-header">
                  <button type="button" className="pt-card-toggle" onClick={() => toggleFila(row.id)}>
                    <span className={`pt-chevron ${abierto ? "open" : ""}`}>▸</span>
                    <span className="pt-badge">{unidad || "—"}</span>
                    <span className="pt-card-title">{nombre}</span>
                    <span className="pt-card-stats">
                      <span title="Total ingresado">Ingr.: {formatQty(totalIngresos)}</span>
                      <span title="Total consumido">Cons.: {formatQty(totalConsumos)}</span>
                      <span title="Saldo actual" className={saldoActual > 0 ? "pt-stat-ok" : "pt-stat-off"}>
                        Saldo: {formatQty(saldoActual)}
                      </span>
                      <span title="Valor del saldo" className="pt-stat-value">
                        {formatCellValue(valorActual, "currency")}
                      </span>
                    </span>
                  </button>
                  <div className="pt-card-actions">
                    <button
                      type="button"
                      className="pt-card-add-btn"
                      onClick={() => setMovimientoTarget(row)}
                    >
                      + Movimiento
                    </button>
                    <button
                      type="button"
                      className="dt-row-action-btn"
                      onClick={() => setEditTarget(row)}
                      aria-label="Editar"
                      title="Editar existencia inicial / costo"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
                        <path d="M13.5 6.5l4 4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="dt-row-action-btn danger"
                      onClick={() => setDeleteTarget(row)}
                      aria-label="Quitar del inventario"
                      title="Quitar del inventario"
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
                          <th rowSpan={2} style={{ textAlign: "center" }}>Fecha</th>
                          <th colSpan={2} style={{ textAlign: "center" }}>Ingresos s/Insumo</th>
                          <th colSpan={2} style={{ textAlign: "center" }}>Compras</th>
                          <th colSpan={3} style={{ textAlign: "center" }}>Consumos</th>
                          <th colSpan={3} style={{ textAlign: "center" }}>Saldo</th>
                        </tr>
                        <tr>
                          <th title="Cantidad" style={{ textAlign: "center" }}>C</th>
                          <th title="Cantidad de cáscara (si aplica)" style={{ textAlign: "center" }}>C (Cáscara)</th>
                          <th title="Costo unitario" style={{ textAlign: "center" }}>CU</th>
                          <th title="Costo total" style={{ textAlign: "center" }}>CT</th>
                          <th title="Cantidad" style={{ textAlign: "center" }}>C</th>
                          <th title="Costo unitario" style={{ textAlign: "center" }}>CU</th>
                          <th title="Costo total" style={{ textAlign: "center" }}>CT</th>
                          <th title="Cantidad" style={{ textAlign: "center" }}>C</th>
                          <th title="Costo unitario" style={{ textAlign: "center" }}>CU</th>
                          <th title="Costo total" style={{ textAlign: "center" }}>CT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kardex.map((fila) => (
                          <tr key={fila.id}>
                            <td style={{ textAlign: "center" }}>
                              {fila.fecha ? formatCellValue(fila.fecha, "date") : "Exist. inicial"}
                            </td>
                            <td style={{ textAlign: "center" }}>{formatQty(fila.entradaC)}</td>
                            <td style={{ textAlign: "center" }}>{formatQty(fila.entradaSecundariaC)}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.entradaPU, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.entradaPT, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{formatQty(fila.salidaC)}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.salidaPU, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{formatCellValue(fila.salidaPT, "currency")}</td>
                            <td style={{ textAlign: "center" }}>{formatQty(fila.saldoC)}</td>
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
        Mostrando {filtradas.length} de {inventarioMateriaPrima.length} materias primas trackeadas
      </div>

      <AgregarMateriaPrimaInventarioModal
        open={addingNueva}
        opciones={disponiblesParaTrackear}
        onClose={() => setAddingNueva(false)}
        onSubmit={addInventarioMateriaPrima}
      />

      <AgregarMovimientoInventarioModal
        row={movimientoTarget}
        nombre={movimientoTarget ? filas.find((f) => f.row.id === movimientoTarget.id)?.nombre ?? "" : ""}
        onClose={() => setMovimientoTarget(null)}
        onSubmit={addInventarioMovimiento}
      />

      <EditInventarioModal
        row={editTarget}
        nombre={editTarget ? filas.find((f) => f.row.id === editTarget.id)?.nombre ?? "" : ""}
        onClose={() => setEditTarget(null)}
        onSubmit={updateInventarioMateriaPrima}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        sectionTitle="Inventario de materia prima"
        message={
          deleteTarget
            ? `¿Quitar "${filas.find((f) => f.row.id === deleteTarget.id)?.nombre}" del inventario? Se pierde todo su historial de movimientos. Esta acción no se puede deshacer.`
            : ""
        }
        confirming={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
