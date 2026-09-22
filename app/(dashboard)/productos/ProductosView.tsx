"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { ProductoRow } from "./data";

const columns: Column<ProductoRow>[] = [
  {
    key: "nombre",
    label: "Nombre",
    width: "28%",
    form: { required: true, placeholder: "Ej: Ron Trapiche" },
  },
  {
    key: "formato",
    label: "Formato",
    type: "tag",
    filterable: true,
    width: "18%",
    form: { required: true, placeholder: "Ej: 750cc Premium" },
  },
  {
    key: "codigoBarras",
    label: "Código de barras",
    type: "barcode",
    width: "26%",
    form: { required: true, placeholder: "Ej: TRA0750" },
  },
    {
    key: "precioUnitario",
    label: "P. Unitario",
    title: "Precio unitario",
    type: "currency",
    width: "14%",
    form: { required: true },
  },
];

export default function ProductosView({ initialRows }: { initialRows: ProductoRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [editingRow, setEditingRow] = useState<ProductoRow | null>(null);

  // Demo en memoria: cuando el modelo de Producto tenga estos campos en Prisma,
  // reemplazar por las llamadas reales a /api/productos (POST, PATCH, DELETE).
  function handleCreate(values: Record<string, string | number>) {
    const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    setRows((prev) => [...prev, { id: nextId, ...values } as ProductoRow]);
  }

  function handleEditSubmit(values: Record<string, string | number>) {
    if (!editingRow) return;
    setRows((prev) =>
      prev.map((r) => (r.id === editingRow.id ? { ...r, ...values } as ProductoRow : r))
    );
  }

  function handleDelete(row: ProductoRow) {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <>
      <DataTable
        title="Productos"
        columns={columns}
        rows={rows}
        actions={<RecordFormModal title="Productos" columns={columns} onSubmit={handleCreate} />}
        onEditRow={setEditingRow}
        onDeleteRow={handleDelete}
      />
      <EditRecordModal
        title="Productos"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={handleEditSubmit}
      />
    </>
  );
}