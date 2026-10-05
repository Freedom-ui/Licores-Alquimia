"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import type { Column } from "@/app/components/data-table/types";
import OrdenFormModal, { type OrdenFormTarget } from "./OrdenFormModal";
import type { OrdenProduccionRow } from "./data";
import { useStore } from "../store";

const columns: Column<OrdenProduccionRow>[] = [
  { key: "id", label: "N° Orden", type: "number", width: "8%" },
  { key: "producto", label: "Producto", type: "tag", filterable: true, width: "17%" },
  { key: "formato", label: "Formato", type: "tag", filterable: true, width: "10%" },
  { key: "fechaMaceracion", label: "F. Maceración", type: "date", width: "11%" },
  { key: "fechaEmbotellado", label: "F. Embotellado", type: "date", width: "11%" },
  { key: "responsable", label: "Responsable", filterable: true, width: "13%" },
  { key: "cantidadProducida", label: "Cant.", title: "Cantidad producida", type: "number", width: "8%" },
  { key: "costoTotal", label: "Costo Total", type: "currency", width: "14%" },
];

export default function OrdenesProduccionView() {
  const { ordenesProduccion, productos, materiaPrima, compras, saveOrden, deleteOrden } = useStore();
  const [target, setTarget] = useState<OrdenFormTarget>(null);

  return (
    <>
      <DataTable
        title="Órdenes de producción"
        columns={columns}
        rows={ordenesProduccion}
        actions={
          <button type="button" className="rf-trigger-btn" onClick={() => setTarget("new")}>
            + Nueva orden
          </button>
        }
        onEditRow={(row) => setTarget(row)}
        onDeleteRow={(row) => deleteOrden(row.id)}
      />

      <OrdenFormModal
        target={target}
        productos={productos}
        materiasPrimas={materiaPrima}
        compras={compras}
        ordenes={ordenesProduccion}
        onClose={() => setTarget(null)}
        onSubmit={saveOrden}
      />
    </>
  );
}
