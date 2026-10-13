"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoNumero, ErrorCampo, CampoFecha } from "@/app/components/data-table/FormFields";
import { fechaMaximaVencimiento } from "@/app/components/data-table/validacion";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import { useStore, type LoteHeaderInput } from "../store";
import { validarEncabezadoLote } from "../_dominio/reglas";
import type { LoteTerminado } from "./data";

type FormState = { existenciaInicial: string; costoUnitario: string; fechaVencimiento: string };

export default function EditLoteModal({
  lote,
  onClose,
  onSubmit,
}: {
  lote: LoteTerminado | null;
  onClose: () => void;
  onSubmit: (loteId: number, values: LoteHeaderInput) => Promise<void>;
}) {
  const estado = useStore();
  const [values, setValues] = useState<FormState>({ existenciaInicial: "", costoUnitario: "", fechaVencimiento: "" });
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué lote están cargados los valores actuales, para poder
  // resetear el formulario durante el render cuando `lote` cambia.
  const [loadedLoteId, setLoadedLoteId] = useState<number | null>(null);
  const f = useErroresFormulario("lote", (v: FormState) => {
    if (!lote) return {};
    const r = validarEncabezadoLote(v, lote, estado);
    return r.ok ? {} : r.errores;
  });

  const currentId = lote?.id ?? null;
  if (currentId !== loadedLoteId) {
    setLoadedLoteId(currentId);
    setValues({
      existenciaInicial: lote ? String(lote.existenciaInicial) : "",
      costoUnitario: lote ? String(lote.costoUnitario) : "",
      fechaVencimiento: lote?.fechaVencimiento ?? "",
    });
    f.limpiar();
  }

  function update(key: keyof FormState, value: string) {
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
    const r = validarEncabezadoLote(values, lote, estado);
    if (!r.ok) return;

    setSubmitting(true);
    try {
      await onSubmit(lote.id, r.valor);
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudieron guardar los cambios.");
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
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field">
            <label htmlFor="lote-existenciaInicial">
              Existencia inicial<span className="rf-required">*</span>
            </label>
            <CampoNumero
              {...campo("existenciaInicial")}
              decimales={false}
              valor={values.existenciaInicial}
              onCambio={(v) => update("existenciaInicial", v)}
            />
            <ErrorCampo f={f} campo="existenciaInicial" />
          </div>
          <div className="rf-field">
            <label htmlFor="lote-costoUnitario">
              Costo unitario<span className="rf-required">*</span>
            </label>
            <CampoNumero {...campo("costoUnitario")} valor={values.costoUnitario} onCambio={(v) => update("costoUnitario", v)} />
            <ErrorCampo f={f} campo="costoUnitario" />
          </div>
          <div className="rf-field rf-field-full">
            <label htmlFor="lote-fechaVencimiento">Fecha de vencimiento</label>
            <CampoFecha
              {...campo("fechaVencimiento")}
              max={fechaMaximaVencimiento()}
              valor={values.fechaVencimiento}
              onCambio={(v) => update("fechaVencimiento", v)}
            />
            <ErrorCampo f={f} campo="fechaVencimiento" />
          </div>
        </div>

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
