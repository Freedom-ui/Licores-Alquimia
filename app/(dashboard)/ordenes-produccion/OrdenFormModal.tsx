"use client";

import { useMemo, useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import LineItemsField from "@/app/components/data-table/LineItemsField";
import { formatCellValue } from "@/app/components/data-table/format";
import type { LineColumn } from "@/app/components/data-table/types";
import type { OrdenInsumo, OrdenProduccionRow } from "./data";
import type { ProductoRow } from "../productos/data";
import { productoLabel } from "../productos/data";
import type { MateriaPrimaRow } from "../materia-prima/data";

type InsumoFormRow = OrdenInsumo & { costoTotalLinea: number };

function emptyInsumoRow(): InsumoFormRow {
  return { materiaPrima: "", cantidad: 0, costoUnitario: 0, costoTotalLinea: 0 };
}

function withTotales(rows: InsumoFormRow[]): InsumoFormRow[] {
  return rows.map((r) => ({ ...r, costoTotalLinea: r.cantidad * r.costoUnitario }));
}

export type OrdenFormTarget = OrdenProduccionRow | "new" | null;

type FormState = {
  productoId: string;
  fechaMaceracion: string;
  fechaEmbotellado: string;
  responsable: string;
  cantidadProducida: string;
};

const EMPTY: FormState = {
  productoId: "",
  fechaMaceracion: "",
  fechaEmbotellado: "",
  responsable: "",
  cantidadProducida: "",
};

export default function OrdenFormModal({
  target,
  productos,
  materiasPrimas,
  onClose,
  onSubmit,
}: {
  /** Fila a editar, "new" para alta, null = modal cerrado. */
  target: OrdenFormTarget;
  productos: ProductoRow[];
  materiasPrimas: MateriaPrimaRow[];
  onClose: () => void;
  onSubmit: (
    id: number | null,
    values: {
      productoId: number;
      fechaMaceracion: string;
      fechaEmbotellado: string | null;
      responsable: string;
      cantidadProducida: number;
      insumos: OrdenInsumo[];
    }
  ) => void | Promise<void>;
}) {
  const [values, setValues] = useState<FormState>(EMPTY);
  const [insumos, setInsumos] = useState<InsumoFormRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rastrea para qué `target` están cargados los valores actuales, para poder
  // recargarlos durante el render cuando `target` cambia (sin pasar por un efecto).
  const [loadedTarget, setLoadedTarget] = useState<OrdenFormTarget>(null);

  const insumoColumns: LineColumn<InsumoFormRow>[] = useMemo(
    () => [
      {
        key: "materiaPrima",
        label: "Materia prima",
        type: "select",
        options: materiasPrimas.map((m) => m.nombre),
        width: "36%",
      },
      { key: "cantidad", label: "Cantidad", type: "number", width: "16%" },
      { key: "costoUnitario", label: "Costo unitario", type: "currency", width: "24%" },
      { key: "costoTotalLinea", label: "Costo total", type: "currency", width: "24%", readOnly: true },
    ],
    [materiasPrimas]
  );

  if (target !== loadedTarget) {
    setLoadedTarget(target);
    if (target === "new") {
      setValues(EMPTY);
      setInsumos([]);
    } else if (target) {
      setValues({
        productoId: String(target.productoId),
        fechaMaceracion: target.fechaMaceracion,
        fechaEmbotellado: target.fechaEmbotellado ?? "",
        responsable: target.responsable,
        cantidadProducida: String(target.cantidadProducida),
      });
      setInsumos(withTotales(target.insumos.map((i) => ({ ...i, costoTotalLinea: 0 }))));
    }
    setError(null);
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  const costoTotal = insumos.reduce((sum, r) => sum + r.costoTotalLinea, 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (
      !values.productoId ||
      !values.fechaMaceracion ||
      !values.responsable ||
      !values.cantidadProducida
    ) {
      setError("Completá todos los campos obligatorios.");
      return;
    }

    const insumosValidos = insumos.filter((r) => r.materiaPrima && r.cantidad > 0);
    if (insumosValidos.length === 0) {
      setError("Agregá al menos un insumo con materia prima y cantidad.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(target === "new" || !target ? null : target.id, {
        productoId: Number(values.productoId),
        fechaMaceracion: values.fechaMaceracion,
        fechaEmbotellado: values.fechaEmbotellado || null,
        responsable: values.responsable,
        cantidadProducida: Number(values.cantidadProducida),
        insumos: insumosValidos.map(({ materiaPrima, cantidad, costoUnitario }) => ({
          materiaPrima,
          cantidad,
          costoUnitario,
        })),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la orden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open={target !== null}
      eyebrow="Órdenes de producción"
      title={target && target !== "new" ? "Editar orden" : "Nueva orden"}
      width={760}
      onClose={close}
    >
      <form className="rf-form" onSubmit={handleSubmit}>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="rf-field rf-field-full">
            <label htmlFor="orden-producto">
              Producto<span className="rf-required">*</span>
            </label>
            <select
              id="orden-producto"
              value={values.productoId}
              onChange={(e) => update("productoId", e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {productoLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="rf-field">
            <label htmlFor="orden-maceracion">
              Fecha de maceración<span className="rf-required">*</span>
            </label>
            <input
              id="orden-maceracion"
              type="date"
              value={values.fechaMaceracion}
              onChange={(e) => update("fechaMaceracion", e.target.value)}
            />
          </div>

          <div className="rf-field">
            <label htmlFor="orden-embotellado">Fecha de embotellado</label>
            <input
              id="orden-embotellado"
              type="date"
              placeholder="Si ya se embotelló"
              value={values.fechaEmbotellado}
              onChange={(e) => update("fechaEmbotellado", e.target.value)}
            />
          </div>

          <div className="rf-field">
            <label htmlFor="orden-responsable">
              Responsable<span className="rf-required">*</span>
            </label>
            <input
              id="orden-responsable"
              type="text"
              placeholder="Ej: Alquimia"
              value={values.responsable}
              onChange={(e) => update("responsable", e.target.value)}
            />
          </div>

          <div className="rf-field">
            <label htmlFor="orden-cantidad">
              Cantidad producida<span className="rf-required">*</span>
            </label>
            <input
              id="orden-cantidad"
              type="number"
              min="1"
              value={values.cantidadProducida}
              onChange={(e) => update("cantidadProducida", e.target.value)}
            />
          </div>
        </div>

        <LineItemsField
          label="Insumos utilizados"
          columns={insumoColumns}
          rows={insumos}
          onChange={(rows) => setInsumos(withTotales(rows))}
          emptyRow={emptyInsumoRow}
        />

        <div className="li-total-row">
          <span className="li-total-label">Costo total</span>
          <span className="li-total-value">{formatCellValue(costoTotal, "currency")}</span>
        </div>

        {values.fechaEmbotellado && (
          <p className="rf-hint">
            Al guardar con fecha de embotellado, se crea o actualiza automáticamente el lote
            correspondiente en Productos terminados.
          </p>
        )}

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
