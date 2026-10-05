"use client";

import { useMemo, useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import type { Column } from "@/app/components/data-table/types";
import CompraFormModal, { type CompraFormTarget } from "./CompraFormModal";
import RastreoLoteModal from "./RastreoLoteModal";
import FichaLoteModal from "./FichaLoteModal";
import { formatCantidad, nombreMedioPago } from "./data";
import { rastrearLoteProveedor, type TrazaContexto } from "./rastreo";
import { useStore } from "../store";

// Fila tal como se ve en el libro. Nombres y marcas se derivan en cada render
// de los catálogos (no se guardan en la compra): renombrar un proveedor o una
// materia prima se refleja solo.
type LibroRow = {
  id: number;
  fecha: string;
  materiaPrima: string;
  cantidad: string;
  lote: string;
  proveedor: string;
  form: string;
  tipo: string;
  numero: string;
  medioPago: string;
};

const PROVEEDOR = "Proveedor";

const columns: Column<LibroRow>[] = [
  { key: "id", label: "N° de OP", title: "N° de operación", type: "number", align: "center" },
  { key: "fecha", label: "Fecha", type: "date" },
  { key: "materiaPrima", label: "Materia prima", filterable: true },
  { key: "cantidad", label: "Cant.", title: "Cantidad comprada", align: "center", sortable: false },
  { key: "lote", label: "Lote producto", title: "Lote del producto comprado (del proveedor)" },
  { key: "proveedor", label: "Nombre - Razón social", group: PROVEEDOR, filterable: true },
  { key: "form", label: "Form.", title: "Forma del comprobante", group: PROVEEDOR },
  { key: "tipo", label: "Tipo", title: "Tipo de comprobante", group: PROVEEDOR, align: "center" },
  { key: "numero", label: "N°", title: "N° de comprobante", group: PROVEEDOR },
  // En la planilla eran 4 columnas marcadas con X; acá una sola con el nombre.
  { key: "medioPago", label: "Medio de pago", type: "tag", filterable: true, align: "center" },
];

export default function TrazabilidadView() {
  const {
    compras,
    proveedores,
    materiaPrima,
    ordenesProduccion,
    productosTerminados,
    operaciones,
    saveCompra,
    deleteCompra,
  } = useStore();
  const [target, setTarget] = useState<CompraFormTarget>(null);
  const [rastreoId, setRastreoId] = useState<number | null>(null);
  const [fichaAbierta, setFichaAbierta] = useState(false);

  const rows = useMemo<LibroRow[]>(
    () =>
      compras.map((c) => {
        const mp = materiaPrima.find((m) => m.id === c.materiaPrimaId);
        return {
          id: c.id,
          fecha: c.fecha,
          materiaPrima: mp?.nombre ?? "Materia prima eliminada",
          cantidad: formatCantidad(c.cantidad, mp?.unidad),
          lote: c.lote,
          proveedor: proveedores.find((p) => p.id === c.proveedorId)?.razonSocial ?? "Proveedor eliminado",
          form: c.comprobanteForm,
          tipo: c.comprobanteTipo,
          numero: c.comprobanteNumero,
          medioPago: nombreMedioPago(c.medioPago),
        };
      }),
    [compras, proveedores, materiaPrima]
  );

  const ctx: TrazaContexto = {
    compras,
    proveedores,
    materiaPrima,
    ordenes: ordenesProduccion,
    lotes: productosTerminados,
    operaciones,
  };
  const compraEnRastreo = compras.find((c) => c.id === rastreoId);
  const rastreo = compraEnRastreo ? rastrearLoteProveedor(compraEnRastreo, ctx) : null;

  return (
    <>
      <DataTable
        title="Libro de compras"
        columns={columns}
        rows={rows}
        emptyMessage="Todavía no hay compras cargadas en el libro."
        actions={
          <>
            <button type="button" className="tz-secondary-btn" onClick={() => setFichaAbierta(true)}>
              Ficha de lote
            </button>
            <button type="button" className="rf-trigger-btn" onClick={() => setTarget("new")}>
              + Nueva compra
            </button>
          </>
        }
        rowActions={(row) => (
          <button
            type="button"
            className="dt-row-action-btn"
            onClick={() => setRastreoId(row.id)}
            aria-label="Rastrear lote"
            title="Rastrear: en qué lotes se usó y a qué clientes llegó"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="M14.6 14.6 20 20" />
            </svg>
          </button>
        )}
        onEditRow={(row) => setTarget(compras.find((c) => c.id === row.id) ?? null)}
        onDeleteRow={(row) => deleteCompra(row.id)}
      />

      <CompraFormModal
        target={target}
        proveedores={proveedores}
        materiasPrimas={materiaPrima}
        onClose={() => setTarget(null)}
        onSubmit={saveCompra}
      />

      <RastreoLoteModal rastreo={rastreo} onClose={() => setRastreoId(null)} />

      {fichaAbierta && <FichaLoteModal ctx={ctx} onClose={() => setFichaAbierta(false)} />}
    </>
  );
}
