"use client";

import { useMemo, useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import FormFields from "@/app/components/data-table/FormFields";
import LineItemsField from "@/app/components/data-table/LineItemsField";
import {
  findMissingRequiredField,
  formatCellValue,
  getEditableFields,
  getFormGridColumns,
  getFormModalWidth,
  parseFormValues,
} from "@/app/components/data-table/format";
import type { Column, LineColumn } from "@/app/components/data-table/types";
import type { OrdenInsumo, OrdenProduccionRow } from "./data";
import { productosDemo } from "../productos/data";
import { materiaPrimaDemo } from "../materia-prima/data";

const PRODUCTOS = Array.from(new Set(productosDemo.map((p) => p.nombre)));
const FORMATOS = Array.from(new Set(productosDemo.map((p) => p.formato)));
const MATERIAS_PRIMAS = materiaPrimaDemo.map((m) => m.nombre);

type HeaderFields = Pick<
  OrdenProduccionRow,
  "producto" | "formato" | "fechaMaceracion" | "fechaEmbotellado" | "responsable" | "cantidadProducida"
>;

const headerColumns: Column<HeaderFields>[] = [
  {
    key: "producto",
    label: "Producto",
    form: { required: true, input: "select", options: PRODUCTOS },
  },
  {
    key: "formato",
    label: "Formato",
    form: { required: true, input: "select", options: FORMATOS },
  },
  {
    key: "fechaMaceracion",
    label: "Fecha de maceración",
    type: "date",
    form: { required: true },
  },
  {
    key: "fechaEmbotellado",
    label: "Fecha de embotellado",
    type: "date",
    form: { placeholder: "Si ya se embotelló" },
  },
  {
    key: "responsable",
    label: "Responsable",
    form: { required: true, placeholder: "Ej: Alquimia" },
  },
  {
    key: "cantidadProducida",
    label: "Cantidad producida",
    type: "number",
    form: { required: true },
  },
];

type InsumoFormRow = OrdenInsumo & { costoTotalLinea: number };

function emptyInsumoRow(): InsumoFormRow {
  return { materiaPrima: "", cantidad: 0, costoUnitario: 0, costoTotalLinea: 0 };
}

function withTotales(rows: InsumoFormRow[]): InsumoFormRow[] {
  return rows.map((r) => ({ ...r, costoTotalLinea: r.cantidad * r.costoUnitario }));
}

const insumoColumns: LineColumn<InsumoFormRow>[] = [
  { key: "materiaPrima", label: "Materia prima", type: "select", options: MATERIAS_PRIMAS, width: "36%" },
  { key: "cantidad", label: "Cantidad", type: "number", width: "16%" },
  { key: "costoUnitario", label: "Costo unitario", type: "currency", width: "24%" },
  { key: "costoTotalLinea", label: "Costo total", type: "currency", width: "24%", readOnly: true },
];

export type OrdenFormTarget = OrdenProduccionRow | "new" | null;

export default function OrdenFormModal({
  target,
  onClose,
  onSubmit,
}: {
  /** Fila a editar, "new" para alta, null = modal cerrado. */
  target: OrdenFormTarget;
  onClose: () => void;
  onSubmit: (
    id: number | null,
    values: HeaderFields & { insumos: OrdenInsumo[] }
  ) => void | Promise<void>;
}) {
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [insumos, setInsumos] = useState<InsumoFormRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rastrea para qué `target` están cargados los valores actuales, para poder
  // recargarlos durante el render cuando `target` cambia (sin pasar por un efecto).
  const [loadedTarget, setLoadedTarget] = useState<OrdenFormTarget>(null);

  const headerFields = useMemo(() => getEditableFields(headerColumns), []);

  if (target !== loadedTarget) {
    setLoadedTarget(target);
    if (target === "new") {
      setHeaderValues({});
      setInsumos([]);
    } else if (target) {
      setHeaderValues({
        producto: target.producto,
        formato: target.formato,
        fechaMaceracion: target.fechaMaceracion,
        fechaEmbotellado: target.fechaEmbotellado ?? "",
        responsable: target.responsable,
        cantidadProducida: String(target.cantidadProducida),
      });
      setInsumos(withTotales(target.insumos.map((i) => ({ ...i, costoTotalLinea: 0 }))));
    }
    setError(null);
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  const costoTotal = insumos.reduce((sum, r) => sum + r.costoTotalLinea, 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const missing = findMissingRequiredField(headerFields, headerValues);
    if (missing) {
      setError(`Completá "${missing.title ?? missing.label}".`);
      return;
    }

    const insumosValidos = insumos.filter((r) => r.materiaPrima && r.cantidad > 0);
    if (insumosValidos.length === 0) {
      setError("Agregá al menos un insumo con materia prima y cantidad.");
      return;
    }

    const header = parseFormValues(headerFields, headerValues) as unknown as HeaderFields;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(target === "new" || !target ? null : target.id, {
        ...header,
        fechaEmbotellado: (header.fechaEmbotellado as unknown as string) || null,
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

  const gridColumns = getFormGridColumns(headerFields.length);
  const modalWidth = getFormModalWidth(gridColumns);

  return (
    <ModalShell
      open={target !== null}
      eyebrow="Órdenes de producción"
      title={target && target !== "new" ? "Editar orden" : "Nueva orden"}
      width={modalWidth}
      onClose={close}
    >
      <form className="rf-form" onSubmit={handleSubmit}>
        <FormFields
          columns={headerColumns}
          values={headerValues}
          onChange={(key, value) => setHeaderValues((prev) => ({ ...prev, [key]: value }))}
        />

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
