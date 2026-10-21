"use client";

import { useState } from "react";
import DataTable from "@/app/components/data-table/DataTable";
import RecordFormModal from "@/app/components/data-table/RecordFormModal";
import EditRecordModal from "@/app/components/data-table/EditRecordModal";
import type { Column } from "@/app/components/data-table/types";
import { DatosFicha, SeccionFicha, TablaFicha } from "@/app/components/data-table/FichaBloques";
import { formatCellValue } from "@/app/components/data-table/format";
import { fmtNumero } from "@/app/components/data-table/validacion";
import { LARGO_EMAIL, LARGO_NOMBRE } from "@/app/components/data-table/validacion";
import type { ProveedorRow } from "./data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import { formatCantidad, formatComprobante, type CompraRow } from "../trazabilidad/data";
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
    maxWidth: null,
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
    maxWidth: null,
    form: { placeholder: "223-4567890", maxLength: 25 },
  },
  {
    key: "cbu",
    label: "CBU",
    width: "13%",
    maxWidth: null,
    form: { placeholder: "Opcional (22 números)", maxLength: 26 },
  },
  {
    key: "alias",
    label: "Alias",
    width: "14%",
    maxWidth: null,
    form: { placeholder: "Opcional", maxLength: 20 },
  },
];

/** Ficha del proveedor: lo que se le compró (resumen y todas las compras). */
function ComprasDelProveedor({ proveedor, compras, materias }: { proveedor: ProveedorRow; compras: CompraRow[]; materias: MateriaPrimaRow[] }) {
  const suyas = compras.filter((c) => c.proveedorId === proveedor.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  const total = suyas.reduce((s, c) => s + c.cantidad * c.costoUnitario, 0);
  const materia = (id: number) => materias.find((m) => m.id === id);
  return (
    <SeccionFicha titulo="Compras (Libro de compras)">
      <DatosFicha
        items={[
          ["Compras", fmtNumero(suyas.length)],
          ["Total comprado", formatCellValue(total, "currency")],
          ["Última compra", suyas.length ? formatCellValue(suyas[0].fecha, "date") : "—"],
          ["Materias primas", fmtNumero(new Set(suyas.map((c) => c.materiaPrimaId)).size)],
        ]}
      />
      <TablaFicha
        columnas={[
          { titulo: "OP N°", centrar: true },
          { titulo: "Fecha", centrar: true },
          { titulo: "Materia prima" },
          { titulo: "Cantidad", centrar: true },
          { titulo: "Total", centrar: true },
          { titulo: "Comprobante" },
        ]}
        filas={suyas.map((c) => [
          c.id,
          formatCellValue(c.fecha, "date"),
          materia(c.materiaPrimaId)?.nombre ?? "—",
          formatCantidad(c.cantidad, materia(c.materiaPrimaId)?.unidad),
          formatCellValue(c.cantidad * c.costoUnitario, "currency"),
          formatComprobante(c) || "—",
        ])}
        enlaces={suyas.map((c) => `/trazabilidad?foco=${c.id}`)}
        ayuda="Ver esta compra en el Libro de compras (Trazabilidad)"
        vacio="Todavía no tiene compras en el Libro de compras."
      />
    </SeccionFicha>
  );
}

export default function ProveedoresView() {
  const store = useStore();
  const { proveedores, compras, materiaPrima, addProveedor, updateProveedor, deleteProveedor, eliminarFilas } = store;
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
        onDeleteRows={(filas) => eliminarFilas(filas, (r) => ({ tipo: "deleteProveedor", id: r.id }))}
        ficha={{
          titulo: (r) => r.razonSocial,
          extra: (r) => <ComprasDelProveedor proveedor={r} compras={compras} materias={materiaPrima} />,
        }}
        anchoMaximo
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
