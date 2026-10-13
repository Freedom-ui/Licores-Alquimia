"use client";

import { useState, type FormEvent } from "react";
import type { RecordFormModalProps } from "./types";
import { getEditableFields, getFormGridColumns, getFormModalWidth } from "./format";
import FormFields from "./FormFields";
import ModalShell from "./ModalShell";
import { useErroresFormulario } from "./useErroresFormulario";

export default function RecordFormModal<T extends Record<string, unknown>>({
  title,
  columns,
  triggerLabel,
  validar,
  onSubmit,
}: RecordFormModalProps<T>) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const f = useErroresFormulario("rf-nuevo", (v: Record<string, string>) => {
    const r = validar(v);
    return r.ok ? {} : r.errores;
  });

  const fields = getEditableFields(columns);
  const modalWidth = getFormModalWidth(getFormGridColumns(fields.length));

  function openModal() {
    setValues({});
    f.limpiar();
    setOpen(true);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
  }

  function change(key: string, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    f.alEscribir(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.alGuardar(values)) return;
    const r = validar(values);
    if (!r.ok) return;

    setSubmitting(true);
    try {
      await onSubmit(r.valor);
      setOpen(false);
    } catch (err) {
      f.deServidor(err, "No se pudo guardar el registro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="rf-trigger-btn" onClick={openModal}>
        {triggerLabel ?? "+ Nuevo"}
      </button>

      <ModalShell open={open} eyebrow={title} title="Nuevo registro" width={modalWidth} onClose={close}>
        <form className="rf-form" onSubmit={handleSubmit} noValidate>
          <FormFields columns={columns} values={values} onChange={change} f={f} />

          {f.general && <div className="rf-error">{f.general}</div>}

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
