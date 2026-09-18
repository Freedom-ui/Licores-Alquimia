"use client";

import { useState, type FormEvent } from "react";
import type { RecordFormModalProps } from "./types";
import { findMissingRequiredField, getEditableFields, parseFormValues } from "./format";
import FormFields from "./FormFields";
import ModalShell from "./ModalShell";

export default function RecordFormModal<T extends Record<string, unknown>>({
  title,
  columns,
  triggerLabel,
  onSubmit,
}: RecordFormModalProps<T>) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = getEditableFields(columns);

  function openModal() {
    setValues({});
    setError(null);
    setOpen(true);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
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
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el registro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="rf-trigger-btn" onClick={openModal}>
        {triggerLabel ?? "+ Nuevo"}
      </button>

      <ModalShell open={open} title={`Nuevo registro — ${title}`} onClose={close}>
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
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </ModalShell>
    </>
  );
}
