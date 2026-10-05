"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { formatCellValue } from "@/app/components/data-table/format";
import type { ProveedorRow } from "../proveedores/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import {
  COMPROBANTE_FORMS,
  COMPROBANTE_TIPOS,
  MEDIOS_PAGO,
  normalizarNumeroComprobante,
  unidadCorta,
  type CompraInput,
  type CompraRow,
  type MedioPago,
} from "./data";

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
  onSubmit: (id: number | null, values: CompraInput) => void;
}) {
  const [values, setValues] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loadedTarget, setLoadedTarget] = useState<CompraFormTarget>(null);

  if (target !== loadedTarget) {
    setLoadedTarget(target);
    setValues(target && target !== "new" ? toForm(target) : EMPTY);
    setError(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const materia = materiasPrimas.find((m) => String(m.id) === values.materiaPrimaId);
  const unidad = materia ? unidadCorta(materia.unidad) : "";
  const porKilo = materia?.unidad === "Kilogramos";
  const total = Number(values.cantidad || 0) * Number(values.costoUnitario || 0);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!values.fecha || !values.materiaPrimaId || !values.cantidad || !values.costoUnitario || !values.proveedorId || !values.medioPago) {
      setError("Completá todos los campos obligatorios.");
      return;
    }
    const cantidad = Number(values.cantidad);
    const costoUnitario = Number(values.costoUnitario);
    if (!(cantidad > 0) || !(costoUnitario > 0)) {
      setError("La cantidad y el costo unitario tienen que ser mayores a cero.");
      return;
    }

    let comprobanteNumero = "";
    if (values.comprobanteNumero.trim()) {
      const normalizado = normalizarNumeroComprobante(values.comprobanteNumero);
      if (!normalizado) {
        setError('El N° de comprobante tiene que tener el formato punto de venta - número, ej. "0001 - 00021952".');
        return;
      }
      comprobanteNumero = normalizado;
    }
    if (comprobanteNumero && (!values.comprobanteForm || !values.comprobanteTipo)) {
      setError("Si cargás el N° de comprobante, indicá también su forma (Factura, Remito…) y tipo (A, B, C…).");
      return;
    }

    try {
      onSubmit(target && target !== "new" ? target.id : null, {
        fecha: values.fecha,
        materiaPrimaId: Number(values.materiaPrimaId),
        cantidad,
        costoUnitario,
        cantidadCascara: porKilo && values.cantidadCascara ? Number(values.cantidadCascara) : undefined,
        lote: values.lote.trim(),
        proveedorId: Number(values.proveedorId),
        comprobanteForm: values.comprobanteForm,
        comprobanteTipo: values.comprobanteTipo,
        comprobanteNumero,
        medioPago: values.medioPago,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la compra.");
    }
  }

  return (
    <ModalShell
      open={target !== null}
      eyebrow="Trazabilidad · Libro de compras"
      title={target && target !== "new" ? `Editar compra — OP N° ${target.id}` : "Nueva compra"}
      width={760}
      onClose={onClose}
    >
      <form className="rf-form" onSubmit={handleSubmit}>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="rf-field">
            <label htmlFor="compra-fecha">
              Fecha<span className="rf-required">*</span>
            </label>
            <input id="compra-fecha" type="date" value={values.fecha} onChange={(e) => update("fecha", e.target.value)} />
          </div>

          <div className="rf-field" style={{ gridColumn: "span 2" }}>
            <label htmlFor="compra-materia">
              Materia prima<span className="rf-required">*</span>
            </label>
            <select id="compra-materia" value={values.materiaPrimaId} onChange={(e) => update("materiaPrimaId", e.target.value)}>
              <option value="">Seleccionar…</option>
              {materiasPrimas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({unidadCorta(m.unidad)})
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="compra-cantidad">
              Cantidad{unidad && ` (${unidad})`}
              <span className="rf-required">*</span>
            </label>
            <input
              id="compra-cantidad"
              type="number"
              min="0"
              step="any"
              value={values.cantidad}
              onChange={(e) => update("cantidad", e.target.value)}
            />
          </div>

          <div className="rf-field">
            <label htmlFor="compra-costo">
              Costo unitario<span className="rf-required">*</span>
            </label>
            <input
              id="compra-costo"
              type="number"
              min="0"
              step="any"
              value={values.costoUnitario}
              onChange={(e) => update("costoUnitario", e.target.value)}
            />
          </div>

          <div className="rf-field">
            <label htmlFor="compra-lote">Lote producto</label>
            <input
              id="compra-lote"
              type="text"
              placeholder="Lote del proveedor (si trae)"
              value={values.lote}
              onChange={(e) => update("lote", e.target.value)}
            />
          </div>

          {porKilo && (
            <div className="rf-field">
              <label htmlFor="compra-cascara">Cáscara (kg)</label>
              <input
                id="compra-cascara"
                type="number"
                min="0"
                step="any"
                placeholder="Solo cítricos"
                value={values.cantidadCascara}
                onChange={(e) => update("cantidadCascara", e.target.value)}
              />
            </div>
          )}

          <div className="rf-field rf-field-full rf-section-title">Proveedor</div>

          <div className="rf-field rf-field-full">
            <label htmlFor="compra-proveedor">
              Nombre - Razón social<span className="rf-required">*</span>
            </label>
            <select id="compra-proveedor" value={values.proveedorId} onChange={(e) => update("proveedorId", e.target.value)}>
              <option value="">Seleccionar…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial}
                  {p.producto ? ` — ${p.producto}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="compra-form">Form.</label>
            <select id="compra-form" value={values.comprobanteForm} onChange={(e) => update("comprobanteForm", e.target.value)}>
              <option value="">Sin comprobante</option>
              {COMPROBANTE_FORMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="compra-tipo">Tipo</label>
            <select id="compra-tipo" value={values.comprobanteTipo} onChange={(e) => update("comprobanteTipo", e.target.value)}>
              <option value="">—</option>
              {COMPROBANTE_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="compra-numero">N°</label>
            <input
              id="compra-numero"
              type="text"
              placeholder="0001 - 00021952"
              value={values.comprobanteNumero}
              onChange={(e) => update("comprobanteNumero", e.target.value)}
            />
          </div>

          <div className="rf-field rf-field-full">
            <label>
              Medio de pago<span className="rf-required">*</span>
            </label>
            <div className="tz-pago-options" role="radiogroup" aria-label="Medio de pago">
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

        {error && <div className="rf-error">{error}</div>}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="rf-submit-btn">
            Guardar
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
