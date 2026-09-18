"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { MateriaPrimaRow } from "./data";

const columns: Column<MateriaPrimaRow>[] = [
  {
    key: "nombre",
    label: "Nombre",
    width: "92%",
    form: { required: true, placeholder: "Ej: Etiq. LIM x 500 cc" },
  },
];

export default function MateriaPrimaView({ initialRows }: { initialRows: MateriaPrimaRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [editingRow, setEditingRow] = useState<MateriaPrimaRow | null>(null);

  // Demo en memoria: cuando el modelo de MateriaPrima esté en Prisma, reemplazar
  // por las llamadas reales a /api/materia-prima (POST, PATCH, DELETE).
  function handleCreate(values: Record<string, string | number>) {
    const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    setRows((prev) => [...prev, { id: nextId, ...values } as MateriaPrimaRow]);
  }

  function handleEditSubmit(values: Record<string, string | number>) {
    if (!editingRow) return;
    setRows((prev) =>
      prev.map((r) => (r.id === editingRow.id ? { ...r, ...values } as MateriaPrimaRow : r))
    );
  }

  function handleDelete(row: MateriaPrimaRow) {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <>
      <DataTable
        title="Materia prima"
        columns={columns}
        rows={rows}
        actions={
          <RecordFormModal title="Materia prima" columns={columns} onSubmit={handleCreate} />
        }
        onEditRow={setEditingRow}
        onDeleteRow={handleDelete}
      />

      <EditRecordModal
        title="Materia prima"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={handleEditSubmit}
      />
    </>
  );
}