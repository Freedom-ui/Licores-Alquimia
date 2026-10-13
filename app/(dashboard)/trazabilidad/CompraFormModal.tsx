"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoNumero, ErrorCampo, CampoFecha } from "@/app/components/data-table/FormFields";
import { formatCellValue } from "@/app/components/data-table/format";
import { LARGO_CORTO, parsearNumero } from "@/app/components/data-table/validacion";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import type { ProveedorRow } from "../proveedores/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import {
  COMPROBANTE_FORMS,
  COMPROBANTE_TIPOS,
  MEDIOS_PAGO,
  unidadCorta,
  type CompraInput,
  type CompraRow,
  type MedioPago,
} from "./data";
import { useStore } from "../store";
import { validarCompra } from "../_dominio/reglas";

export type CompraFormTarget = CompraRow | "new" | null;

type FormState = {
  fecha: string;
  materiaPrimaId: string;
  cantidad: string;
  costoUnitario: string;
  cantidadCascara: string;
  lote: string;
  proveedorId: string;
  comprobanteForm: string;
  comprobanteTipo: string;
  comprobanteNumero: string;
  medioPago: MedioPago | "";
};

const EMPTY: FormState = {
  fecha: "",
  materiaPrimaId: "",
  cantidad: "",
  costoUnitario: "",
  cantidadCascara: "",
  lote: "",
  proveedorId: "",
  comprobanteForm: "",
  comprobanteTipo: "",
  comprobanteNumero: "",
  medioPago: "",
};

function toForm(c: CompraRow): FormState {
  return {
    fecha: c.fecha,
    materiaPrimaId: String(c.materiaPrimaId),
    cantidad: String(c.cantidad),
    costoUnitario: String(c.costoUnitario),
    cantidadCascara: c.cantidadCascara ? String(c.cantidadCascara) : "",
    lote: c.lote,
    proveedorId: String(c.proveedorId),
    comprobanteForm: c.comprobanteForm,
    comprobanteTipo: c.comprobanteTipo,
    comprobanteNumero: c.comprobanteNumero,
    medioPago: c.medioPago,
  };
}

/** Número de un input, o 0 si está vacío o mal escrito (solo para el total en pantalla). */
const num = (v: string) => {
  const n = parsearNumero(v);
  return n === null || Number.isNaN(n) ? 0 : n;
};

