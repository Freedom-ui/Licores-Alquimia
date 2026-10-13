"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import { LARGO_EMAIL, LARGO_NOMBRE } from "@/app/components/data-table/validacion";
import type { ProveedorRow } from "./data";
import { useStore } from "../store";
import { validarProveedor } from "../_dominio/reglas";

const columns: Column<ProveedorRow>[] = [
  {
    key: "razonSocial",
    label: "Razón social",
    width: "15%",
    form: { required: true, placeholder: "Ej: Destilería del Sur S.A.", maxLength: LARGO_NOMBRE },
  },
  {
    key: "contacto",
    label: "Contacto",
    width: "8%",
    form: { required: true, placeholder: "Nombre de la persona de contacto", maxLength: LARGO_NOMBRE },
  },
  {
    key: "producto",
    label: "Producto",
    type: "tag",
    filterable: true,
    width: "11%",
    form: { required: true, placeholder: "Ej: Etiquetas, Botellas", maxLength: LARGO_NOMBRE },
  },
  {
    key: "cuitCuil",
    label: "CUIT/CUIL",
    width: "11%",
    // CUIT, email y teléfono pueden no tenerse al cargarlo: si se completan, se validan.
    form: { placeholder: "Ej: 30-71234567-8", maxLength: 20 },
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    width: "19%",
    form: { placeholder: "contacto@proveedor.com", maxLength: LARGO_EMAIL },
  },
  {
    key: "telefono",
    label: "Tel/Cel",
    width: "9%",
    form: { placeholder: "223-4567890", maxLength: 25 },
  },
  {
    key: "cbu",
    label: "CBU",
    width: "13%",
    form: { placeholder: "Opcional (22 números)", maxLength: 26 },
  },
  {
    key: "alias",
    label: "Alias",
    width: "14%",
    form: { placeholder: "Opcional", maxLength: 20 },
  },
];

export default function ProveedoresView() {
  const store = useStore();
  const { proveedores, addProveedor, updateProveedor, deleteProveedor } = store;
  const [editingRow, setEditingRow] = useState<ProveedorRow | null>(null);

  return (
    <>
      <DataTable
        title="Proveedores"
        columns={columns}
        rows={proveedores}
        actions={
          <RecordFormModal
            title="Proveedores"
            columns={columns}
            validar={(v) => validarProveedor(v, store, null)}
            onSubmit={addProveedor}
          />
        }
        onEditRow={setEditingRow}
        onDeleteRow={(row) => deleteProveedor(row.id)}
      />
      <EditRecordModal
        title="Proveedores"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        validar={(v) => validarProveedor(v, store, editingRow?.id ?? null)}
        onSubmit={async (v) => {
          if (editingRow) await updateProveedor(editingRow.id, v);
        }}
      />
    </>
  );
}
