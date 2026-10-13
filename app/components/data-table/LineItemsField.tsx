"use client";

import { formatCellValue } from "./format";
import { CampoNumero } from "./FormFields";
import type { ErroresFormulario } from "./useErroresFormulario";
import type { LineColumn } from "./types";

/**
 * Sub-tabla editable de "líneas" dentro de un formulario (ej. los insumos de
 * una orden de producción). Reusable: cualquier sección con un patrón
 * maestro-detalle (cabecera + líneas) puede usar esto para las líneas.
 *
 * Los valores numéricos se guardan como texto (tal como se escriben, así una
 * celda vacía queda vacía y no vuelve a mostrar "0"); se convierten al validar.
 * Con `f` + `campo`, cada celda es el campo "<campo>.<n° de línea>.<columna>"
 * del formulario: borde rojo si tiene error y la lista de errores debajo.
 */
export default function LineItemsField<L extends Record<string, unknown>>({
  label,
  columns,
  rows,
  onChange,
  emptyRow,
  f,
  campo,
  valoresParaValidar,
}: {
  label: string;
  columns: LineColumn<L>[];
  rows: L[];
  onChange: (rows: L[]) => void;
  /** Fábrica de una línea nueva en blanco (con los valores por defecto que corresponda). */
  emptyRow: () => L;
  f?: ErroresFormulario;
  campo?: string;
  /** Valores completos del formulario, para validar una celda al salir de ella. */
  valoresParaValidar?: () => unknown;
}) {
  function updateRow(index: number, key: string, value: string) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...rows, emptyRow()]);
  }

  const nombre = (i: number, key: string) => `${campo}.${i}.${key}`;
  const propsCelda = (i: number, key: string) =>
    f && campo
      ? {
          ...f.props(nombre(i, key)),
          "aria-label": `${columns.find((c) => c.key === key)?.label ?? key}, línea ${i + 1}`,
          onBlur: () => valoresParaValidar && f.alSalir(nombre(i, key), valoresParaValidar()),
        }
      : {};

  const erroresDeLineas =
    f && campo
      ? rows.flatMap((_, i) =>
          columns
            .map((c) => ({ c, error: f.error(nombre(i, c.key)) }))
            .filter((x) => x.error)
            .map(({ c, error }) => ({ id: nombre(i, c.key), texto: `Línea ${i + 1} · ${c.label}: ${error}` }))
        )
      : [];

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
                    const texto = value === null || value === undefined ? "" : String(value);
                    if (c.readOnly) {
                      return (
                        <td key={c.key} className="li-readonly">
                          {formatCellValue(value, c.type === "currency" ? "currency" : "text")}
                        </td>
                      );
                    }
                    if (c.type === "select") {
                      const opciones = c.optionsFor
                        ? c.optionsFor(row, i)
                        : (c.options ?? []).map((opt) => ({ value: opt, label: opt }));
                      return (
                        <td key={c.key}>
                          <select {...propsCelda(i, c.key)} value={texto} onChange={(e) => updateRow(i, c.key, e.target.value)}>
                            <option value="">{c.placeholder ?? "Seleccionar…"}</option>
                            {opciones.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }
                    if (c.type === "number" || c.type === "currency") {
                      return (
                        <td key={c.key}>
                          <CampoNumero
                            {...propsCelda(i, c.key)}
                            placeholder={c.placeholder}
                            valor={texto}
                            onCambio={(v) => updateRow(i, c.key, v)}
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={c.key}>
                        <input
                          {...propsCelda(i, c.key)}
                          type="text"
                          placeholder={c.placeholder}
                          value={texto}
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

      {erroresDeLineas.length > 0 && f && (
        <ul className="li-errores">
          {erroresDeLineas.map((x) => (
            <li key={x.id} id={`${f.idDe(x.id)}-error`} className="rf-field-error">
              {x.texto}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="li-add-btn" onClick={addRow}>
        + Agregar línea
      </button>
    </div>
  );
}
