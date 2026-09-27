"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { ProveedorRow } from "./data";
import { useStore } from "../store";

// Acepta "30-71234567-8" y "30 - 71234567 - 8".
const CUIT_PATTERN = "\\d{2}\\s*-\\s*\\d{8}\\s*-\\s*\\d{1}";

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
    width: "8%",
    form: { required: true, placeholder: "Nombre de la persona de contacto" },
  },
  {
    key: "producto",
    label: "Producto",
    type: "tag",
    filterable: true,
    width: "11%",
    form: { required: true, placeholder: "Ej: Etiquetas, Botellas" },
  },
  {
    key: "cuitCuil",
    label: "CUIT/CUIL",
    width: "11%",
    form: {
      required: true,
      placeholder: "30-71234567-8",
      pattern: CUIT_PATTERN,
      patternMessage: "Formato esperado: XX-XXXXXXXX-X",
    },
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    width: "19%",
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
    width: "13%",
    form: { required: false, placeholder: "Opcional" },
  },
  {
    key: "alias",
    label: "Alias",
    width: "14%",
    form: { required: false, placeholder: "Opcional" },
  },
];

export default function ProveedoresView() {
  const { proveedores, addProveedor, updateProveedor, deleteProveedor } = useStore();
  const [editingRow, setEditingRow] = useState<ProveedorRow | null>(null);

  return (
    <>
      <DataTable
        title="Proveedores"
        columns={columns}
        rows={proveedores}
        actions={<RecordFormModal title="Proveedores" columns={columns} onSubmit={addProveedor} />}
        onEditRow={setEditingRow}
        onDeleteRow={(row) => deleteProveedor(row.id)}
      />
      <EditRecordModal
        title="Proveedores"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={(v) => {
          if (editingRow) updateProveedor(editingRow.id, v);
        }}
      />
    </>
  );
}
