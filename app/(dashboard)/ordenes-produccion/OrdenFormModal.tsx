"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import LineItemsField from "@/app/components/data-table/LineItemsField";
import { CampoNumero, ErrorCampo, CampoFecha } from "@/app/components/data-table/FormFields";
import { formatCellValue } from "@/app/components/data-table/format";
import type { LineColumn } from "@/app/components/data-table/types";
import { LARGO_RESPONSABLE, parsearNumero } from "@/app/components/data-table/validacion";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import type { OrdenProduccionRow } from "./data";
import { productoLabel } from "../productos/data";
import type { CompraRow } from "../trazabilidad/data";
import { formatCantidad, stockDeCompra } from "../trazabilidad/data";
import { usadoDeCompra, useStore, type OrdenInput } from "../store";
import { validarOrden } from "../_dominio/reglas";

// Todo como texto, tal como está en los inputs (compraId es el valor de un
// <select>); validarOrden lo convierte y lo valida al guardar.
type InsumoFormRow = {
  materiaPrima: string;
  compraId: string;
  cantidad: string;
  costoUnitario: string;
  costoTotalLinea: number;
};

function emptyInsumoRow(): InsumoFormRow {
  return { materiaPrima: "", compraId: "", cantidad: "", costoUnitario: "", costoTotalLinea: 0 };
}

const EPSILON = 1e-9;

/** Número de un input, o 0 si está vacío o mal escrito (solo para los totales en pantalla). */
const num = (v: string) => {
  const n = parsearNumero(v);
  return n === null || Number.isNaN(n) ? 0 : n;
};

