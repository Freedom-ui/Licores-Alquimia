"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { formatCellValue } from "@/app/components/data-table/format";
import type { ClienteRow } from "../clientes/data";
import { productosDemo, productoLabel, findProductoById } from "../productos/data";
import { VENDEDORES, type OperacionRow } from "./data";

const CANALES = ["Menor", "Mayor"];
const CONDICIONES = ["Contado", "Crédito", "Consignación"];

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

export default function OperacionFormModal({
  target,
  clientes,
  onClose,
  onSubmit,
}: {
  target: OperacionFormTarget;
  clientes: ClienteRow[];
  onClose: () => void;
  onSubmit: (
    id: number | null,
    values: Omit<OperacionRow, "id" | "cliente" | "descripcion" | "subTotal">
  ) => void | Promise<void>;
}) {
  const [values, setValues] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rastrea para qué `target` están cargados los valores actuales, para poder
  // recargarlos durante el render cuando `target` cambia (sin pasar por un efecto).
  const [loadedTarget, setLoadedTarget] = useState<OperacionFormTarget>(null);

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
        cantidad: String(target.cantidad),
        canal: target.canal,
        condicion: target.condicion,
        pu: String(target.pu),
      });
    }
    setError(null);
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Al elegir un producto se sugiere su precio de lista, pero el usuario
      // puede pisarlo después (ej. un cliente con precio preferencial).
      if (key === "productoId") {
        const producto = findProductoById(value);
        if (producto) next.pu = String(producto.precioUnitario);
      }
      return next;
    });
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  const cantidadNum = Number(values.cantidad) || 0;
  const puNum = Number(values.pu) || 0;
  const subTotal = cantidadNum * puNum;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (
      !values.fecha ||
      !values.clienteId ||
      !values.vendedor ||
      !values.productoId ||
      !values.cantidad ||
      !values.canal ||
      !values.condicion ||
      !values.pu
    ) {
      setError("Completá todos los campos obligatorios.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(target === "new" || !target ? null : target.id, {
        fecha: values.fecha,
        clienteId: Number(values.clienteId),
        vendedor: values.vendedor,
        productoId: Number(values.productoId),
        cantidad: cantidadNum,
        canal: values.canal,
        condicion: values.condicion,
        pu: puNum,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la operación.");
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
      <form className="rf-form" onSubmit={handleSubmit}>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="rf-field">
            <label htmlFor="op-fecha">
              Fecha<span className="rf-required">*</span>
            </label>
            <input
              id="op-fecha"
              type="date"
              value={values.fecha}
              onChange={(e) => update("fecha", e.target.value)}
            />
          </div>

          <div className="rf-field">
            <label htmlFor="op-cliente">
              Cliente<span className="rf-required">*</span>
            </label>
            <select id="op-cliente" value={values.clienteId} onChange={(e) => update("clienteId", e.target.value)}>
              <option value="">Seleccionar…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="op-vendedor">
              Vendedor<span className="rf-required">*</span>
            </label>
            <select id="op-vendedor" value={values.vendedor} onChange={(e) => update("vendedor", e.target.value)}>
              <option value="">Seleccionar…</option>
              {VENDEDORES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field rf-field-full">
            <label htmlFor="op-producto">
              Producto<span className="rf-required">*</span>
            </label>
            <select id="op-producto" value={values.productoId} onChange={(e) => update("productoId", e.target.value)}>
              <option value="">Seleccionar…</option>
              {productosDemo.map((p) => (
                <option key={p.id} value={p.id}>
                  {productoLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="op-cantidad">
              Cantidad<span className="rf-required">*</span>
            </label>
            <input
              id="op-cantidad"
              type="number"
              min="1"
              value={values.cantidad}
              onChange={(e) => update("cantidad", e.target.value)}
            />
          </div>

          <div className="rf-field">
            <label htmlFor="op-canal">
              Canal<span className="rf-required">*</span>
            </label>
            <select id="op-canal" value={values.canal} onChange={(e) => update("canal", e.target.value)}>
              <option value="">Seleccionar…</option>
              {CANALES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="op-condicion">
              Condición<span className="rf-required">*</span>
            </label>
            <select id="op-condicion" value={values.condicion} onChange={(e) => update("condicion", e.target.value)}>
              <option value="">Seleccionar…</option>
              {CONDICIONES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="op-pu">
              P.U.<span className="rf-required">*</span>
            </label>
            <input id="op-pu" type="number" min="0" value={values.pu} onChange={(e) => update("pu", e.target.value)} />
          </div>
        </div>

        <div className="li-total-row">
          <span className="li-total-label">Sub total</span>
          <span className="li-total-value">{formatCellValue(subTotal, "currency")}</span>
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
