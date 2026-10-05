"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import LineItemsField from "@/app/components/data-table/LineItemsField";
import { formatCellValue } from "@/app/components/data-table/format";
import type { LineColumn } from "@/app/components/data-table/types";
import type { OrdenInsumo, OrdenProduccionRow } from "./data";
import type { ProductoRow } from "../productos/data";
import { productoLabel } from "../productos/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import type { CompraRow } from "../trazabilidad/data";
import { formatCantidad } from "../trazabilidad/data";
import { usadoDeCompra } from "../store";

// compraId va como texto porque es el valor de un <select>; se convierte al guardar.
type InsumoFormRow = Omit<OrdenInsumo, "compraId"> & { compraId: string; costoTotalLinea: number };

function emptyInsumoRow(): InsumoFormRow {
  return { materiaPrima: "", compraId: "", cantidad: 0, costoUnitario: 0, costoTotalLinea: 0 };
}

const EPSILON = 1e-9;

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
  compras,
  ordenes,
  onClose,
  onSubmit,
}: {
  /** Fila a editar, "new" para alta, null = modal cerrado. */
  target: OrdenFormTarget;
  productos: ProductoRow[];
  materiasPrimas: MateriaPrimaRow[];
  /** Libro de compras: de acá salen los lotes que se pueden asignar a cada insumo. */
  compras: CompraRow[];
  /** Todas las órdenes, para saber cuánto de cada compra ya usaron las demás. */
  ordenes: OrdenProduccionRow[];
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

  const ordenId = target && target !== "new" ? target.id : undefined;

  /** Cuánto queda de una compra para esta línea: descuenta lo que usan las otras órdenes y las otras líneas de esta. */
  function disponibleDe(compra: CompraRow, rows: InsumoFormRow[], exceptIndex: number): number {
    const enEstaOrden = rows.reduce(
      (sum, r, j) => (j !== exceptIndex && r.compraId === String(compra.id) ? sum + r.cantidad : sum),
      0
    );
    return compra.cantidad - usadoDeCompra(ordenes, compra.id, ordenId) - enEstaOrden;
  }

  /** Compras de la materia prima de la línea, anteriores a la maceración, de la más vieja a la más nueva. */
  function comprasPara(nombreMateria: string): CompraRow[] {
    const mp = materiasPrimas.find((m) => m.nombre === nombreMateria);
    if (!mp) return [];
    return compras
      .filter((c) => c.materiaPrimaId === mp.id && (!values.fechaMaceracion || c.fecha <= values.fechaMaceracion))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id));
  }

  function compraSugerida(rows: InsumoFormRow[], index: number): CompraRow | undefined {
    return comprasPara(rows[index].materiaPrima).find((c) => disponibleDe(c, rows, index) > EPSILON);
  }

  const insumoColumns: LineColumn<InsumoFormRow>[] = [
    {
      key: "materiaPrima",
      label: "Materia prima",
      type: "select",
      options: materiasPrimas.map((m) => m.nombre),
      width: "27%",
    },
    {
      key: "compraId",
      label: "Compra / lote",
      type: "select",
      placeholder: "Sin compra registrada",
      width: "31%",
      optionsFor: (row, i) => {
        const unidad = materiasPrimas.find((m) => m.nombre === row.materiaPrima)?.unidad;
        return comprasPara(row.materiaPrima)
          .map((c) => ({ c, disp: disponibleDe(c, insumos, i) }))
          .filter(({ c, disp }) => disp > EPSILON || String(c.id) === row.compraId)
          .map(({ c, disp }) => ({
            value: String(c.id),
            label: `OP ${c.id} · ${c.lote || "sin lote"} · ${formatCellValue(c.fecha, "date")} · disp. ${formatCantidad(Math.max(disp, 0), unidad)}`,
          }));
      },
    },
    { key: "cantidad", label: "Cantidad", type: "number", width: "12%" },
    { key: "costoUnitario", label: "Costo unit.", type: "currency", width: "15%" },
    { key: "costoTotalLinea", label: "Costo total", type: "currency", width: "15%", readOnly: true },
  ];

  // Al elegir la materia prima se propone sola la compra más vieja con stock
  // (FIFO) y su costo real; al cambiar de compra a mano, también se trae su costo.
  function handleInsumosChange(next: InsumoFormRow[]) {
    const ajustadas = next.map((row, i) => {
      const prev = insumos[i];
      if (!prev || prev.materiaPrima !== row.materiaPrima) {
        const sugerida = compraSugerida(next, i);
        return sugerida
          ? { ...row, compraId: String(sugerida.id), costoUnitario: sugerida.costoUnitario }
          : { ...row, compraId: "" };
      }
      if (row.compraId && row.compraId !== prev.compraId) {
        const elegida = compras.find((c) => String(c.id) === row.compraId);
        if (elegida) return { ...row, costoUnitario: elegida.costoUnitario };
      }
      return row;
    });
    setInsumos(withTotales(ajustadas));
  }

  const lineasSinCompra = insumos.filter((r) => r.materiaPrima && !r.compraId).length;

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
      setInsumos(
        withTotales(target.insumos.map((i) => ({ ...i, compraId: i.compraId ? String(i.compraId) : "", costoTotalLinea: 0 })))
      );
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

    // Integridad de la trazabilidad: la compra tiene que ser de esa materia
    // prima, anterior a la maceración, y no se puede usar más de lo comprado.
    const usoPorCompra = new Map<string, number>();
    for (const r of insumosValidos) {
      if (!r.compraId) continue;
      const compra = compras.find((c) => String(c.id) === r.compraId);
      const mp = materiasPrimas.find((m) => m.nombre === r.materiaPrima);
      if (!compra || compra.materiaPrimaId !== mp?.id) {
        setError(`La compra elegida para "${r.materiaPrima}" no corresponde a esa materia prima.`);
        return;
      }
      if (compra.fecha > values.fechaMaceracion) {
        setError(
          `La compra OP ${compra.id} (${formatCellValue(compra.fecha, "date")}) es posterior a la fecha de maceración: no puede haberse usado en esta orden.`
        );
        return;
      }
      usoPorCompra.set(r.compraId, (usoPorCompra.get(r.compraId) ?? 0) + r.cantidad);
    }
    for (const [compraId, uso] of usoPorCompra) {
      const compra = compras.find((c) => String(c.id) === compraId)!;
      const disponible = compra.cantidad - usadoDeCompra(ordenes, compra.id, ordenId);
      if (uso > disponible + EPSILON) {
        const unidad = materiasPrimas.find((m) => m.id === compra.materiaPrimaId)?.unidad;
        setError(
          `De la compra OP ${compra.id} quedan ${formatCantidad(Math.max(disponible, 0), unidad)} y esta orden usa ${formatCantidad(uso, unidad)}. Si sale de otra compra, agregá otra línea con esa compra.`
        );
        return;
      }
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
        insumos: insumosValidos.map(({ materiaPrima, cantidad, costoUnitario, compraId }) => ({
          materiaPrima,
          cantidad,
          costoUnitario,
          ...(compraId ? { compraId: Number(compraId) } : {}),
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
      width={940}
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
          onChange={handleInsumosChange}
          emptyRow={emptyInsumoRow}
        />

        <div className="li-total-row">
          <span className="li-total-label">Costo total</span>
          <span className="li-total-value">{formatCellValue(costoTotal, "currency")}</span>
        </div>

        <p className="rf-hint">
          Indicá de qué compra (lote del proveedor) sale cada insumo: es lo que permite rastrear un lote
          de licor hasta su origen. Se propone la compra más antigua con stock; si un insumo sale de dos
          compras, cargalo en dos líneas. Los insumos que estén en el Inventario de materia prima se
          descuentan solos al guardar (con la fecha de maceración).
        </p>

        {lineasSinCompra > 0 && (
          <p className="rf-hint rf-hint-warn">
            {lineasSinCompra === 1 ? "1 insumo no tiene" : `${lineasSinCompra} insumos no tienen`} compra
            asociada: en la trazabilidad van a figurar sin proveedor ni lote de origen.
          </p>
        )}

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
