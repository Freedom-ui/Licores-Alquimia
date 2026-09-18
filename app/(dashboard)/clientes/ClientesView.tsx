"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { ClienteRow } from "./data";

const columns: Column<ClienteRow>[] = [
  {
    key: "razonSocial",
    label: "Razón social",
    width: "10%",
    form: { required: true, placeholder: "Ej: Bouchee Bebidas SRL" },
  },
  {
    key: "apellidoNombre",
    label: "Apellido y nombre",
    width: "15%",
    form: { placeholder: "Ej: Juan Pérez" },
  },
  {
    key: "condicionIva",
    label: "Cond. IVA",
    type: "tag",
    filterable: true,
    width: "9%",
    form: { placeholder: "Ej: R. Inscripto" },
  },
  {
    key: "cuit",
    label: "CUIT/CUIL",
    width: "10%",
    form: { placeholder: "Ej: 30 - 71401632 - 2" },
  },
  {
    key: "telefono",
    label: "Tel/Cel",
    width: "9%",
    form: { placeholder: "Ej: 223 - 519 - 9971" },
  },
  { key: "email", label: "Mail", type: "email", width: "15%" },
  { key: "domicilio", label: "Domicilio", width: "15%" },
  {
    key: "precioTradicional",
    label: "P. Trad.",
    title: "Precio Tradicional",
    type: "currency",
    width: "7.5%",
    form: { required: true },
  },
  {
    key: "precioPremium",
    label: "P. Prem.",
    title: "Precio Premium",
    type: "currency",
    width: "7.5%",
  },
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
