"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import { LARGO_DOMICILIO, LARGO_EMAIL, LARGO_NOMBRE } from "@/app/components/data-table/validacion";
import { CONDICIONES_IVA, type ClienteRow } from "./data";
import { useStore } from "../store";
import { validarCliente } from "../_dominio/reglas";

const columns: Column<ClienteRow>[] = [
  {
    key: "razonSocial",
    label: "Razón social",
    width: "12%",
    form: { required: true, placeholder: "Ej: Bouchee Bebidas SRL", maxLength: LARGO_NOMBRE },
  },
  {
    key: "apellidoNombre",
    label: "Apellido y nombre",
    width: "16%",
    form: { placeholder: "Ej: Juan Pérez", maxLength: LARGO_NOMBRE },
  },
  {
    key: "condicionIva",
    label: "Cond. IVA",
    type: "tag",
    filterable: true,
    width: "9%",
    form: { required: true, input: "select", options: CONDICIONES_IVA },
  },
  {
    key: "cuit",
    label: "CUIT/CUIL",
    width: "8%",
    // Obligatorio salvo para Consumidor Final (lo decide validarCliente).
    form: { placeholder: "Ej: 30-71401632-2", maxLength: 20 },
  },
  {
    key: "telefono",
    label: "Tel/Cel",
    width: "8%",
    form: { placeholder: "Ej: 223 - 519 - 9971", maxLength: 25 },
  },
  { key: "email", label: "Mail", type: "email", width: "15%", form: { maxLength: LARGO_EMAIL } },
  { key: "domicilio", label: "Domicilio", width: "18%", form: { maxLength: LARGO_DOMICILIO } },
  {
    key: "precioTradicional",
    label: "P. Trad.",
    title: "Precio Tradicional",
    type: "currency",
    width: "7%",
    form: { required: true },
  },
  {
    key: "precioPremium",
    label: "P. Prem.",
    title: "Precio Premium",
    type: "currency",
    width: "7%",
    form: { placeholder: "Opcional" },
  },
];

export default function ClientesView() {
  const store = useStore();
  const { clientes, addCliente, updateCliente, deleteCliente } = store;
  const [editingRow, setEditingRow] = useState<ClienteRow | null>(null);

  return (
    <>
      <DataTable
        title="Clientes"
        columns={columns}
        rows={clientes}
        actions={
          <RecordFormModal
            title="Clientes"
            columns={columns}
            validar={(v) => validarCliente(v, store, null)}
            onSubmit={addCliente}
          />
        }
        onEditRow={setEditingRow}
        onDeleteRow={(row) => deleteCliente(row.id)}
      />

      <EditRecordModal
        title="Clientes"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        validar={(v) => validarCliente(v, store, editingRow?.id ?? null)}
        onSubmit={async (v) => {
          if (editingRow) await updateCliente(editingRow.id, v);
        }}
      />
    </>
  );
}