function withTotales(rows: InsumoFormRow[]): InsumoFormRow[] {
  return rows.map((r) => ({ ...r, costoTotalLinea: num(r.cantidad) * num(r.costoUnitario) }));
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

/** Lo que se valida: la cabecera + las líneas (sin el total calculado). */
function aValidar(values: FormState, insumos: InsumoFormRow[]) {
  return {
    ...values,
    insumos: insumos.map(({ materiaPrima, compraId, cantidad, costoUnitario }) => ({ materiaPrima, compraId, cantidad, costoUnitario })),
  };
}

export default function OrdenFormModal({
  target,
  onClose,
  onSubmit,
}: {
  /** Fila a editar, "new" para alta, null = modal cerrado. */
  target: OrdenFormTarget;
  onClose: () => void;
  onSubmit: (id: number | null, values: OrdenInput) => Promise<void>;
}) {
  const estado = useStore();
  const { productos, materiaPrima: materiasPrimas, compras, ordenesProduccion: ordenes } = estado;
  const [values, setValues] = useState<FormState>(EMPTY);
  const [insumos, setInsumos] = useState<InsumoFormRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué `target` están cargados los valores actuales, para poder
  // recargarlos durante el render cuando `target` cambia (sin pasar por un efecto).
  const [loadedTarget, setLoadedTarget] = useState<OrdenFormTarget>(null);

  const ordenId = target && target !== "new" ? target.id : undefined;
  const f = useErroresFormulario("orden", (v: ReturnType<typeof aValidar>) => {
    const r = validarOrden(v, estado, ordenId ?? null);
    return r.ok ? {} : r.errores;
  });

  /** Cuánto queda de una compra para esta línea: descuenta lo que usan las otras órdenes y las otras líneas de esta. */
  function disponibleDe(compra: CompraRow, rows: InsumoFormRow[], exceptIndex: number): number {
    const enEstaOrden = rows.reduce(
      (sum, r, j) => (j !== exceptIndex && r.compraId === String(compra.id) ? sum + num(r.cantidad) : sum),
      0
    );
    return stockDeCompra(compra) - usadoDeCompra(ordenes, compra.id, ordenId) - enEstaOrden;
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

  function cambiar(nextValues: FormState, nextInsumos: InsumoFormRow[]) {
    setValues(nextValues);
    setInsumos(nextInsumos);
    f.alEscribir(aValidar(nextValues, nextInsumos));
  }

  // Al elegir la materia prima se propone sola la compra más vieja con stock
  // (FIFO) y su costo real; al cambiar de compra a mano, también se trae su costo.
  function handleInsumosChange(next: InsumoFormRow[]) {
    const ajustadas = next.map((row, i) => {
      const prev = insumos[i];
      if (!prev || prev.materiaPrima !== row.materiaPrima) {
        const sugerida = compraSugerida(next, i);
        return sugerida
          ? { ...row, compraId: String(sugerida.id), costoUnitario: String(sugerida.costoUnitario) }
          : { ...row, compraId: "" };
      }
      if (row.compraId && row.compraId !== prev.compraId) {
        const elegida = compras.find((c) => String(c.id) === row.compraId);
        if (elegida) return { ...row, costoUnitario: String(elegida.costoUnitario) };
      }
      return row;
    });
    cambiar(values, withTotales(ajustadas));
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
        cantidadProducida: target.cantidadProducida === null ? "" : String(target.cantidadProducida),
      });
      setInsumos(
        withTotales(
          target.insumos.map((i) => ({
            materiaPrima: i.materiaPrima,
            compraId: i.compraId ? String(i.compraId) : "",
            cantidad: String(i.cantidad),
            costoUnitario: String(i.costoUnitario),
            costoTotalLinea: 0,
          }))
        )
      );
    }
    f.limpiar();
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    cambiar({ ...values, [key]: value }, insumos);
  }

  /** Props comunes de un campo de la cabecera: id, estado de error y validación al salir. */
  function campo(key: keyof FormState) {
    return { ...f.props(key), onBlur: () => f.alSalir(key, aValidar(values, insumos)) };
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  const costoTotal = insumos.reduce((sum, r) => sum + r.costoTotalLinea, 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const datos = aValidar(values, insumos);
    if (!f.alGuardar(datos)) return;
    const r = validarOrden(datos, estado, ordenId ?? null);
    if (!r.ok) return;

    setSubmitting(true);
    try {
      await onSubmit(ordenId ?? null, r.valor);
      onClose();
    } catch (err) {
      f.deServidor(err, "No se pudo guardar la orden.");
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
      <form className="rf-form" onSubmit={handleSubmit} noValidate>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="rf-field rf-field-full">
            <label htmlFor="orden-productoId">
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
            <label htmlFor="orden-fechaMaceracion">
              Fecha de maceración<span className="rf-required">*</span>
            </label>
            <CampoFecha {...campo("fechaMaceracion")} valor={values.fechaMaceracion} onCambio={(v) => update("fechaMaceracion", v)} />
            <ErrorCampo f={f} campo="fechaMaceracion" />
          </div>

          <div className="rf-field">
            <label htmlFor="orden-fechaEmbotellado">Fecha de embotellado</label>
            <CampoFecha {...campo("fechaEmbotellado")} valor={values.fechaEmbotellado} onCambio={(v) => update("fechaEmbotellado", v)} />
            <ErrorCampo f={f} campo="fechaEmbotellado" />
          </div>

          <div className="rf-field">
            <label htmlFor="orden-responsable">
              Responsable<span className="rf-required">*</span>
            </label>
            <input
              {...campo("responsable")}
              type="text"
              placeholder="Ej: Alquimia"
              maxLength={LARGO_RESPONSABLE}
              value={values.responsable}
              onChange={(e) => update("responsable", e.target.value)}
            />
            <ErrorCampo f={f} campo="responsable" />
          </div>

          <div className="rf-field">
            <label htmlFor="orden-cantidadProducida">
              Cantidad producida (botellas)
              {/* Mientras macera puede no saberse: es obligatoria al embotellar. */}
              {values.fechaEmbotellado && <span className="rf-required">*</span>}
            </label>
            <CampoNumero
              {...campo("cantidadProducida")}
              decimales={false}
              placeholder={values.fechaEmbotellado ? "Ej: 120" : "Opcional mientras macera"}
              valor={values.cantidadProducida}
              onCambio={(v) => update("cantidadProducida", v)}
            />
            <ErrorCampo f={f} campo="cantidadProducida" />
          </div>
        </div>

        <LineItemsField
          label="Insumos utilizados"
          columns={insumoColumns}
          rows={insumos}
          onChange={handleInsumosChange}
          emptyRow={emptyInsumoRow}
          f={f}
          campo="insumos"
          valoresParaValidar={() => aValidar(values, insumos)}
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
