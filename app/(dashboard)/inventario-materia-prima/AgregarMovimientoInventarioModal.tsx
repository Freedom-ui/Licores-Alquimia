"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import type { InventarioMateriaPrimaRow } from "./data";

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
  /** Saldo vigente, para avisar si un consumo lo supera. */
  saldoActual: number;
  onClose: () => void;
  onSubmit: (rowId: number, movimiento: Omit<KardexMovimiento, "id">) => void;
}) {
  const [tipo, setTipo] = useState<"entrada" | "salida">("salida");
  const [fecha, setFecha] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [puEntrada, setPuEntrada] = useState("");
  const [cantidadSecundaria, setCantidadSecundaria] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Rastrea para qué fila están cargados los valores actuales, para poder
  // resetear el formulario durante el render cuando `row` cambia.
  const [loadedRowId, setLoadedRowId] = useState<number | null>(null);

  const currentId = row?.id ?? null;
  if (currentId !== loadedRowId) {
    setLoadedRowId(currentId);
    setTipo("salida");
    setFecha("");
    setCantidad("");
    setPuEntrada("");
    setCantidadSecundaria("");
    setError(null);
  }

  function close() {
    if (submitting) return;
    onClose();
  }

  const porUnidad = unidad === "Unidades";
  const cantidadNum = Number(cantidad) || 0;
  const superaSaldo = tipo === "salida" && cantidadNum > saldoActual;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!row) return;

    if (!fecha) {
      setError('Completá "Fecha".');
      return;
    }
    const cant = Number(cantidad);
    if (!cant || cant <= 0) {
      setError('Completá "Cantidad" con un valor mayor a 0.');
      return;
    }
    if (porUnidad && !Number.isInteger(cant)) {
      setError('Esta materia prima se cuenta por unidad: "Cantidad" tiene que ser un número entero.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      onSubmit(row.id, {
        fecha,
        tipo,
        cantidad: cant,
        puEntrada: tipo === "entrada" && puEntrada ? Number(puEntrada) : undefined,
        cantidadSecundaria: tipo === "entrada" && cantidadSecundaria ? Number(cantidadSecundaria) : undefined,
      });
      onClose();
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
      <form className="rf-form" onSubmit={handleSubmit}>
        <div className="rf-fields-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rf-field">
            <label htmlFor="mpmov-tipo">Tipo</label>
            <select id="mpmov-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "entrada" | "salida")}>
              <option value="salida">Consumo / merma</option>
              <option value="entrada">Ingreso / ajuste</option>
            </select>
          </div>
          <div className="rf-field">
            <label htmlFor="mpmov-fecha">
              Fecha<span className="rf-required">*</span>
            </label>
            <input id="mpmov-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="rf-field">
            <label htmlFor="mpmov-cantidad">
              Cantidad<span className="rf-required">*</span>
            </label>
            <input
              id="mpmov-cantidad"
              type="number"
              min="0"
              step={porUnidad ? "1" : "0.01"}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </div>
          {tipo === "entrada" && (
            <>
              <div className="rf-field">
                <label htmlFor="mpmov-costo">Costo unitario</label>
                <input
                  id="mpmov-costo"
                  type="number"
                  step="0.01"
                  placeholder="Opcional"
                  value={puEntrada}
                  onChange={(e) => setPuEntrada(e.target.value)}
                />
              </div>
              <div className="rf-field rf-field-full">
                <label htmlFor="mpmov-cascara">Cantidad de cáscara (si aplica)</label>
                <input
                  id="mpmov-cascara"
                  type="number"
                  step="0.01"
                  placeholder="Opcional — solo para insumos que la generan (ej. cítricos)"
                  value={cantidadSecundaria}
                  onChange={(e) => setCantidadSecundaria(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {tipo === "entrada" && (
          <p className="rf-hint">
            Las compras a proveedores se cargan en Trazabilidad (Libro de compras): ahí queda registrado
            el proveedor y el lote, y el ingreso aparece acá solo. Usá esto solo para ajustes.
          </p>
        )}

        {superaSaldo && (
          <p className="rf-hint">
            Este consumo supera el saldo actual ({saldoActual.toLocaleString("es-AR")}). Si guardás, el
            saldo va a quedar en negativo — puede que falte cargar una compra.
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
