"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { ProductoRow } from "./data";
import { useStore } from "../store";

const columns: Column<ProductoRow>[] = [
  {
    key: "nombre",
    label: "Nombre",
    width: "28%",
    form: { required: true, placeholder: "Ej: Licor Fino de Limón" },
  },
  {
    key: "formato",
    label: "Formato",
    type: "tag",
    filterable: true,
    width: "18%",
    form: { required: true, placeholder: "Ej: 750 cc Premium" },
  },
  {
    key: "codigoBarras",
    label: "Código de barras",
    type: "barcode",
    align: "center",
    width: "26%",
    form: { required: true, placeholder: "Ej: 2611122201TRA" },
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

export default function ProductosView() {
  const { productos, addProducto, updateProducto, deleteProducto } = useStore();
  const [editingRow, setEditingRow] = useState<ProductoRow | null>(null);

  return (
    <>
      <DataTable
        title="Productos"
        columns={columns}
        rows={productos}
        actions={<RecordFormModal title="Productos" columns={columns} onSubmit={addProducto} />}
        onEditRow={setEditingRow}
        onDeleteRow={(row) => deleteProducto(row.id)}
      />
      <EditRecordModal
        title="Productos"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={(v) => {
          if (editingRow) updateProducto(editingRow.id, v);
        }}
      />
    </>
  );
}
