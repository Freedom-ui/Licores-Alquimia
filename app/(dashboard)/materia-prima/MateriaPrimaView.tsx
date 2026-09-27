"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { MateriaPrimaRow } from "./data";
import { UNIDADES_MEDIDA } from "./data";
import { useStore } from "../store";

const columns: Column<MateriaPrimaRow>[] = [
  {
    key: "nombre",
    label: "Nombre",
    width: "72%",
    form: { required: true, placeholder: "Ej: Etiq. LIM x 500 cc" },
  },
  {
    key: "unidad",
    label: "Unidad",
    type: "tag",
    filterable: true,
    width: "20%",
    form: { required: true, input: "select", options: UNIDADES_MEDIDA },
  },
];

export default function MateriaPrimaView() {
  const { materiaPrima, addMateriaPrima, updateMateriaPrima, deleteMateriaPrima } = useStore();
  const [editingRow, setEditingRow] = useState<MateriaPrimaRow | null>(null);

  return (
    <>
      <DataTable
        title="Materia prima"
        columns={columns}
        rows={materiaPrima}
        actions={
          <RecordFormModal title="Materia prima" columns={columns} onSubmit={addMateriaPrima} />
        }
        onEditRow={setEditingRow}
        onDeleteRow={(row) => deleteMateriaPrima(row.id)}
      />

      <EditRecordModal
        title="Materia prima"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={(v) => {
          if (editingRow) updateMateriaPrima(editingRow.id, v);
        }}
      />
    </>
  );
}
