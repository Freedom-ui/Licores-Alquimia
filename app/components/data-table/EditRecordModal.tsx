"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { EditRecordModalProps } from "./types";
import { findMissingRequiredField, getEditableFields, parseFormValues, rowToFormValues } from "./format";
import FormFields from "./FormFields";
import ModalShell from "./ModalShell";

export default function EditRecordModal<T extends Record<string, unknown>>({
  title,
  columns,
  row,
  onClose,
  onSubmit,
}: EditRecordModalProps<T>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rastrea de qué fila son los `values` actuales, para poder recargarlos
  // durante el render cuando `row` cambia (sin pasar por un efecto).
  const [loadedRow, setLoadedRow] = useState<T | null>(null);

  const fields = useMemo(() => getEditableFields(columns), [columns]);

  if (row !== loadedRow) {
    setLoadedRow(row);
    setValues(row ? rowToFormValues(fields, row) : {});
    setError(null);
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const missing = findMissingRequiredField(fields, values);
    if (missing) {
      setError(`Completá "${missing.label}".`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(parseFormValues(fields, values));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={row !== null} title={`Editar registro — ${title}`} onClose={close}>
      <form className="rf-form" onSubmit={handleSubmit}>
        <FormFields
          columns={columns}
          values={values}
          onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        />

        {error && <div className="rf-error">{error}</div>}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={close} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="rf-submit-btn" disabled={submitting}>
            {submitting ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
