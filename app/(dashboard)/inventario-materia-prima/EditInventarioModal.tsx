"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import type { InventarioMateriaPrimaHeaderInput } from "../store";
import type { InventarioMateriaPrimaRow } from "./data";

export default function EditInventarioModal({
  row,
  nombre,
  onClose,
  onSubmit,
}: {
  row: InventarioMateriaPrimaRow | null;
  nombre: string;
  onClose: () => void;
  onSubmit: (rowId: number, values: InventarioMateriaPrimaHeaderInput) => void;
}) {
  const [existenciaInicial, setExistenciaInicial] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué fila están cargados los valores actuales, para poder
  // resetear el formulario durante el render cuando `row` cambia.
  const [loadedRowId, setLoadedRowId] = useState<number | null>(null);

  const currentId = row?.id ?? null;
  if (currentId !== loadedRowId) {
    setLoadedRowId(currentId);
    setExistenciaInicial(row ? String(row.existenciaInicial) : "");
    setCostoUnitario(row ? String(row.costoUnitario) : "");
    setError(null);
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!row) return;

    const existencia = Number(existenciaInicial);
    if (existenciaInicial === "" || existencia < 0) {
      setError('Completá "Existencia inicial" con un valor válido.');
      return;
    }
    const costo = Number(costoUnitario);
    if (!costoUnitario || costo < 0) {
      setError('Completá "Costo unitario" con un valor válido.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      onSubmit(row.id, { existenciaInicial: existencia, costoUnitario: costo });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open={row !== null}
      eyebrow="Inventario de materia prima"
      title={row ? `Editar — ${nombre}` : ""}
      width={440}
      onClose={close}
    >
      <form className="rf-form" onSubmit={handleSubmit}>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field">
            <label htmlFor="mpedit-existencia">
              Existencia inicial<span className="rf-required">*</span>
            </label>
            <input
              id="mpedit-existencia"
              type="number"
              min="0"
              step="0.01"
              value={existenciaInicial}
              onChange={(e) => setExistenciaInicial(e.target.value)}
            />
          </div>
          <div className="rf-field">
            <label
              htmlFor="mpedit-costo"
              title="Costo de la existencia inicial. Las compras cargadas después lo van promediando."
            >
              Costo unit. inicial<span className="rf-required">*</span>
            </label>
            <input
              id="mpedit-costo"
              type="number"
              min="0"
              step="0.01"
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(e.target.value)}
            />
          </div>
        </div>

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
