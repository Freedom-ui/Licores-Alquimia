"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { ClienteRow } from "./data";

const columns: Column<ClienteRow>[] = [
  {
    key: "nombre",
    label: "Nombre",
    form: { required: true, placeholder: "Ej: Almacén Don Pedro" },
  },
  {
    key: "razonSocial",
    label: "Razón social",
    form: { required: true, placeholder: "Ej: Pedro Gómez" },
  },
  {
    key: "condicionIva",
    label: "Cond. IVA",
    type: "tag",
    filterable: true,
    form: {
      required: true,
      input: "select",
      options: ["Responsable Inscripto", "Monotributo", "Consumidor Final"],
    },
  },
  { key: "telefono", label: "Teléfono", form: { placeholder: "Ej: 11-4455-2211" } },
  { key: "email", label: "Mail", type: "email" },
  { key: "domicilio", label: "Domicilio" },
];

export default function ClientesView({ initialRows }: { initialRows: ClienteRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [editingRow, setEditingRow] = useState<ClienteRow | null>(null);

  // Demo en memoria: cuando el modelo de Cliente esté en Prisma, reemplazar
  // por las llamadas reales a /api/clientes (POST, PATCH, DELETE).
  function handleCreate(values: Record<string, string | number>) {
    const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    setRows((prev) => [...prev, { id: nextId, ...values } as ClienteRow]);
  }

  function handleEditSubmit(values: Record<string, string | number>) {
    if (!editingRow) return;
    setRows((prev) =>
      prev.map((r) => (r.id === editingRow.id ? { ...r, ...values } as ClienteRow : r))
    );
  }

  function handleDelete(row: ClienteRow) {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <>
      <DataTable
        title="Clientes"
        columns={columns}
        rows={rows}
        actions={<RecordFormModal title="Clientes" columns={columns} onSubmit={handleCreate} />}
        onEditRow={setEditingRow}
        onDeleteRow={handleDelete}
      />

      <EditRecordModal
        title="Clientes"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={handleEditSubmit}
      />
    </>
  );
}
