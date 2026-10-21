"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import type { Column, DataTableProps } from "./types";
import { formatCellValue, searchableText } from "./format";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import EliminarVariosDialog, { type ResultadoEliminarVarios } from "./EliminarVariosDialog";
import FichaRegistroModal from "./FichaRegistroModal";
import { exportRowsToPdf } from "./exportPdf";
import { FILAS_POR_PAGINA, paginasVisibles, rango } from "./paginacion";
import Barcode from "./Barcode";

type SortDir = "asc" | "desc";
type Clave = string | number;

/** Tope por defecto (px) de las columnas de texto libre: lo que no entra se corta con "…". */
const ANCHO_MAXIMO_TEXTO = 260;
/** Lo mínimo que mide una columna de texto que se corta, para que siga siendo legible. */
const ANCHO_MINIMO_TEXTO = 90;

function topeDeColumna<T>(col: Column<T>): number | null {
  if (col.maxWidth !== undefined) return col.maxWidth;
  const type = col.type ?? "text";
  return type === "text" || type === "email" ? ANCHO_MAXIMO_TEXTO : null;
}

/**
 * Ancho de una celda de texto que se corta. Con ancho en % (lo normal), la
 * columna ocupa su parte de la tabla y lo que no entra se corta (max-width: 0
 * hace que el contenido no la estire): así la tabla entra sin scroll
 * horizontal. Sin %, el tope fijo en px.
 */
function estiloCorte<T>(col: Column<T>, tope: number | null): { maxWidth?: number | string } {
  if (tope === null) return {};
  return col.width?.endsWith("%") ? { maxWidth: 0 } : { maxWidth: tope };
}

/** Clic que cae en un control propio de la fila (editar, eliminar, un enlace): no marca la fila. */
const esControl = (e: MouseEvent) => (e.target as HTMLElement).closest("button, a, input, select, textarea, label") !== null;

