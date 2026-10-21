"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoNumero, ErrorCampo, CampoFecha } from "@/app/components/data-table/FormFields";
import { formatCellValue } from "@/app/components/data-table/format";
import { fmtFecha, fmtNumero, numeroATexto, parsearNumero } from "@/app/components/data-table/validacion";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import type { ClienteRow } from "../clientes/data";
import { productoLabel, type ProductoRow } from "../productos/data";
import { CANALES, CONDICIONES, type OperacionRow } from "./data";
import { useStore, type OperacionInput } from "../store";
import { faltanteDeVenta, validarOperacion } from "../_dominio/reglas";

export type OperacionFormTarget = OperacionRow | "new" | null;

type FormState = {
  fecha: string;
  clienteId: string;
  vendedor: string;
  productoId: string;
  cantidad: string;
  canal: string;
  condicion: string;
  pu: string;
};

const EMPTY: FormState = {
  fecha: "",
  clienteId: "",
  vendedor: "",
  productoId: "",
  cantidad: "",
  canal: "",
  condicion: "",
  pu: "",
};

/** Número de un input, o 0 si está vacío o mal escrito (solo para mostrar en pantalla). */
const num = (v: string) => {
  const n = parsearNumero(v);
  return n === null || Number.isNaN(n) ? 0 : n;
};