export default function CompraFormModal({
  target,
  proveedores,
  materiasPrimas,
  onClose,
  onSubmit,
}: {
  /** Compra a editar, "new" para alta, null = modal cerrado. */
  target: CompraFormTarget;
  proveedores: ProveedorRow[];
  materiasPrimas: MateriaPrimaRow[];
  onClose: () => void;
  /** Puede lanzar un Error con un mensaje para el usuario (se muestra en el modal). */
  onSubmit: (id: number | null, values: CompraInput) => Promise<void>;
}) {
  const estado = useStore();
  const [values, setValues] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [loadedTarget, setLoadedTarget] = useState<CompraFormTarget>(null);

  const compraId = target && target !== "new" ? target.id : null;
  const f = useErroresFormulario("compra", (v: FormState) => {
    const r = validarCompra(v, estado, compraId);
    return r.ok ? {} : r.errores;
  });

  if (target !== loadedTarget) {
    setLoadedTarget(target);
    setValues(target && target !== "new" ? toForm(target) : EMPTY);
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

  const materia = materiasPrimas.find((m) => String(m.id) === values.materiaPrimaId);
  const unidad = materia ? unidadCorta(materia.unidad) : "";
  const porKilo = materia?.unidad === "Kilogramos";
  const porUnidad = materia?.unidad === "Unidades";
  const total = num(values.cantidad) * num(values.costoUnitario);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.alGuardar(values)) return;
    const r = validarCompra(values, estado, compraId);
    if (!r.ok) return;

    setSubmitting(true);
    try {
      await onSubmit(compraId, r.valor);
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudo guardar la compra.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open={target !== null}
      eyebrow="Trazabilidad · Libro de compras"
      title={target && target !== "new" ? `Editar compra — OP N° ${target.id}` : "Nueva compra"}
      width={760}
      onClose={close}
    >
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="rf-field">
            <label htmlFor="compra-fecha">
              Fecha<span className="rf-required">*</span>
            </label>
            <CampoFecha {...campo("fecha")} valor={values.fecha} onCambio={(v) => update("fecha", v)} />
            <ErrorCampo f={f} campo="fecha" />
          </div>

          <div className="rf-field" style={{ gridColumn: "span 2" }}>
            <label htmlFor="compra-materiaPrimaId">
              Materia prima<span className="rf-required">*</span>
            </label>
            <select {...campo("materiaPrimaId")} value={values.materiaPrimaId} onChange={(e) => update("materiaPrimaId", e.target.value)}>
              <option value="">Seleccionar…</option>
              {materiasPrimas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({unidadCorta(m.unidad)})
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="materiaPrimaId" />
          </div>

          <div className="rf-field">
            <label htmlFor="compra-cantidad">
              Cantidad{unidad && ` (${unidad})`}
              <span className="rf-required">*</span>
            </label>
            <CampoNumero
              {...campo("cantidad")}
              decimales={!porUnidad}
              placeholder={porUnidad ? "Ej: 300" : "Ej: 25,5"}
              valor={values.cantidad}
              onCambio={(v) => update("cantidad", v)}
            />
            <ErrorCampo f={f} campo="cantidad" />
          </div>

          <div className="rf-field">
            <label htmlFor="compra-costoUnitario">
              Costo unitario<span className="rf-required">*</span>
            </label>
            <CampoNumero
              {...campo("costoUnitario")}
              placeholder="Ej: 850"
              valor={values.costoUnitario}
              onCambio={(v) => update("costoUnitario", v)}
            />
            <ErrorCampo f={f} campo="costoUnitario" />
          </div>

          <div className="rf-field">
            <label htmlFor="compra-lote">Lote producto</label>
            <input
              {...campo("lote")}
              type="text"
              placeholder="Lote del proveedor (si trae)"
              maxLength={LARGO_CORTO}
              value={values.lote}
              onChange={(e) => update("lote", e.target.value)}
            />
            <ErrorCampo f={f} campo="lote" />
          </div>

          {porKilo && (
            <div className="rf-field">
              <label htmlFor="compra-cantidadCascara">Cáscara (kg)</label>
              <CampoNumero
                {...campo("cantidadCascara")}
                placeholder="Solo cítricos"
                valor={values.cantidadCascara}
                onCambio={(v) => update("cantidadCascara", v)}
              />
              <ErrorCampo f={f} campo="cantidadCascara" />
            </div>
          )}

          <div className="rf-field rf-field-full rf-section-title">Proveedor</div>

          <div className="rf-field rf-field-full">
            <label htmlFor="compra-proveedorId">
              Nombre - Razón social<span className="rf-required">*</span>
            </label>
            <select {...campo("proveedorId")} value={values.proveedorId} onChange={(e) => update("proveedorId", e.target.value)}>
              <option value="">Seleccionar…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial}
                  {p.producto ? ` — ${p.producto}` : ""}
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="proveedorId" />
          </div>

          <div className="rf-field">
            <label htmlFor="compra-comprobanteForm">Form.</label>
            <select {...campo("comprobanteForm")} value={values.comprobanteForm} onChange={(e) => update("comprobanteForm", e.target.value)}>
              <option value="">Sin comprobante</option>
              {COMPROBANTE_FORMS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="comprobanteForm" />
          </div>

          <div className="rf-field">
            <label htmlFor="compra-comprobanteTipo">Tipo</label>
            <select {...campo("comprobanteTipo")} value={values.comprobanteTipo} onChange={(e) => update("comprobanteTipo", e.target.value)}>
              <option value="">—</option>
              {COMPROBANTE_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="comprobanteTipo" />
          </div>

          <div className="rf-field">
            <label htmlFor="compra-comprobanteNumero">N°</label>
            <input
              {...campo("comprobanteNumero")}
              type="text"
              placeholder="0001 - 00021952"
              maxLength={20}
              value={values.comprobanteNumero}
              onChange={(e) => update("comprobanteNumero", e.target.value)}
            />
            <ErrorCampo f={f} campo="comprobanteNumero" />
          </div>

          <div className="rf-field rf-field-full">
            <label id="compra-medioPago-label">
              Medio de pago<span className="rf-required">*</span>
            </label>
            <div
              {...f.props("medioPago")}
              tabIndex={-1}
              className={`tz-pago-options${f.error("medioPago") ? " rf-input-error" : ""}`}
              role="radiogroup"
              aria-labelledby="compra-medioPago-label"
            >
              {MEDIOS_PAGO.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={values.medioPago === m.value}
                  className={`tz-pago-option ${values.medioPago === m.value ? "active" : ""}`}
                  onClick={() => update("medioPago", m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <ErrorCampo f={f} campo="medioPago" />
          </div>
        </div>

        <div className="li-total-row">
          <span className="li-total-label">Total de la operación</span>
          <span className="li-total-value">{formatCellValue(total, "currency")}</span>
        </div>

        <p className="rf-hint">
          Al guardar, la compra entra sola al Inventario de materia prima. Si una factura trae varios
          productos, cargá una operación por cada uno con el mismo comprobante.
        </p>

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