/** Hay un modal abierto (de la tabla o de la sección): el teclado es de él, no de la tabla. */
const hayModalAbierto = () => document.querySelector(".rf-overlay") !== null;

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
  rowActions,
  onDeleteRows,
  ficha,
  anchoMaximo,
  enfocar,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [pagina, setPagina] = useState(0);
  // Fila activa (resaltada para seguirla con la vista) y selección múltiple.
  const [activa, setActiva] = useState<Clave | null>(null);
  const [seleccion, setSeleccion] = useState<ReadonlySet<Clave>>(new Set());
  const [fichaDe, setFichaDe] = useState<T | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cada fila se identifica por su id (todas las secciones lo tienen); si no, por su posición.
  const claves = useMemo(() => new Map<T, Clave>(rows.map((r, i) => [r, (r.id as Clave | undefined) ?? `fila-${i}`])), [rows]);
  const clave = (row: T): Clave => claves.get(row)!;

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

  // Claves en el orden en que se ven (para Shift+clic, flechas y Ctrl+A).
  const ordenClaves = useMemo(() => sortedRows.map((r) => claves.get(r)!), [sortedRows, claves]);
  // La selección vale solo sobre lo que se ve: lo borrado o filtrado deja de contar.
  const seleccionadas = useMemo(() => sortedRows.filter((r) => seleccion.has(claves.get(r)!)), [sortedRows, seleccion, claves]);

  // Fila pedida desde otra sección (?foco=): se marca como activa y se va a su página.
  const [focoAplicado, setFocoAplicado] = useState<Clave | null>(null);
  const focoPedido = enfocar ?? null;
  if (focoPedido !== focoAplicado) {
    setFocoAplicado(focoPedido);
    const i = focoPedido === null ? -1 : ordenClaves.indexOf(focoPedido);
    if (i !== -1) {
      setActiva(focoPedido);
      setSeleccion(new Set());
      setPagina(Math.floor(i / FILAS_POR_PAGINA));
    }
  }
  useEffect(() => {
    if (focoAplicado === null) return;
    const tr = scrollRef.current?.querySelector(`tr[data-clave="${String(focoAplicado)}"]`);
    if (!tr) return;
    tr.scrollIntoView({ block: "center" });
    scrollRef.current?.focus({ preventScroll: true });
  }, [focoAplicado]);

  const totalPaginas = Math.max(1, Math.ceil(sortedRows.length / FILAS_POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const desde = paginaActual * FILAS_POR_PAGINA;
  const filasPagina = sortedRows.slice(desde, desde + FILAS_POR_PAGINA);

  function irAPagina(p: number) {
    setPagina(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  // Buscar o filtrar arma otra lista: vuelve a la primera página y limpia la selección.
  function alCambiarFiltros(aplicar: () => void) {
    aplicar();
    setPagina(0);
    setSeleccion(new Set());
  }

  function toggleSort(col: Column<T>) {
    if (col.sortable === false) return;
    setPagina(0);
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: "asc" };
      if (prev.dir === "asc") return { key: col.key, dir: "desc" };
      return null;
    });
  }

  const hasFilters = search.trim() !== "" || Object.values(columnFilters).some(Boolean);
  const hasRowActions = Boolean(onEditRow || onDeleteRow || rowActions);
  const hasGroups = columns.some((c) => c.group);
  // Primera columna de cada grupo y la que le sigue: llevan línea divisoria a la izquierda.
  const dividerIndexes = new Set(
    columns
      .map((c, i) => (i > 0 && (c.group || columns[i - 1].group) && c.group !== columns[i - 1].group ? i : -1))
      .filter((i) => i !== -1)
  );

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
  // Si la primera columna es un número (ej. "OP N°"), no tiene sentido citarlo
  // entre comillas como si fuera un nombre — se lee mejor como "registro N° 1".
  const deleteRowIsNumeric = deleteLabelColumn?.type === "number";
  const etiquetaDe = (row: T) => {
    const v = deleteLabelColumn ? formatCellValue(row[deleteLabelColumn.key], deleteLabelColumn.type ?? "text") : "";
    return deleteRowIsNumeric ? `${deleteLabelColumn.label} ${v}` : v;
  };
  const deleteRowLabel =
    pendingDelete && deleteLabelColumn ? String(pendingDelete[deleteLabelColumn.key] ?? "") : "";

  // ── Borrado de varias filas (selección) ──
  const [varios, setVarios] = useState<{
    confirming: boolean;
    error: string | null;
    resultado: ResultadoEliminarVarios | null;
  } | null>(null);

  function pedirEliminarVarios() {
    if (!onDeleteRows || seleccionadas.length === 0) return;
    setVarios({ confirming: false, error: null, resultado: null });
  }

  function cerrarVarios() {
    if (varios?.confirming) return;
    setVarios(null);
    scrollRef.current?.focus({ preventScroll: true });
  }

  async function confirmarVarios() {
    if (!onDeleteRows) return;
    const filas = seleccionadas;
    setVarios({ confirming: true, error: null, resultado: null });
    try {
      const fallos = await onDeleteRows(filas);
      setSeleccion(new Set());
      setActiva(null);
      if (fallos.length === 0) setVarios(null);
      else
        setVarios({
          confirming: false,
          error: null,
          resultado: {
            eliminados: filas.length - fallos.length,
            fallos: fallos.map((f) => ({ etiqueta: etiquetaDe(f.row), mensaje: f.mensaje })),
          },
        });
    } catch (err) {
      setVarios({ confirming: false, error: err instanceof Error ? err.message : "No se pudieron eliminar los registros.", resultado: null });
    }
  }

  // ── Fila activa, selección y teclado ──

  function abrirFicha(row: T) {
    if (ficha) setFichaDe(row);
    else onEditRow?.(row);
  }

  function alClicFila(e: MouseEvent, row: T) {
    if (esControl(e)) return;
    scrollRef.current?.focus({ preventScroll: true });
    // El segundo clic de un doble clic no desmarca: el doble clic abre la ficha.
    if (e.detail > 1) return;
    const k = clave(row);
    if (e.shiftKey) {
      // Desde la fila activa (el ancla) hasta la clickeada, en el orden en que se ven.
      setSeleccion(new Set(rango(ordenClaves, activa ?? k, k)));
      if (activa === null) setActiva(k);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSeleccion((prev) => {
        const nueva = new Set(prev);
        // La primera fila suelta que se suma arrastra a la activa: ya la tenía marcada.
        if (nueva.size === 0 && activa !== null && activa !== k && ordenClaves.includes(activa)) nueva.add(activa);
        if (nueva.has(k)) nueva.delete(k);
        else nueva.add(k);
        return nueva;
      });
      setActiva(k);
      return;
    }
    if (seleccion.size > 0) {
      setSeleccion(new Set());
      setActiva(k);
      return;
    }
    setActiva((prev) => (prev === k ? null : k));
  }

  function moverActiva(paso: 1 | -1) {
    if (ordenClaves.length === 0) return;
    const i = activa === null ? -1 : ordenClaves.indexOf(activa);
    const siguiente =
      i === -1 ? (paso === 1 ? desde : Math.min(desde + FILAS_POR_PAGINA, ordenClaves.length) - 1) : Math.min(Math.max(i + paso, 0), ordenClaves.length - 1);
    const k = ordenClaves[siguiente];
    setActiva(k);
    setPagina(Math.floor(siguiente / FILAS_POR_PAGINA));
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`tr[data-clave="${String(k)}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }

  function alTeclado(e: KeyboardEvent<HTMLDivElement>) {
    if (hayModalAbierto()) return;
    const filaActiva = activa === null ? undefined : sortedRows.find((r) => clave(r) === activa);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSeleccion(new Set(ordenClaves));
      return;
    }
    switch (e.key) {
      case "Escape":
        if (seleccion.size > 0) setSeleccion(new Set());
        else if (activa !== null) setActiva(null);
        else return;
        break;
      case "ArrowDown":
        moverActiva(1);
        break;
      case "ArrowUp":
        moverActiva(-1);
        break;
      case "Enter":
        if (!filaActiva) return;
        abrirFicha(filaActiva);
        break;
      case "Delete":
      case "Backspace":
        // Supr (o ⌘ + borrar en Mac): las seleccionadas, o si no hay, la fila activa.
        if (e.key === "Backspace" && !e.metaKey) return;
        if (seleccionadas.length > 0 && onDeleteRows) pedirEliminarVarios();
        else if (filaActiva && onDeleteRow) setPendingDelete(filaActiva);
        else return;
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  function renderHeaderCell(col: Column<T>, index: number, rowSpan: number) {
    const isSorted = sort?.key === col.key;
    const sortable = col.sortable !== false;
    const classes = [sortable ? "dt-th-sortable" : "", dividerIndexes.has(index) ? "dt-col-divider" : ""]
      .filter(Boolean)
      .join(" ");
    return (
      <th
        key={col.key}
        rowSpan={rowSpan > 1 ? rowSpan : undefined}
        style={{
          width: col.width,
          // Columnas que se cortan, en %: no achicarlas más allá de lo legible.
          minWidth: topeDeColumna(col) !== null && col.width?.endsWith("%") ? ANCHO_MINIMO_TEXTO : undefined,
          textAlign: col.align ?? "left",
        }}
        className={classes || undefined}
        onClick={() => toggleSort(col)}
        title={col.title}
      >
        <span
          className="dt-th-label"
          style={{
            // El encabezado es un flex-row: text-align en el <th> no
            // lo mueve (no es contenido inline), hay que centrarlo
            // a mano para que quede alineado con el dato de abajo.
            justifyContent: col.align === "center" ? "center" : col.align === "right" ? "flex-end" : "flex-start",
          }}
        >
          <span className="dt-th-text">{col.label}</span>
          {sortable && (
            <span className={`dt-sort-icon ${isSorted ? "active" : ""}`}>
              {isSorted ? (sort!.dir === "asc" ? "▲" : "▼") : "⇅"}
            </span>
          )}
        </span>
      </th>
    );
  }

  const [exporting, setExporting] = useState(false);

  // Con filas seleccionadas se exportan solo esas; si no, todas las filtradas.
  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportRowsToPdf(title, columns, seleccionadas.length > 0 ? seleccionadas : sortedRows);
    } finally {
      setExporting(false);
    }
  }

  const n = seleccionadas.length;
  const hasta = desde + filasPagina.length;

  return (
    <div className={anchoMaximo ? "dt-wrapper dt-acotada" : "dt-wrapper"}>
      <div className="dt-toolbar">
        <input
          type="text"
          className="dt-search"
          placeholder={`Buscar en ${title.toLowerCase()}…`}
          value={search}
          onChange={(e) => alCambiarFiltros(() => setSearch(e.target.value))}
        />

        {filterableColumns.map((col) => (
          <select
            key={col.key}
            className="dt-filter-select"
            value={columnFilters[col.key] ?? ""}
            onChange={(e) => alCambiarFiltros(() => setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value })))}
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
            onClick={() =>
              alCambiarFiltros(() => {
                setSearch("");
                setColumnFilters({});
              })
            }
          >
            Limpiar filtros
          </button>
        )}

        <div className="dt-actions">
          {n > 0 && (
            <div className="dt-seleccion" role="status">
              <strong>
                {n} {n === 1 ? "seleccionada" : "seleccionadas"}
              </strong>
              {onDeleteRows && (
                <button type="button" className="dt-sel-btn danger" onClick={pedirEliminarVarios}>
                  Eliminar
                </button>
              )}
              <button type="button" className="dt-sel-btn" onClick={() => setSeleccion(new Set())} title="Quitar selección (Esc)">
                Quitar selección
              </button>
            </div>
          )}
          {!hideExport && (
            <button
              type="button"
              className="dt-pdf-btn"
              onClick={handleExportPdf}
              disabled={exporting || sortedRows.length === 0}
              title={n > 0 ? `Descargar solo las ${n} filas seleccionadas` : "Descargar todas las filas que se ven (con los filtros aplicados)"}
            >
              {exporting ? "Generando…" : n > 0 ? `Descargar PDF (${n})` : "Descargar PDF"}
            </button>
          )}
          {!hideImport && (
            <Link href="/importar" className="dt-excel-btn" title="Cargar los datos desde la planilla de Excel">
              Importar Excel
            </Link>
          )}
          {actions}
        </div>
      </div>

      <div
        className="dt-table-scroll"
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={alTeclado}
        aria-label={`Tabla de ${title.toLowerCase()}`}
      >
        <table className="dt-table">
          <thead>
            {hasGroups && (
              <tr>
                {columns.map((col, i) => {
                  if (!col.group) return renderHeaderCell(col, i, 2);
                  if (i > 0 && columns[i - 1].group === col.group) return null;
                  let span = 1;
                  while (columns[i + span]?.group === col.group) span++;
                  return (
                    <th
                      key={`grupo-${i}`}
                      colSpan={span}
                      className={`dt-th-group ${dividerIndexes.has(i) ? "dt-col-divider" : ""}`}
                    >
                      {col.group}
                    </th>
                  );
                })}
                {hasRowActions && (
                  <th className="dt-actions-col" rowSpan={2}>
                    Acciones
                  </th>
                )}
              </tr>
            )}
            <tr>
              {columns.map((col, i) => (hasGroups && !col.group ? null : renderHeaderCell(col, i, 1)))}
              {hasRowActions && !hasGroups && <th className="dt-actions-col">Acciones</th>}
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
              filasPagina.map((row) => {
                const k = clave(row);
                const clases = [k === activa ? "dt-row-activa" : "", seleccion.has(k) ? "dt-row-sel" : ""].filter(Boolean).join(" ");
                return (
                  <tr
                    key={k}
                    data-clave={k}
                    className={clases || undefined}
                    aria-selected={seleccion.has(k) || undefined}
                    onMouseDown={(e) => {
                      // Shift / Ctrl + clic seleccionan filas, no texto.
                      if ((e.shiftKey || e.ctrlKey || e.metaKey) && !esControl(e)) e.preventDefault();
                    }}
                    onClick={(e) => alClicFila(e, row)}
                    onDoubleClick={(e) => {
                      if (esControl(e)) return;
                      setActiva(k);
                      abrirFicha(row);
                    }}
                  >
                    {columns.map((col, ci) => {
                      const value = row[col.key];
                      const type = col.type ?? "text";
                      const tope = topeDeColumna(col);
                      const clasesCelda = [dividerIndexes.has(ci) ? "dt-col-divider" : "", tope !== null ? "dt-td-corta" : ""]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <td
                          key={col.key}
                          className={clasesCelda || undefined}
                          style={{ textAlign: col.align ?? "left", ...estiloCorte(col, tope) }}
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
                        {rowActions?.(row)}
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="dt-footer">
        <span className="dt-footer-texto">
          {totalPaginas > 1
            ? `Mostrando ${desde + 1}–${hasta} de ${sortedRows.length} registros${sortedRows.length !== rows.length ? ` (filtrados de ${rows.length})` : ""}`
            : `Mostrando ${sortedRows.length} de ${rows.length} registros`}
          <span
            className="dt-atajos"
            title={
              "Clic: marcar la fila · Doble clic o Enter: ver la ficha · ↑ ↓: moverse\n" +
              "Shift + clic: seleccionar desde la fila marcada · Ctrl (⌘) + clic: sumar o quitar una fila\n" +
              "Ctrl (⌘) + A: seleccionar todas · Supr: eliminar · Esc: limpiar"
            }
          >
            Atajos
          </span>
        </span>
        {totalPaginas > 1 && (
          <nav className="dt-paginador" aria-label="Páginas">
            <button
              type="button"
              className="dt-pag-btn"
              onClick={() => irAPagina(paginaActual - 1)}
              disabled={paginaActual === 0}
              aria-label="Página anterior"
            >
              ‹
            </button>
            {paginasVisibles(paginaActual, totalPaginas).map((p, i) =>
              p === "…" ? (
                <span key={`salto-${i}`} className="dt-pag-salto">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={p === paginaActual ? "dt-pag-btn active" : "dt-pag-btn"}
                  onClick={() => irAPagina(p)}
                  aria-current={p === paginaActual ? "page" : undefined}
                  aria-label={`Página ${p + 1}`}
                >
                  {p + 1}
                </button>
              )
            )}
            <button
              type="button"
              className="dt-pag-btn"
              onClick={() => irAPagina(paginaActual + 1)}
              disabled={paginaActual === totalPaginas - 1}
              aria-label="Página siguiente"
            >
              ›
            </button>
          </nav>
        )}
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

      <EliminarVariosDialog
        open={varios !== null}
        sectionTitle={title}
        cantidad={n}
        confirming={varios?.confirming ?? false}
        error={varios?.error ?? null}
        resultado={varios?.resultado ?? null}
        onCancel={cerrarVarios}
        onConfirm={confirmarVarios}
      />

      {fichaDe && ficha && (
        <FichaRegistroModal
          seccion={title}
          titulo={ficha.titulo(fichaDe)}
          columns={columns}
          row={fichaDe}
          extra={ficha.extra?.(fichaDe)}
          onEditar={
            onEditRow
              ? () => {
                  const row = fichaDe;
                  setFichaDe(null);
                  onEditRow(row);
                }
              : undefined
          }
          onClose={() => {
            setFichaDe(null);
            scrollRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}
