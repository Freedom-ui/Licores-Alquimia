"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { MateriaPrimaRow } from "./data";
import { REPOSICIONES, UNIDADES_MEDIDA } from "./data";
import { LARGO_NOMBRE } from "@/app/components/data-table/validacion";
import { useStore } from "../store";
import { validarMateriaPrima } from "../_dominio/reglas";

const columns: Column<MateriaPrimaRow>[] = [
  {
    key: "nombre",
    label: "Nombre",
    width: "52%",
    form: { required: true, placeholder: "Ej: Etiq. LIM x 500 cc", maxLength: LARGO_NOMBRE },
  },
  {
    key: "unidad",
    label: "Unidad",
    type: "tag",
    filterable: true,
    width: "20%",
    form: { required: true, input: "select", options: UNIDADES_MEDIDA },
  },
  {
    key: "reposicion",
    label: "Compra",
    title: "Con stock: se repone cuando baja (avisa si no alcanza para otra orden). Para cada orden: se compra fresca antes de macerar (cítricos, hierbas), sin aviso de reposición.",
    type: "tag",
    filterable: true,
    width: "20%",
    form: { required: true, input: "select", options: REPOSICIONES },
  },
];

export default function MateriaPrimaView() {
  const store = useStore();
  const { materiaPrima, addMateriaPrima, updateMateriaPrima, deleteMateriaPrima, eliminarFilas } = store;
  const [editingRow, setEditingRow] = useState<MateriaPrimaRow | null>(null);

  return (
    <>
      <DataTable
        title="Materia prima"
        columns={columns}
        rows={materiaPrima}
        actions={
          <RecordFormModal
            title="Materia prima"
            columns={columns}
            validar={(v) => validarMateriaPrima(v, store, null)}
            onSubmit={addMateriaPrima}
          />
        }
        onEditRow={setEditingRow}
        onDeleteRow={(row) => deleteMateriaPrima(row.id)}
        onDeleteRows={(filas) => eliminarFilas(filas, (r) => ({ tipo: "deleteMateriaPrima", id: r.id }))}
        anchoMaximo
      />

      <EditRecordModal
        title="Materia prima"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        validar={(v) => validarMateriaPrima(v, store, editingRow?.id ?? null)}
        onSubmit={async (v) => {
          if (editingRow) await updateMateriaPrima(editingRow.id, v);
        }}
      />
    </>
  );
}
