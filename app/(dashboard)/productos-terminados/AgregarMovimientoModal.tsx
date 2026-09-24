"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import type { LoteTerminado } from "./data";

export default function AgregarMovimientoModal({
  lote,
  onClose,
  onSubmit,
}: {
  /** Lote al que se le agrega el movimiento; el modal está abierto mientras no sea null. */
  lote: LoteTerminado | null;
  onClose: () => void;
  onSubmit: (loteId: number, movimiento: Omit<KardexMovimiento, "id">) => void;
}) {
  const [tipo, setTipo] = useState<"entrada" | "salida">("salida");
  const [fecha, setFecha] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [puEntrada, setPuEntrada] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué lote están cargados los valores actuales, para poder
  // resetear el formulario durante el render cuando `lote` cambia.
  const [loadedLoteId, setLoadedLoteId] = useState<number | null>(null);

  const currentId = lote?.id ?? null;
  if (currentId !== loadedLoteId) {
    setLoadedLoteId(currentId);
    setTipo("salida");
    setFecha("");
    setCantidad("");
    setPuEntrada("");
    setError(null);
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lote) return;

    if (!fecha) {
      setError('Completá "Fecha".');
      return;
    }
    const cant = Number(cantidad);
    if (!cant || cant <= 0) {
      setError('Completá "Cantidad" con un valor mayor a 0.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      onSubmit(lote.id, {
        fecha,
        tipo,
        cantidad: cant,
        puEntrada: tipo === "entrada" && puEntrada ? Number(puEntrada) : undefined,
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
      title={lote ? `Agregar movimiento — Lote ${lote.lote}` : ""}
      width={440}
      onClose={close}
    >
      <form className="rf-form" onSubmit={handleSubmit}>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field">
            <label htmlFor="mov-tipo">Tipo</label>
            <select id="mov-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "entrada" | "salida")}>
              <option value="salida">Salida (venta)</option>
              <option value="entrada">Entrada (embotellado)</option>
            </select>
          </div>
          <div className="rf-field">
            <label htmlFor="mov-fecha">
              Fecha<span className="rf-required">*</span>
            </label>
            <input id="mov-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="rf-field">
            <label htmlFor="mov-cantidad">
              Cantidad<span className="rf-required">*</span>
            </label>
            <input
              id="mov-cantidad"
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </div>
          {tipo === "entrada" && (
            <div className="rf-field">
              <label htmlFor="mov-costo">Costo unitario</label>
              <input
                id="mov-costo"
                type="number"
                placeholder="Opcional"
                value={puEntrada}
                onChange={(e) => setPuEntrada(e.target.value)}
              />
            </div>
          )}
        </div>

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
  );
}
