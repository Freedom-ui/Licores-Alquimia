"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoNumero, ErrorCampo, CampoFecha } from "@/app/components/data-table/FormFields";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import { fmtNumero } from "@/app/components/data-table/validacion";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import type { LoteTerminado } from "./data";
import { useStore } from "../store";
import { validarMovimientoLote } from "../_dominio/reglas";
import { saldoLote } from "../_dominio/sync";

type FormState = { tipo: "entrada" | "salida"; fecha: string; cantidad: string; puEntrada: string };

const EMPTY: FormState = { tipo: "salida", fecha: "", cantidad: "", puEntrada: "" };

export default function AgregarMovimientoModal({
  lote,
  onClose,
  onSubmit,
}: {
  /** Lote al que se le agrega el movimiento; el modal está abierto mientras no sea null. */
  lote: LoteTerminado | null;
  onClose: () => void;
  onSubmit: (loteId: number, movimiento: Omit<KardexMovimiento, "id">) => Promise<void>;
}) {
  const estado = useStore();
  const [values, setValues] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué lote están cargados los valores actuales, para poder
  // resetear el formulario durante el render cuando `lote` cambia.
  const [loadedLoteId, setLoadedLoteId] = useState<number | null>(null);
  const f = useErroresFormulario("mov", (v: FormState) => {
    if (!lote) return {};
    const r = validarMovimientoLote(v, lote, estado);
    return r.ok ? {} : r.errores;
  });

  const currentId = lote?.id ?? null;
  if (currentId !== loadedLoteId) {
    setLoadedLoteId(currentId);
    setValues(EMPTY);
    f.limpiar();
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    f.alEscribir(next);
  }

  function campo(key: keyof FormState) {
    return { ...f.props(key), onBlur: () => f.alSalir(key, values) };
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lote || !f.alGuardar(values)) return;
    const r = validarMovimientoLote(values, lote, estado);
    if (!r.ok) return;

    setSubmitting(true);
    try {
      await onSubmit(lote.id, r.valor);
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudo guardar el movimiento.");
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
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field">
            <label htmlFor="mov-tipo">Tipo</label>
            <select {...campo("tipo")} value={values.tipo} onChange={(e) => update("tipo", e.target.value as FormState["tipo"])}>
              <option value="salida">Salida (venta)</option>
              <option value="entrada">Entrada (embotellado)</option>
            </select>
            <ErrorCampo f={f} campo="tipo" />
          </div>
          <div className="rf-field">
            <label htmlFor="mov-fecha">
              Fecha<span className="rf-required">*</span>
            </label>
            <CampoFecha {...campo("fecha")} valor={values.fecha} onCambio={(v) => update("fecha", v)} />
            <ErrorCampo f={f} campo="fecha" />
          </div>
          <div className="rf-field">
            <label htmlFor="mov-cantidad">
              Cantidad (botellas)<span className="rf-required">*</span>
            </label>
            <CampoNumero
              {...campo("cantidad")}
              decimales={false}
              placeholder="Ej: 12"
              valor={values.cantidad}
              onCambio={(v) => update("cantidad", v)}
            />
            <ErrorCampo f={f} campo="cantidad" />
          </div>
          {values.tipo === "entrada" && (
            <div className="rf-field">
              <label htmlFor="mov-puEntrada">Costo unitario</label>
              <CampoNumero
                {...campo("puEntrada")}
                placeholder="Opcional"
                valor={values.puEntrada}
                onCambio={(v) => update("puEntrada", v)}
              />
              <ErrorCampo f={f} campo="puEntrada" />
            </div>
          )}
        </div>

        {lote && values.tipo === "salida" && (
          <p className="rf-hint">Saldo del lote: {fmtNumero(saldoLote(lote))} botellas. Una salida no puede superarlo.</p>
        )}

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
  );
}
