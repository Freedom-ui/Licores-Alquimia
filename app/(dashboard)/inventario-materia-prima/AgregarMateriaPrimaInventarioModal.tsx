"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoNumero, ErrorCampo } from "@/app/components/data-table/FormFields";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import type { MateriaPrimaRow } from "../materia-prima/data";
import { useStore, type NuevaMateriaPrimaInventarioInput } from "../store";
import { validarAltaInventario } from "../_dominio/reglas";

type FormState = { materiaPrimaId: string; existenciaInicial: string; costoUnitario: string };

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
  onSubmit: (v: NuevaMateriaPrimaInventarioInput) => Promise<void>;
}) {
  const estado = useStore();
  const [values, setValues] = useState<FormState>({ materiaPrimaId: "", existenciaInicial: "", costoUnitario: "" });
  const [submitting, setSubmitting] = useState(false);
  // Rastrea si el formulario ya se cargó para esta apertura del modal, para
  // poder resetearlo durante el render cuando `open` pasa a true de nuevo.
  const [loadedOpen, setLoadedOpen] = useState(false);
  const f = useErroresFormulario("mpnew", (v: FormState) => {
    const r = validarAltaInventario(v, estado);
    return r.ok ? {} : r.errores;
  });

  if (open !== loadedOpen) {
    setLoadedOpen(open);
    if (open) {
      setValues({ materiaPrimaId: opciones[0] ? String(opciones[0].id) : "", existenciaInicial: "", costoUnitario: "" });
      f.limpiar();
    }
  }

  const unidad = opciones.find((m) => String(m.id) === values.materiaPrimaId)?.unidad;

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
    if (!f.alGuardar(values)) return;
    const r = validarAltaInventario(values, estado);
    if (!r.ok) return;

    setSubmitting(true);
    try {
      await onSubmit(r.valor);
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudo agregar la materia prima.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell open={open} eyebrow="Inventario de materia prima" title="Agregar materia prima al inventario" width={440} onClose={close}>
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field rf-field-full">
            <label htmlFor="mpnew-materiaPrimaId">
              Materia prima<span className="rf-required">*</span>
            </label>
            <select {...campo("materiaPrimaId")} value={values.materiaPrimaId} onChange={(e) => update("materiaPrimaId", e.target.value)}>
              {opciones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.unidad})
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="materiaPrimaId" />
          </div>
          <div className="rf-field">
            <label htmlFor="mpnew-existenciaInicial">
              Existencia inicial<span className="rf-required">*</span>
            </label>
            <CampoNumero
              {...campo("existenciaInicial")}
              decimales={unidad !== "Unidades"}
              placeholder="Ej: 0"
              valor={values.existenciaInicial}
              onCambio={(v) => update("existenciaInicial", v)}
            />
            <ErrorCampo f={f} campo="existenciaInicial" />
          </div>
          <div className="rf-field">
            <label
              htmlFor="mpnew-costoUnitario"
              title="Costo de la existencia inicial. Las compras cargadas después lo van promediando."
            >
              Costo unit. inicial<span className="rf-required">*</span>
            </label>
            <CampoNumero
              {...campo("costoUnitario")}
              placeholder="Ej: 850"
              valor={values.costoUnitario}
              onCambio={(v) => update("costoUnitario", v)}
            />
            <ErrorCampo f={f} campo="costoUnitario" />
          </div>
        </div>

        {f.general && <div className="rf-error">{f.general}</div>}

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
