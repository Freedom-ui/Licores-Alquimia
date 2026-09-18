"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import type { OperacionRow } from "./data";

const CANALES = ["Menor", "Mayor"];
const CONDICIONES = ["Contado", "Crédito"];

const columns: Column<OperacionRow>[] = [
  {
    key: "id",
    label: "OP N°",
    type: "number",
    width: "5%",
    form: { include: false },
  },
  {
    key: "fecha",
    label: "Fecha",
    type: "date",
    width: "8%",
    form: { required: true },
  },
  {
    key: "cliente",
    label: "Cliente",
    filterable: true,
    width: "13%",
    form: { required: true, placeholder: "Ej: Cava Mitre" },
  },
  {
    key: "vendedor",
    label: "Vendedor",
    filterable: true,
    width: "11%",
    form: { required: true, placeholder: "Ej: Violino, Claudio" },
  },
  {
    key: "cantidad",
    label: "Cant.",
    title: "Cantidad",
    type: "number",
    width: "5%",
    form: { required: true },
  },
  {
    key: "descripcion",
    label: "Descripción",
    width: "19%",
    form: { required: true, placeholder: "Ej: Licor Fino de Limón 500 cc" },
  },
  {
    key: "canal",
    label: "Canal",
    type: "tag",
    filterable: true,
    width: "7%",
    form: { required: true, input: "select", options: CANALES },
  },
  {
    key: "condicion",
    label: "Condición",
    type: "tag",
    filterable: true,
    width: "8%",
    form: { required: true, input: "select", options: CONDICIONES },
  },
  {
    key: "pu",
    label: "P.U.",
    title: "Precio Unitario",
    type: "currency",
    width: "8%",
    form: { required: true },
  },
  {
    key: "subTotal",
    label: "Sub Total",
    type: "currency",
    width: "8%",
    // No se carga a mano: se calcula como cantidad * P.U. al guardar (ver abajo).
    form: { include: false },
  },
];

export default function OperacionesView({ initialRows }: { initialRows: OperacionRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [editingRow, setEditingRow] = useState<OperacionRow | null>(null);

  function withSubTotal(values: Record<string, string | number>) {
    const cantidad = Number(values.cantidad) || 0;
    const pu = Number(values.pu) || 0;
    return { ...values, subTotal: cantidad * pu };
  }

  // Demo en memoria: cuando el modelo de Operacion esté en Prisma, reemplazar
  // por las llamadas reales a /api/operaciones (POST, PATCH, DELETE).
  function handleCreate(values: Record<string, string | number>) {
    const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    setRows((prev) => [...prev, { id: nextId, ...withSubTotal(values) } as OperacionRow]);
  }

  function handleEditSubmit(values: Record<string, string | number>) {
    if (!editingRow) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === editingRow.id ? ({ ...r, ...withSubTotal(values) } as OperacionRow) : r
      )
    );
  }

  function handleDelete(row: OperacionRow) {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <>
      <DataTable
        title="Operaciones"
        columns={columns}
        rows={rows}
        actions={
          <RecordFormModal title="Operaciones" columns={columns} onSubmit={handleCreate} />
        }
        onEditRow={setEditingRow}
        onDeleteRow={handleDelete}
      />

      <EditRecordModal
        title="Operaciones"
        columns={columns}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSubmit={handleEditSubmit}
      />
    </>
  );
}