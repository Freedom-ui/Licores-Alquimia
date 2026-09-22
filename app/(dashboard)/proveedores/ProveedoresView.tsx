"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { ProveedorRow } from "./data";

const columns: Column<ProveedorRow>[] = [
  {
    key: "razonSocial",
    label: "Razón social",
    width: "15%",
    form: { required: true, placeholder: "Ej: Destilería del Sur S.A." },
  },
  {
    key: "contacto",
    label: "Contacto",
    width: "11%",
    form: { required: true, placeholder: "Nombre de la persona de contacto" },
  },
  {
    key: "producto",
    label: "Producto",
    type: "tag",
    filterable: true,
    width: "9%",
    form: { required: true, placeholder: "Ej: Etiquetas, Botellas" },
  },
  {
    key: "cuitCuil",
    label: "CUIT/CUIL",
    width: "11%",
    form: { required: true, placeholder: "30-71234567-8" },
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    width: "14%",
    form: { required: true, placeholder: "contacto@proveedor.com" },
  },
  {
    key: "telefono",
    label: "Tel/Cel",
    width: "9%",
    form: { required: true, placeholder: "223-4567890" },
  },
  {
    key: "cbu",
    label: "CBU",
    width: "17%",
    form: { required: false, placeholder: "Opcional" },
  },
  {
    key: "alias",
    label: "Alias",
    width: "14%",
    form: { required: false, placeholder: "Opcional" },
  },
];

export default function ProveedoresView({ initialRows }: { initialRows: ProveedorRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [editingRow, setEditingRow] = useState<ProveedorRow | null>(null);

  // Demo en memoria: cuando el modelo de Proveedor tenga estos campos en
  // Prisma, reemplazar por las llamadas reales a /api/proveedores.
  function handleCreate(values: Record<string, string | number>) {
    const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    setRows((prev) => [...prev, { id: nextId, ...values } as ProveedorRow]);
  }

  function handleEditSubmit(values: Record<string, string | number>) {
    if (!editingRow) return;
    setRows((prev) =>
      prev.map((r) => (r.id === editingRow.id ? { ...r, ...values } as ProveedorRow : r))
    );
  }

  function handleDelete(row: ProveedorRow) {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <>
      <DataTable
        title="Proveedores"
        columns={columns}
        rows={rows}
        actions={<RecordFormModal title="Proveedores" columns={columns} onSubmit={handleCreate} />}
        onEditRow={setEditingRow}
        onDeleteRow={handleDelete}
      />
      <EditRecordModal
        title="Proveedores"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={handleEditSubmit}
      />
    </>
  );
}