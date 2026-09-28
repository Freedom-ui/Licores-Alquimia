"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import type { MateriaPrimaRow } from "../materia-prima/data";
import type { NuevaMateriaPrimaInventarioInput } from "../store";

export default function AgregarMateriaPrimaInventarioModal({
  open,
  opciones,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Materias primas del catálogo que todavía no tienen kardex en esta sección. */
  opciones: MateriaPrimaRow[];
  onClose: () => void;
  onSubmit: (v: NuevaMateriaPrimaInventarioInput) => void;
}) {
  const [materiaPrimaId, setMateriaPrimaId] = useState("");
  const [existenciaInicial, setExistenciaInicial] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Rastrea si el formulario ya se cargó para esta apertura del modal, para
  // poder resetearlo durante el render cuando `open` pasa a true de nuevo.
  const [loadedOpen, setLoadedOpen] = useState(false);

  if (open !== loadedOpen) {
    setLoadedOpen(open);
    if (open) {
      setMateriaPrimaId(opciones[0] ? String(opciones[0].id) : "");
      setExistenciaInicial("");
      setCostoUnitario("");
      setError(null);
    }
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!materiaPrimaId) {
      setError('Elegí una "Materia prima".');
      return;
    }
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
      onSubmit({ materiaPrimaId: Number(materiaPrimaId), existenciaInicial: existencia, costoUnitario: costo });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} eyebrow="Inventario de materia prima" title="Agregar materia prima al inventario" width={440} onClose={close}>
      <form className="rf-form" onSubmit={handleSubmit}>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field rf-field-full">
            <label htmlFor="mpnew-materia">
              Materia prima<span className="rf-required">*</span>
            </label>
            <select id="mpnew-materia" value={materiaPrimaId} onChange={(e) => setMateriaPrimaId(e.target.value)}>
              {opciones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.unidad})
                </option>
              ))}
            </select>
          </div>
          <div className="rf-field">
            <label htmlFor="mpnew-existencia">
              Existencia inicial<span className="rf-required">*</span>
            </label>
            <input
              id="mpnew-existencia"
              type="number"
              min="0"
              step="0.01"
              value={existenciaInicial}
              onChange={(e) => setExistenciaInicial(e.target.value)}
            />
          </div>
          <div className="rf-field">
            <label
              htmlFor="mpnew-costo"
              title="Costo de la existencia inicial. Las compras cargadas después lo van promediando."
            >
              Costo unit. inicial<span className="rf-required">*</span>
            </label>
            <input
              id="mpnew-costo"
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
            {submitting ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
