"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { EditRecordModalProps } from "./types";
import { getEditableFields, getFormGridColumns, getFormModalWidth, rowToFormValues } from "./format";
import FormFields from "./FormFields";
import ModalShell from "./ModalShell";
import { useErroresFormulario } from "./useErroresFormulario";

export default function EditRecordModal<T extends Record<string, unknown>>({
  title,
  columns,
  row,
  onClose,
  validar,
  onSubmit,
}: EditRecordModalProps<T>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const f = useErroresFormulario("rf-editar", (v: Record<string, string>) => {
    const r = validar(v);
    return r.ok ? {} : r.errores;
  });
  // Rastrea de qué fila son los `values` actuales, para poder recargarlos
  // durante el render cuando `row` cambia (sin pasar por un efecto).
  const [loadedRow, setLoadedRow] = useState<T | null>(null);

  const fields = useMemo(() => getEditableFields(columns), [columns]);
  const modalWidth = getFormModalWidth(getFormGridColumns(fields.length));

  if (row !== loadedRow) {
    setLoadedRow(row);
    setValues(row ? rowToFormValues(fields, row) : {});
    f.limpiar();
  }

  function close() {
    if (submitting) return;
    onClose();
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
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudieron guardar los cambios.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={row !== null} eyebrow={title} title="Editar registro" width={modalWidth} onClose={close}>
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <FormFields columns={columns} values={values} onChange={change} f={f} />

        {f.general && <div className="rf-error">{f.general}</div>}

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
