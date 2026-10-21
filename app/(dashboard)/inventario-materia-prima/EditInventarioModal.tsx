"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoNumero, ErrorCampo } from "@/app/components/data-table/FormFields";
import { numeroATexto } from "@/app/components/data-table/validacion";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import { useStore, type InventarioMateriaPrimaHeaderInput } from "../store";
import { validarEncabezadoInventario } from "../_dominio/reglas";
import type { InventarioMateriaPrimaRow } from "./data";

type FormState = { existenciaInicial: string; costoUnitario: string };

export default function EditInventarioModal({
  row,
  nombre,
  onClose,
  onSubmit,
}: {
  row: InventarioMateriaPrimaRow | null;
  nombre: string;
  onClose: () => void;
  onSubmit: (rowId: number, values: InventarioMateriaPrimaHeaderInput) => Promise<void>;
}) {
  const estado = useStore();
  const [values, setValues] = useState<FormState>({ existenciaInicial: "", costoUnitario: "" });
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué fila están cargados los valores actuales, para poder
  // resetear el formulario durante el render cuando `row` cambia.
  const [loadedRowId, setLoadedRowId] = useState<number | null>(null);
  const f = useErroresFormulario("mpedit", (v: FormState) => {
    if (!row) return {};
    const r = validarEncabezadoInventario(v, row, estado);
    return r.ok ? {} : r.errores;
  });

  const currentId = row?.id ?? null;
  if (currentId !== loadedRowId) {
    setLoadedRowId(currentId);
    setValues({
      existenciaInicial: row ? numeroATexto(row.existenciaInicial) : "",
      costoUnitario: row ? numeroATexto(row.costoUnitario) : "",
    });
    f.limpiar();
  }

  const porUnidad = estado.materiaPrima.find((m) => m.id === row?.materiaPrimaId)?.unidad === "Unidades";

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
    if (!row || !f.alGuardar(values)) return;
    const r = validarEncabezadoInventario(values, row, estado);
    if (!r.ok) return;

    setSubmitting(true);
    try {
      await onSubmit(row.id, r.valor);
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudieron guardar los cambios.");
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
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field">
            <label htmlFor="mpedit-existenciaInicial">
              Existencia inicial<span className="rf-required">*</span>
            </label>
            <CampoNumero
              {...campo("existenciaInicial")}
              decimales={!porUnidad}
              valor={values.existenciaInicial}
              onCambio={(v) => update("existenciaInicial", v)}
            />
            <ErrorCampo f={f} campo="existenciaInicial" />
          </div>
          <div className="rf-field">
            <label
              htmlFor="mpedit-costoUnitario"
              title="Costo de la existencia inicial. Las compras cargadas después lo van promediando."
            >
              Costo unit. inicial<span className="rf-required">*</span>
            </label>
            <CampoNumero {...campo("costoUnitario")} valor={values.costoUnitario} onCambio={(v) => update("costoUnitario", v)} />
            <ErrorCampo f={f} campo="costoUnitario" />
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
