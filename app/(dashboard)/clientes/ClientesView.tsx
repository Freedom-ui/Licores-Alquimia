"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { ClienteRow } from "./data";
import { useStore } from "../store";

const CONDICIONES_IVA = ["R. Inscripto", "Monotributo", "Exento", "Consumidor Final"];
// Acepta "30-71401632-2" y "30 - 71401632 - 2" (ambos formatos aparecen en los datos reales).
const CUIT_PATTERN = "\\d{2}\\s*-\\s*\\d{8}\\s*-\\s*\\d{1}";

const columns: Column<ClienteRow>[] = [
  {
    key: "razonSocial",
    label: "Razón social",
    width: "12%",
    form: { required: true, placeholder: "Ej: Bouchee Bebidas SRL" },
  },
  {
    key: "apellidoNombre",
    label: "Apellido y nombre",
    width: "16%",
    form: { placeholder: "Ej: Juan Pérez" },
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
    form: {
      required: true,
      placeholder: "Ej: 30-71401632-2",
      pattern: CUIT_PATTERN,
      patternMessage: "Formato esperado: XX-XXXXXXXX-X",
    },
  },
  {
    key: "telefono",
    label: "Tel/Cel",
    width: "8%",
    form: { placeholder: "Ej: 223 - 519 - 9971" },
  },
  { key: "email", label: "Mail", type: "email", width: "15%" },
  { key: "domicilio", label: "Domicilio", width: "18%" },
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
  },
];

export default function ClientesView() {
  const { clientes, addCliente, updateCliente, deleteCliente } = useStore();
  const [editingRow, setEditingRow] = useState<ClienteRow | null>(null);

  return (
    <>
      <DataTable
        title="Clientes"
        columns={columns}
        rows={clientes}
        actions={<RecordFormModal title="Clientes" columns={columns} onSubmit={addCliente} />}
        onEditRow={setEditingRow}
        onDeleteRow={(row) => deleteCliente(row.id)}
      />

      <EditRecordModal
        title="Clientes"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={(v) => {
          if (editingRow) updateCliente(editingRow.id, v);
        }}
      />
    </>
  );
}
