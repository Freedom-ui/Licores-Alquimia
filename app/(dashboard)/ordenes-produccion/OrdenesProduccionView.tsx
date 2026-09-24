"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import type { Column } from "@/app/components/data-table/types";
import OrdenFormModal, { type OrdenFormTarget } from "./OrdenFormModal";
import { calcularCostoTotal, type OrdenInsumo, type OrdenProduccionRow } from "./data";

const columns: Column<OrdenProduccionRow>[] = [
  { key: "id", label: "N° Orden", type: "number", width: "8%", form: { include: false } },
  { key: "producto", label: "Producto", type: "tag", filterable: true, width: "17%" },
  { key: "formato", label: "Formato", type: "tag", filterable: true, width: "10%" },
  { key: "fechaMaceracion", label: "F. Maceración", type: "date", width: "11%" },
  { key: "fechaEmbotellado", label: "F. Embotellado", type: "date", width: "11%" },
  { key: "responsable", label: "Responsable", filterable: true, width: "13%" },
  { key: "cantidadProducida", label: "Cant.", title: "Cantidad producida", type: "number", width: "8%" },
  { key: "costoTotal", label: "Costo Total", type: "currency", width: "14%" },
];

export default function OrdenesProduccionView({
  initialRows,
}: {
  initialRows: OrdenProduccionRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [target, setTarget] = useState<OrdenFormTarget>(null);

  // Demo en memoria: cuando el modelo de OrdenProduccion esté en Prisma,
  // reemplazar por las llamadas reales a /api/ordenes-produccion.
  function handleSubmit(
    id: number | null,
    values: {
      producto: string;
      formato: string;
      fechaMaceracion: string;
      fechaEmbotellado: string | null;
      responsable: string;
      cantidadProducida: number;
      insumos: OrdenInsumo[];
    }
  ) {
    const costoTotal = calcularCostoTotal(values.insumos);

    if (id === null) {
      const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
      setRows((prev) => [...prev, { id: nextId, ...values, costoTotal }]);
    } else {
      setRows((prev) => prev.map((r) => (r.id === id ? { id, ...values, costoTotal } : r)));
    }
  }

  function handleDelete(row: OrdenProduccionRow) {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <>
      <DataTable
        title="Órdenes de producción"
        columns={columns}
        rows={rows}
        actions={
          <button type="button" className="rf-trigger-btn" onClick={() => setTarget("new")}>
            + Nueva orden
          </button>
        }
        onEditRow={(row) => setTarget(row)}
        onDeleteRow={handleDelete}
      />

      <OrdenFormModal target={target} onClose={() => setTarget(null)} onSubmit={handleSubmit} />
    </>
  );
}