export default function OperacionFormModal({
  target,
  clientes,
  productos,
  onClose,
  onSubmit,
}: {
  target: OperacionFormTarget;
  clientes: ClienteRow[];
  productos: ProductoRow[];
  onClose: () => void;
  onSubmit: (id: number | null, values: OperacionInput) => Promise<void>;
}) {
  const estado = useStore();
  const [values, setValues] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  // Venta mayor al stock: el primer "Guardar" muestra el aviso y el segundo
  // ("Guardar igual") confirma. Se guarda para qué producto y cantidad se avisó.
  const [avisoConfirmable, setAvisoConfirmable] = useState<string | null>(null);
  // Rastrea para qué `target` están cargados los valores actuales, para poder
  // recargarlos durante el render cuando `target` cambia (sin pasar por un efecto).
  const [loadedTarget, setLoadedTarget] = useState<OperacionFormTarget>(null);
  const f = useErroresFormulario("op", (v: FormState) => {
    const r = validarOperacion(v, estado);
    return r.ok ? {} : r.errores;
  });

  const operacionId = target && target !== "new" ? target.id : null;

  if (target !== loadedTarget) {
    setLoadedTarget(target);
    if (target === "new") {
      setValues(EMPTY);
    } else if (target) {
      setValues({
        fecha: target.fecha,
        clienteId: String(target.clienteId),
        vendedor: target.vendedor,
        productoId: String(target.productoId),
        cantidad: numeroATexto(target.cantidad),
        canal: target.canal,
        condicion: target.condicion,
        pu: numeroATexto(target.pu),
      });
    }
    setAvisoConfirmable(null);
    f.limpiar();
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    const next = { ...values, [key]: value };
    // Al elegir un producto se sugiere su precio de lista, pero el usuario
    // puede pisarlo después (ej. un cliente con precio preferencial).
    if (key === "productoId") {
      const producto = productos.find((p) => p.id === Number(value));
      if (producto) next.pu = numeroATexto(producto.precioUnitario);
    }
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

  const cantidadNum = num(values.cantidad);
  const subTotal = cantidadNum * num(values.pu);

  // Stock del producto elegido embotellado a la fecha de la venta (al editar,
  // cuenta lo que ya tomó esta misma venta).
  const productoId = Number(values.productoId);
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(values.fecha);
  const faltante =
    productoId && fechaOk && cantidadNum > 0
      ? faltanteDeVenta(estado, { id: operacionId, productoId, fecha: values.fecha, cantidad: cantidadNum })
      : null;
  const superaStock = faltante !== null && faltante.faltan > 0;
  const claveAviso = `${values.productoId}|${values.cantidad}|${values.fecha}`;
  const confirmando = superaStock && avisoConfirmable === claveAviso;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.alGuardar(values)) return;
    const r = validarOperacion(values, estado);
    if (!r.ok) return;
    if (superaStock && !confirmando) {
      setAvisoConfirmable(claveAviso);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(operacionId, r.valor);
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudo guardar la operación.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open={target !== null}
      eyebrow="Operaciones"
      title={target && target !== "new" ? "Editar operación" : "Nueva operación"}
      width={700}
      onClose={close}
    >
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="rf-field">
            <label htmlFor="op-fecha">
              Fecha<span className="rf-required">*</span>
            </label>
            <CampoFecha {...campo("fecha")} valor={values.fecha} onCambio={(v) => update("fecha", v)} />
            <ErrorCampo f={f} campo="fecha" />
          </div>

          <div className="rf-field">
            <label htmlFor="op-clienteId">
              Cliente<span className="rf-required">*</span>
            </label>
            <select {...campo("clienteId")} value={values.clienteId} onChange={(e) => update("clienteId", e.target.value)}>
              <option value="">Seleccionar…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial}
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="clienteId" />
          </div>

          <div className="rf-field">
            <label htmlFor="op-vendedor">
              Vendedor<span className="rf-required">*</span>
            </label>
            <select {...campo("vendedor")} value={values.vendedor} onChange={(e) => update("vendedor", e.target.value)}>
              <option value="">Seleccionar…</option>
              {estado.vendedores.map((v) => (
                <option key={v.id} value={v.nombre}>
                  {v.nombre}
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="vendedor" />
          </div>

          <div className="rf-field rf-field-full">
            <label htmlFor="op-productoId">
              Producto<span className="rf-required">*</span>
            </label>
            <select {...campo("productoId")} value={values.productoId} onChange={(e) => update("productoId", e.target.value)}>
              <option value="">Seleccionar…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {productoLabel(p)}
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="productoId" />
          </div>

          <div className="rf-field">
            <label htmlFor="op-cantidad">
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

          <div className="rf-field">
            <label htmlFor="op-canal">
              Canal<span className="rf-required">*</span>
            </label>
            <select {...campo("canal")} value={values.canal} onChange={(e) => update("canal", e.target.value)}>
              <option value="">Seleccionar…</option>
              {CANALES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="canal" />
          </div>

          <div className="rf-field">
            <label htmlFor="op-condicion">
              Condición<span className="rf-required">*</span>
            </label>
            <select {...campo("condicion")} value={values.condicion} onChange={(e) => update("condicion", e.target.value)}>
              <option value="">Seleccionar…</option>
              {CONDICIONES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ErrorCampo f={f} campo="condicion" />
          </div>

          <div className="rf-field">
            <label htmlFor="op-pu">
              P.U.<span className="rf-required">*</span>
            </label>
            <CampoNumero {...campo("pu")} placeholder="Ej: 10000" valor={values.pu} onCambio={(v) => update("pu", v)} />
            <ErrorCampo f={f} campo="pu" />
          </div>
        </div>

        <div className="li-total-row">
          <span className="li-total-label">Sub total</span>
          <span className="li-total-value">{formatCellValue(subTotal, "currency")}</span>
        </div>

        {superaStock && (
          <p className="rf-hint rf-hint-warn" role={confirmando ? "alert" : undefined}>
            {faltante.sinLote
              ? `No hay ningún lote de este producto embotellado al ${fmtFecha(values.fecha)}. Si guardás igual, la venta queda sin lote de origen.`
              : `Al ${fmtFecha(values.fecha)} faltan ${fmtNumero(faltante.faltan)} ${faltante.faltan === 1 ? "botella" : "botellas"} de este producto en stock. Si guardás igual, el último lote embotellado a esa fecha queda en negativo hasta que se embotelle lo que falta.`}
            {confirmando && " Revisá la cantidad y la fecha, o tocá «Guardar igual» para confirmar."}
          </p>
        )}

        {f.general && <div className="rf-error">{f.general}</div>}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={close} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="rf-submit-btn" disabled={submitting}>
            {submitting ? "Guardando…" : confirmando ? "Guardar igual" : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
