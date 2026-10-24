"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoNumero, ErrorCampo, CampoFecha } from "@/app/components/data-table/FormFields";
import { formatCellValue } from "@/app/components/data-table/format";
import { LARGO_CORTO, hoyLocal, numeroATexto, parsearNumero } from "@/app/components/data-table/validacion";
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
  /** "si" = pagada (con fecha de pago), "no" = pendiente de pago. */
  pagada: "si" | "no";
  fechaPago: string;
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
  pagada: "si",
  fechaPago: "",
};

function toForm(c: CompraRow): FormState {
  return {
    fecha: c.fecha,
    materiaPrimaId: String(c.materiaPrimaId),
    cantidad: numeroATexto(c.cantidad),
    costoUnitario: numeroATexto(c.costoUnitario),
    cantidadCascara: c.cantidadCascara ? numeroATexto(c.cantidadCascara) : "",
    lote: c.lote,
    proveedorId: String(c.proveedorId),
    comprobanteForm: c.comprobanteForm,
    comprobanteTipo: c.comprobanteTipo,
    comprobanteNumero: c.comprobanteNumero,
    medioPago: c.medioPago,
    pagada: c.fechaPago ? "si" : "no",
    fechaPago: c.fechaPago ?? "",
  };
}

/** Lo que se valida y se guarda: una compra pendiente va sin fecha de pago. */
const paraGuardar = (v: FormState) => ({ ...v, fechaPago: v.pagada === "si" ? v.fechaPago : "" });

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
  // En un alta, la fecha de pago acompaña a la de la compra hasta que el usuario la cambia.
  const [fechaPagoTocada, setFechaPagoTocada] = useState(false);
  // Sin lote del proveedor: el primer "Guardar" avisa y el segundo ("Guardar
  // igual") confirma. Se guarda para qué materia prima y lote se avisó.
  const [avisoSinLote, setAvisoSinLote] = useState<string | null>(null);

  const compraId = target && target !== "new" ? target.id : null;
  const f = useErroresFormulario("compra", (v: FormState) => {
    const r = validarCompra(paraGuardar(v), estado, compraId);
    return r.ok ? {} : r.errores;
  });

  if (target !== loadedTarget) {
    setLoadedTarget(target);
    setValues(target && target !== "new" ? toForm(target) : EMPTY);
    setFechaPagoTocada(target !== "new");
    setAvisoSinLote(null);
    f.limpiar();
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    const next = { ...values, [key]: value };
    if (key === "fecha" && !fechaPagoTocada) next.fechaPago = value as string;
    if (key === "fechaPago") setFechaPagoTocada(true);
    // Al pasar a "Pagada" una compra que no tenía fecha de pago, se propone la de hoy.
    if (key === "pagada" && value === "si" && !next.fechaPago) next.fechaPago = fechaPagoTocada ? hoyLocal() : next.fecha;
    setValues(next);
    f.alEscribir(paraGuardar(next));
  }

  function campo(key: keyof FormState) {
    return { ...f.props(key), onBlur: () => f.alSalir(key, paraGuardar(values)) };
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

  // Sin lote no se puede rastrear a qué clientes llegó: se avisa en un alta, o
  // al editar si se borró el lote que tenía (no cada vez que se edita una vieja sin lote).
  const sinLote = !values.lote.trim() && (target === "new" || Boolean(target?.lote));
  const claveSinLote = `${values.materiaPrimaId}|${values.lote}`;
  const confirmandoSinLote = sinLote && avisoSinLote === claveSinLote;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const valores = paraGuardar(values);
    if (!f.alGuardar(valores)) return;
    const r = validarCompra(valores, estado, compraId);
    if (!r.ok) return;
    if (sinLote && !confirmandoSinLote) {
      setAvisoSinLote(claveSinLote);
      // El aviso queda al pie del formulario: se lo trae a la vista.
      requestAnimationFrame(() => document.getElementById("compra-aviso-lote")?.scrollIntoView({ block: "nearest" }));
      return;
    }

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
                title="Si la cargás, el inventario suma los kilos de cáscara (no los de fruta) y es lo que pueden usar las órdenes."
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

          <div className="rf-field" style={{ gridColumn: "span 2" }}>
            <label id="compra-pagada-label">
              Pago al proveedor<span className="rf-required">*</span>
            </label>
            <div className="tz-pago-options" role="radiogroup" aria-labelledby="compra-pagada-label">
              {(
                [
                  ["si", "Pagada"],
                  ["no", "Pendiente de pago"],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={values.pagada === valor}
                  className={`tz-pago-option ${values.pagada === valor ? "active" : ""}`}
                  onClick={() => update("pagada", valor)}
                >
                  {texto}
                </button>
              ))}
            </div>
          </div>

          {values.pagada === "si" && (
            <div className="rf-field">
              <label htmlFor="compra-fechaPago">
                Fecha de pago<span className="rf-required">*</span>
              </label>
              <CampoFecha {...campo("fechaPago")} valor={values.fechaPago} onCambio={(v) => update("fechaPago", v)} />
              <ErrorCampo f={f} campo="fechaPago" />
            </div>
          )}
        </div>

        <div className="li-total-row">
          <span className="li-total-label">Total de la operación</span>
          <span className="li-total-value">{formatCellValue(total, "currency")}</span>
        </div>

        <p className="rf-hint">
          Al guardar, la compra entra sola al Inventario de materia prima. Si una factura trae varios
          productos, cargá una operación por cada uno con el mismo comprobante.
        </p>

        {sinLote && avisoSinLote !== null && (
          <p id="compra-aviso-lote" className="rf-hint rf-hint-warn" role={confirmandoSinLote ? "alert" : undefined}>
            Falta el lote del proveedor: si hay un problema con esta materia prima no se va a poder rastrear a qué lotes ni a qué
            clientes llegó.
            {confirmandoSinLote && " Cargá el lote (viene en la etiqueta, el envase o el remito) o tocá «Guardar igual» si no trae."}
          </p>
        )}

        {f.general && <div className="rf-error">{f.general}</div>}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={close} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="rf-submit-btn" disabled={submitting}>
            {submitting ? "Guardando…" : confirmandoSinLote ? "Guardar igual" : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
