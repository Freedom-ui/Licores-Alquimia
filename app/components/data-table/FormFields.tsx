"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";
import type { Column } from "./types";
import { getEditableFields, getFormGridColumns, resolveFormInput } from "./format";
import { enmascararFecha, fechaATexto, filtrarNumero, FECHA_MINIMA, hoyLocal, textoAFecha } from "./validacion";
import type { ErroresFormulario } from "./useErroresFormulario";

/** Mensaje en rojo debajo de un campo (si tiene error). */
export function ErrorCampo({ f, campo }: { f: ErroresFormulario; campo: string }) {
  const error = f.error(campo);
  if (!error) return null;
  return (
    <span id={`${f.idDe(campo)}-error`} className="rf-field-error">
      {error}
    </span>
  );
}

/**
 * Input numérico que no deja escribir letras ni signos: solo dígitos y, si
 * se admiten decimales, una coma o punto. Es de texto (no type="number"):
 * Firefox deja escribir letras en type="number" y la rueda del mouse o las
 * flechitas cambian el valor sin querer.
 */
export function CampoNumero({
  valor,
  onCambio,
  decimales = true,
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  valor: string;
  onCambio: (valor: string) => void;
  decimales?: boolean;
}) {
  return (
    <input
      maxLength={12}
      autoComplete="off"
      {...resto}
      type="text"
      inputMode={decimales ? "decimal" : "numeric"}
      value={valor}
      onChange={(e) => onCambio(filtrarNumero(e.target.value, decimales))}
    />
  );
}

/**
 * Fecha que siempre se ve y se escribe como dd/mm/aaaa, sin importar el idioma
 * del navegador (el <input type="date"> nativo muestra mm/dd/yyyy en un
 * navegador en inglés). Se escribe con números (las barras se ponen solas) o
 * se elige en el calendario del botón.
 *
 * `valor` / `onCambio` usan "YYYY-MM-DD" cuando la fecha está completa y
 * existe; si quedó a medio escribir o no existe (31/02) pasan el texto tal
 * cual, para que la validación lo marque como inválido.
 */
export function CampoFecha({
  valor,
  onCambio,
  max = hoyLocal(),
  className,
  onBlur,
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> & {
  valor: string;
  onCambio: (valor: string) => void;
  /** Fecha más alta del calendario. Default: hoy; null = sin tope. */
  max?: string | null;
}) {
  const calendario = useRef<HTMLInputElement>(null);
  // Lo que se está escribiendo, mientras no sea una fecha completa que el
  // padre guarde (ej. un filtro que solo acepta fechas válidas).
  const [borrador, setBorrador] = useState<string | null>(null);
  const texto = borrador ?? fechaATexto(valor);

  function abrirCalendario() {
    const el = calendario.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  return (
    <div className="campo-fecha">
      <input
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        {...resto}
        className={className}
        type="text"
        inputMode="numeric"
        maxLength={10}
        value={texto}
        onChange={(e) => {
          const t = enmascararFecha(e.target.value);
          setBorrador(t);
          onCambio(textoAFecha(t));
        }}
        onBlur={(e) => {
          setBorrador(null);
          onBlur?.(e);
        }}
      />
      <button
        type="button"
        className="campo-fecha-btn"
        onClick={abrirCalendario}
        aria-label="Elegir en el calendario"
        title="Elegir en el calendario"
        disabled={resto.disabled}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
        </svg>
      </button>
      {/* Solo para abrir el calendario del navegador; el valor se escribe en el campo de arriba. */}
      <input
        ref={calendario}
        type="date"
        className="campo-fecha-picker"
        tabIndex={-1}
        aria-hidden="true"
        min={FECHA_MINIMA}
        max={max ?? undefined}
        value={/^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : ""}
        onChange={(e) => {
          if (!e.target.value) return;
          setBorrador(null);
          onCambio(e.target.value);
        }}
      />
    </div>
  );
}

export default function FormFields<T>({
  columns,
  values,
  onChange,
  f,
}: {
  columns: Column<T>[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** Errores por campo del formulario (ver useErroresFormulario). */
  f: ErroresFormulario;
}) {
  const fields = getEditableFields(columns);
  const gridColumns = getFormGridColumns(fields.length);

  return (
    <div className="rf-fields-grid" style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}>
      {fields.map((col) => {
        const input = resolveFormInput(col);
        const campo = col.key;
        const props = { ...f.props(campo), onBlur: () => f.alSalir(campo, values) };
        return (
          <div className={`rf-field ${input === "textarea" ? "rf-field-full" : ""}`} key={campo}>
            <label htmlFor={props.id}>
              {col.title ?? col.label}
              {col.form?.required && <span className="rf-required">*</span>}
            </label>

            {input === "select" ? (
              <select {...props} value={values[campo] ?? ""} onChange={(e) => onChange(campo, e.target.value)}>
                <option value="">Seleccionar…</option>
                {col.form?.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : input === "textarea" ? (
              <textarea
                {...props}
                placeholder={col.form?.placeholder}
                maxLength={col.form?.maxLength}
                value={values[campo] ?? ""}
                onChange={(e) => onChange(campo, e.target.value)}
              />
            ) : input === "number" ? (
              <CampoNumero
                {...props}
                decimales={col.form?.decimales ?? true}
                placeholder={col.form?.placeholder}
                valor={values[campo] ?? ""}
                onCambio={(v) => onChange(campo, v)}
              />
            ) : input === "date" ? (
              <CampoFecha {...props} valor={values[campo] ?? ""} onCambio={(v) => onChange(campo, v)} />
            ) : (
              <input
                {...props}
                type={input}
                placeholder={col.form?.placeholder}
                maxLength={col.form?.maxLength}
                value={values[campo] ?? ""}
                onChange={(e) => onChange(campo, e.target.value)}
              />
            )}
            <ErrorCampo f={f} campo={campo} />
          </div>
        );
      })}
    </div>
  );
}
