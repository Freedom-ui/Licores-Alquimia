"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import { DatosFicha, SeccionFicha, TablaFicha } from "@/app/components/data-table/FichaBloques";
import { formatCellValue } from "@/app/components/data-table/format";
import { fmtNumero } from "@/app/components/data-table/validacion";
import { LARGO_DOMICILIO, LARGO_EMAIL, LARGO_NOMBRE } from "@/app/components/data-table/validacion";
import { CONDICIONES_IVA, type ClienteRow } from "./data";
import type { OperacionRow } from "../operaciones/data";
import { useStore } from "../store";
import { validarCliente } from "../_dominio/reglas";

const columns: Column<ClienteRow>[] = [
  {
    key: "razonSocial",
    label: "Razón social",
    width: "20%",
    form: { required: true, placeholder: "Ej: Bouchee Bebidas SRL", maxLength: LARGO_NOMBRE },
  },
  {
    key: "apellidoNombre",
    label: "Apellido y nombre",
    width: "12%",
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
    maxWidth: null,
    // Obligatorio salvo para Consumidor Final (lo decide validarCliente).
    form: { placeholder: "Ej: 30-71401632-2", maxLength: 20 },
  },
  {
    key: "telefono",
    label: "Tel/Cel",
    width: "8%",
    maxWidth: null,
    form: { placeholder: "Ej: 223 - 519 - 9971", maxLength: 25 },
  },
  { key: "email", label: "Mail", type: "email", width: "14%", form: { maxLength: LARGO_EMAIL } },
  { key: "domicilio", label: "Domicilio", width: "15%", form: { maxLength: LARGO_DOMICILIO } },
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

/** Ficha del cliente: sus ventas (resumen y todas, de la más nueva a la más vieja). */
function VentasDelCliente({ cliente, operaciones }: { cliente: ClienteRow; operaciones: OperacionRow[] }) {
  const ventas = operaciones.filter((o) => o.clienteId === cliente.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  const total = ventas.reduce((s, o) => s + o.subTotal, 0);
  const botellas = ventas.reduce((s, o) => s + o.cantidad, 0);
  return (
    <SeccionFicha titulo="Ventas">
      <DatosFicha
        items={[
          ["Ventas", fmtNumero(ventas.length)],
          ["Botellas", fmtNumero(botellas)],
          ["Total facturado", formatCellValue(total, "currency")],
          ["Última compra", ventas.length ? formatCellValue(ventas[0].fecha, "date") : "—"],
        ]}
      />
      <TablaFicha
        columnas={[{ titulo: "OP N°", centrar: true }, { titulo: "Fecha", centrar: true }, { titulo: "Producto" }, { titulo: "Cant.", centrar: true }, { titulo: "Sub total", centrar: true }]}
        filas={ventas.map((o) => [o.id, formatCellValue(o.fecha, "date"), o.descripcion, fmtNumero(o.cantidad), formatCellValue(o.subTotal, "currency")])}
        enlaces={ventas.map((o) => `/operaciones?foco=${o.id}`)}
        ayuda="Ver esta venta en Operaciones"
        vacio="Todavía no tiene ventas."
      />
    </SeccionFicha>
  );
}

export default function ClientesView() {
  const store = useStore();
  const { clientes, operaciones, addCliente, updateCliente, deleteCliente, eliminarFilas } = store;
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
        onDeleteRows={(filas) => eliminarFilas(filas, (r) => ({ tipo: "deleteCliente", id: r.id }))}
        ficha={{ titulo: (r) => r.razonSocial, extra: (r) => <VentasDelCliente cliente={r} operaciones={operaciones} /> }}
        anchoMaximo
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
