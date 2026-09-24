"use client";

import { formatCellValue } from "./format";
import type { LineColumn } from "./types";

/**
 * Sub-tabla editable de "líneas" dentro de un formulario (ej. los insumos de
 * una orden de producción). Reusable: cualquier sección con un patrón
 * maestro-detalle (cabecera + líneas) puede usar esto para las líneas.
 */
export default function LineItemsField<L extends Record<string, unknown>>({
  label,
  columns,
  rows,
  onChange,
  emptyRow,
}: {
  label: string;
  columns: LineColumn<L>[];
  rows: L[];
  onChange: (rows: L[]) => void;
  /** Fábrica de una línea nueva en blanco (con los valores por defecto que corresponda). */
  emptyRow: () => L;
}) {
  function updateRow(index: number, key: string, raw: string) {
    const col = columns.find((c) => c.key === key);
    const value: unknown =
      col?.type === "number" || col?.type === "currency" ? Number(raw || 0) : raw;
    const next = rows.map((row, i) => (i === index ? { ...row, [key]: value } : row));
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...rows, emptyRow()]);
  }

  return (
    <div className="li-field">
      <div className="li-field-label">{label}</div>

      <div className="li-table-scroll">
        <table className="li-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              <th className="li-remove-col" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="li-empty">
                  Todavía no hay líneas — agregá al menos una.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => {
                    const value = row[c.key];
                    if (c.readOnly) {
                      return (
                        <td key={c.key} className="li-readonly">
                          {formatCellValue(value, c.type === "currency" ? "currency" : "text")}
                        </td>
                      );
                    }
                    if (c.type === "select") {
                      return (
                        <td key={c.key}>
                          <select
                            value={value === null || value === undefined ? "" : String(value)}
                            onChange={(e) => updateRow(i, c.key, e.target.value)}
                          >
                            <option value="">Seleccionar…</option>
                            {c.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }
                    return (
                      <td key={c.key}>
                        <input
                          type={c.type === "number" || c.type === "currency" ? "number" : "text"}
                          placeholder={c.placeholder}
                          value={value === null || value === undefined ? "" : String(value)}
                          onChange={(e) => updateRow(i, c.key, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td className="li-remove-col">
                    <button
                      type="button"
                      className="li-remove-btn"
                      onClick={() => removeRow(i)}
                      aria-label="Quitar línea"
                      title="Quitar línea"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4.5 7h15" />
                        <path d="M9 7V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8V7" />
                        <path d="M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L18.5 7" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <button type="button" className="li-add-btn" onClick={addRow}>
        + Agregar línea
      </button>
    </div>
  );
}
