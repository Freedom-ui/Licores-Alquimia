"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import type { LoteHeaderInput } from "../store";
import type { LoteTerminado } from "./data";

export default function EditLoteModal({
  lote,
  onClose,
  onSubmit,
}: {
  lote: LoteTerminado | null;
  onClose: () => void;
  onSubmit: (loteId: number, values: LoteHeaderInput) => void;
}) {
  const [existenciaInicial, setExistenciaInicial] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué lote están cargados los valores actuales, para poder
  // resetear el formulario durante el render cuando `lote` cambia.
  const [loadedLoteId, setLoadedLoteId] = useState<number | null>(null);

  const currentId = lote?.id ?? null;
  if (currentId !== loadedLoteId) {
    setLoadedLoteId(currentId);
    setExistenciaInicial(lote ? String(lote.existenciaInicial) : "");
    setCostoUnitario(lote ? String(lote.costoUnitario) : "");
    setFechaVencimiento(lote?.fechaVencimiento ?? "");
    setError(null);
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lote) return;

    const existencia = Number(existenciaInicial);
    const costo = Number(costoUnitario);
    if (!existenciaInicial || existencia < 0) {
      setError('Completá "Existencia inicial" con un valor válido.');
      return;
    }
    if (!costoUnitario || costo < 0) {
      setError('Completá "Costo unitario" con un valor válido.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      onSubmit(lote.id, {
        existenciaInicial: existencia,
        costoUnitario: costo,
        fechaVencimiento: fechaVencimiento || null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open={lote !== null}
      eyebrow="Productos terminados"
      title={lote ? `Editar lote ${lote.lote}` : ""}
      width={440}
      onClose={close}
    >
      <form className="rf-form" onSubmit={handleSubmit}>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field">
            <label htmlFor="lote-existencia">
              Existencia inicial<span className="rf-required">*</span>
            </label>
            <input
              id="lote-existencia"
              type="number"
              min="0"
              value={existenciaInicial}
              onChange={(e) => setExistenciaInicial(e.target.value)}
            />
          </div>
          <div className="rf-field">
            <label htmlFor="lote-costo">
              Costo unitario<span className="rf-required">*</span>
            </label>
            <input
              id="lote-costo"
              type="number"
              min="0"
              step="0.01"
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(e.target.value)}
            />
          </div>
          <div className="rf-field rf-field-full">
            <label htmlFor="lote-vencimiento">Fecha de vencimiento</label>
            <input
              id="lote-vencimiento"
              type="date"
              placeholder="Si aplica"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
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
