"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import type { Column } from "@/app/components/data-table/types";
import type { OperacionRow } from "./data";
import OperacionFormModal, { type OperacionFormTarget } from "./OperacionFormModal";
import { useStore } from "../store";

const columns: Column<OperacionRow>[] = [
  { key: "id", label: "OP N°", type: "number", width: "5%" },
  { key: "fecha", label: "Fecha", type: "date", width: "8%" },
  { key: "cliente", label: "Cliente", filterable: true, width: "13%" },
  { key: "vendedor", label: "Vendedor", filterable: true, width: "11%" },
  { key: "cantidad", label: "Cant.", title: "Cantidad", type: "number", width: "5%" },
  { key: "descripcion", label: "Descripción", width: "16%" },
  { key: "canal", label: "Canal", type: "tag", filterable: true, width: "7%" },
  { key: "condicion", label: "Condición", type: "tag", filterable: true, width: "11%" },
  { key: "pu", label: "P.U.", title: "Precio Unitario", type: "currency", width: "8%" },
  { key: "subTotal", label: "Sub Total", type: "currency", width: "8%" },
];

export default function OperacionesView() {
  const { operaciones, clientes, addOperacion, updateOperacion, deleteOperacion } = useStore();
  const [target, setTarget] = useState<OperacionFormTarget>(null);

  return (
    <>
      <DataTable
        title="Operaciones"
        columns={columns}
        rows={operaciones}
        actions={
          <button type="button" className="rf-trigger-btn" onClick={() => setTarget("new")}>
            + Nuevo
          </button>
        }
        onEditRow={(row) => setTarget(row)}
        onDeleteRow={(row) => deleteOperacion(row.id)}
      />

      <OperacionFormModal
        target={target}
        clientes={clientes}
        onClose={() => setTarget(null)}
        onSubmit={(id, values) => (id === null ? addOperacion(values) : updateOperacion(id, values))}
      />
    </>
  );
}
