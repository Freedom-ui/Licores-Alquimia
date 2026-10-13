"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoNumero, ErrorCampo, CampoFecha } from "@/app/components/data-table/FormFields";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import type { InventarioMateriaPrimaRow } from "./data";
import { useStore } from "../store";
import { validarMovimientoInventario } from "../_dominio/reglas";

type FormState = { tipo: "entrada" | "salida"; fecha: string; cantidad: string; puEntrada: string; cantidadSecundaria: string };

const EMPTY: FormState = { tipo: "salida", fecha: "", cantidad: "", puEntrada: "", cantidadSecundaria: "" };

export default function AgregarMovimientoInventarioModal({
  row,
  nombre,
  unidad,
  saldoActual,
  onClose,
  onSubmit,
}: {
  /** Fila a la que se le agrega el movimiento; el modal está abierto mientras no sea null. */
  row: InventarioMateriaPrimaRow | null;
  nombre: string;
  /** Unidad de medida del catálogo: si es "Unidades" solo se admiten cantidades enteras. */
  unidad: string;
  /** Saldo vigente: un consumo no puede superarlo. */
  saldoActual: number;
  onClose: () => void;
  onSubmit: (rowId: number, movimiento: Omit<KardexMovimiento, "id">) => Promise<void>;
}) {
  const estado = useStore();
  const [values, setValues] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué fila están cargados los valores actuales, para poder
  // resetear el formulario durante el render cuando `row` cambia.
  const [loadedRowId, setLoadedRowId] = useState<number | null>(null);
  const f = useErroresFormulario("mpmov", (v: FormState) => {
    if (!row) return {};
    const r = validarMovimientoInventario(v, row, estado);
    return r.ok ? {} : r.errores;
  });

  const currentId = row?.id ?? null;
  if (currentId !== loadedRowId) {
    setLoadedRowId(currentId);
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

  const porUnidad = unidad === "Unidades";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!row || !f.alGuardar(values)) return;
    const r = validarMovimientoInventario(values, row, estado);
    if (!r.ok) return;

    setSubmitting(true);
    try {
      await onSubmit(row.id, r.valor);
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudo guardar el movimiento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open={row !== null}
      eyebrow="Inventario de materia prima"
      title={row ? `Agregar movimiento — ${nombre}` : ""}
      width={440}
      onClose={close}
    >
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field">
            <label htmlFor="mpmov-tipo">Tipo</label>
            <select {...campo("tipo")} value={values.tipo} onChange={(e) => update("tipo", e.target.value as FormState["tipo"])}>
              <option value="salida">Consumo / merma</option>
              <option value="entrada">Ingreso / ajuste</option>
            </select>
            <ErrorCampo f={f} campo="tipo" />
          </div>
          <div className="rf-field">
            <label htmlFor="mpmov-fecha">
              Fecha<span className="rf-required">*</span>
            </label>
            <CampoFecha {...campo("fecha")} valor={values.fecha} onCambio={(v) => update("fecha", v)} />
            <ErrorCampo f={f} campo="fecha" />
          </div>
          <div className="rf-field">
            <label htmlFor="mpmov-cantidad">
              Cantidad<span className="rf-required">*</span>
            </label>
            <CampoNumero
              {...campo("cantidad")}
              decimales={!porUnidad}
              placeholder={porUnidad ? "Ej: 12" : "Ej: 2,5"}
              valor={values.cantidad}
              onCambio={(v) => update("cantidad", v)}
            />
            <ErrorCampo f={f} campo="cantidad" />
          </div>
          {values.tipo === "entrada" && (
            <>
              <div className="rf-field">
                <label htmlFor="mpmov-puEntrada">Costo unitario</label>
                <CampoNumero
                  {...campo("puEntrada")}
                  placeholder="Opcional"
                  valor={values.puEntrada}
                  onCambio={(v) => update("puEntrada", v)}
                />
                <ErrorCampo f={f} campo="puEntrada" />
              </div>
              <div className="rf-field rf-field-full">
                <label htmlFor="mpmov-cantidadSecundaria">Cantidad de cáscara (si aplica)</label>
                <CampoNumero
                  {...campo("cantidadSecundaria")}
                  placeholder="Opcional — solo para insumos que la generan (ej. cítricos)"
                  valor={values.cantidadSecundaria}
                  onCambio={(v) => update("cantidadSecundaria", v)}
                />
                <ErrorCampo f={f} campo="cantidadSecundaria" />
              </div>
            </>
          )}
        </div>

        {values.tipo === "entrada" ? (
          <p className="rf-hint">
            Las compras a proveedores se cargan en Trazabilidad (Libro de compras): ahí queda registrado
            el proveedor y el lote, y el ingreso aparece acá solo. Usá esto solo para ajustes.
          </p>
        ) : (
          <p className="rf-hint">
            Saldo actual: {saldoActual.toLocaleString("es-AR")}. Un consumo no puede superarlo: si falta
            stock, cargá antes la compra en Trazabilidad.
          </p>
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
