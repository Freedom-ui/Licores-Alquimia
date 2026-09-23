"use client";

import { useMemo, useState } from "react";
import type { Column, DataTableProps } from "./types";
import { formatCellValue, searchableText } from "./format";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import { exportRowsToPdf } from "./exportPdf";
import Barcode from "./Barcode";

type SortDir = "asc" | "desc";

export default function DataTable<T extends Record<string, unknown>>({
  title,
  columns,
  rows,
  emptyMessage,
  actions,
  hideExport,
  hideImport,
  onEditRow,
  onDeleteRow,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  const searchableKeys = useMemo(
    () =>
      columns
        .filter((c) => {
          const type = c.type ?? "text";
          return c.searchable ?? (type !== "number" && type !== "currency");
        })
        .map((c) => c.key),
    [columns]
  );

  const filterableColumns = useMemo(() => columns.filter((c) => c.filterable), [columns]);

  const filterOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of filterableColumns) {
      const values = new Set<string>();
      for (const row of rows) {
        const v = row[col.key];
        if (v !== null && v !== undefined && v !== "") values.add(String(v));
      }
      map[col.key] = Array.from(values).sort((a, b) => a.localeCompare(b, "es"));
    }
    return map;
  }, [filterableColumns, rows]);

  const filteredRows = useMemo(() => {
    let result = rows;

    for (const col of filterableColumns) {
      const active = columnFilters[col.key];
      if (active) {
        result = result.filter((row) => String(row[col.key]) === active);
      }
    }

    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      result = result.filter((row) =>
        searchableKeys.some((key) => searchableText(row[key]).includes(needle))
      );
    }

    return result;
  }, [rows, search, searchableKeys, columnFilters, filterableColumns]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const col = columns.find((c) => c.key === sort.key);
    const type = col?.type ?? "text";

    const withIndex = filteredRows.map((row, i) => ({ row, i }));
    withIndex.sort((a, b) => {
      const av = a.row[sort.key];
      const bv = b.row[sort.key];
      let cmp: number;

      if (type === "number" || type === "currency") {
        cmp = Number(av ?? 0) - Number(bv ?? 0);
      } else if (type === "date") {
        cmp = new Date(String(av ?? 0)).getTime() - new Date(String(bv ?? 0)).getTime();
      } else {
        cmp = searchableText(av).localeCompare(searchableText(bv), "es");
      }

      if (cmp === 0) return a.i - b.i;
      return sort.dir === "asc" ? cmp : -cmp;
    });

    return withIndex.map((x) => x.row);
  }, [filteredRows, sort, columns]);

  function toggleSort(col: Column<T>) {
    if (col.sortable === false) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: "asc" };
      if (prev.dir === "asc") return { key: col.key, dir: "desc" };
      return null;
    });
  }

  const hasFilters = search.trim() !== "" || Object.values(columnFilters).some(Boolean);
  const hasRowActions = Boolean(onEditRow || onDeleteRow);

  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function cancelDelete() {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete || !onDeleteRow) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteRow(pendingDelete);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar el registro.");
    } finally {
      setDeleting(false);
    }
  }

  const deleteLabelColumn = columns[0];
  const deleteRowLabel =
    pendingDelete && deleteLabelColumn ? String(pendingDelete[deleteLabelColumn.key] ?? "") : "";
  // Si la primera columna es un número (ej. "OP N°"), no tiene sentido citarlo
  // entre comillas como si fuera un nombre — se lee mejor como "registro N° 1".
  const deleteRowIsNumeric = deleteLabelColumn?.type === "number";

  const [exporting, setExporting] = useState(false);

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportRowsToPdf(title, columns, sortedRows);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="dt-wrapper">
      <div className="dt-toolbar">
        <input
          type="text"
          className="dt-search"
          placeholder={`Buscar en ${title.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {filterableColumns.map((col) => (
          <select
            key={col.key}
            className="dt-filter-select"
            value={columnFilters[col.key] ?? ""}
            onChange={(e) =>
              setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
            }
          >
            <option value="">{col.label} (todos)</option>
            {filterOptions[col.key]?.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ))}

        {hasFilters && (
          <button
            type="button"
            className="dt-clear-btn"
            onClick={() => {
              setSearch("");
              setColumnFilters({});
            }}
          >
            Limpiar filtros
          </button>
        )}

        <div className="dt-actions">
          {!hideExport && (
            <button
              type="button"
              className="dt-pdf-btn"
              onClick={handleExportPdf}
              disabled={exporting || sortedRows.length === 0}
            >
              {exporting ? "Generando…" : "Descargar PDF"}
            </button>
          )}
          {!hideImport && (
            <button
              type="button"
              className="dt-excel-btn"
              disabled
              title="Disponible próximamente"
            >
              Importar Excel
            </button>
          )}
          {actions}
        </div>
      </div>

      <div className="dt-table-scroll">
        <table className="dt-table">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sort?.key === col.key;
                const sortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width, textAlign: col.align ?? "left" }}
                    className={sortable ? "dt-th-sortable" : ""}
                    onClick={() => toggleSort(col)}
                    title={col.title}
                  >
                    <span className="dt-th-label">
                      <span className="dt-th-text">{col.label}</span>
                      {sortable && (
                        <span className={`dt-sort-icon ${isSorted ? "active" : ""}`}>
                          {isSorted ? (sort!.dir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
              {hasRowActions && <th className="dt-actions-col">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (hasRowActions ? 1 : 0)} className="dt-empty">
                  {emptyMessage ?? `No hay registros en ${title.toLowerCase()}.`}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, i) => (
                <tr key={(row.id as string | number | undefined) ?? i}>
                  {columns.map((col) => {
                    const value = row[col.key];
                    const type = col.type ?? "text";
                    return (
                      <td
                        key={col.key}
                        style={{ textAlign: col.align ?? "left" }}
                        title={formatCellValue(value, type)}
                      >
                        {type === "tag" && value ? (
                          <span className="dt-tag">{String(value)}</span>
                        ) : type === "email" && value ? (
                          <a className="dt-email" href={`mailto:${String(value)}`}>
                            {String(value)}
                          </a>
                        ) : type === "barcode" && value ? (
                          <span className="dt-barcode-cell">
                            <Barcode value={String(value)} />
                          </span>
                        ) : (
                          formatCellValue(value, type)
                        )}
                      </td>
                    );
                  })}
                  {hasRowActions && (
                    <td className="dt-actions-cell">
                      {onEditRow && (
                        <button
                          type="button"
                          className="dt-row-action-btn"
                          onClick={() => onEditRow(row)}
                          aria-label="Editar"
                          title="Editar"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
                            <path d="M13.5 6.5l4 4" />
                          </svg>
                        </button>
                      )}
                      {onDeleteRow && (
                        <button
                          type="button"
                          className="dt-row-action-btn danger"
                          onClick={() => setPendingDelete(row)}
                          aria-label="Eliminar"
                          title="Eliminar"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4.5 7h15" />
                            <path d="M9 7V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8V7" />
                            <path d="M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L18.5 7" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="dt-footer">
        Mostrando {sortedRows.length} de {rows.length} registros
      </div>

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        sectionTitle={title}
        message={
          deleteRowLabel
            ? deleteRowIsNumeric
              ? `¿Eliminar el registro N° ${deleteRowLabel} de ${title.toLowerCase()}? Esta acción no se puede deshacer.`
              : `¿Eliminar "${deleteRowLabel}" de ${title.toLowerCase()}? Esta acción no se puede deshacer.`
            : `¿Eliminar este registro de ${title.toLowerCase()}? Esta acción no se puede deshacer.`
        }
        error={deleteError}
        confirming={deleting}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
