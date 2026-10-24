"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { deudaPorProveedor, formatCantidad, formatComprobante, montoCompra, type CompraRow } from "../trazabilidad/data";
import { useStore } from "../store";
import { validarProveedor } from "../_dominio/reglas";

/** Proveedor con lo que se le debe (compras pendientes de pago); null = nada. */
type ProveedorConDeuda = ProveedorRow & { deuda: number | null };

const columns: Column<ProveedorConDeuda>[] = [
  {
    key: "razonSocial",
    label: "Razón social",
    width: "13%",
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
    width: "13%",
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
  {
    key: "deuda",
    label: "Deuda",
    title: "Deuda pendiente (compras sin pagar)",
    type: "currency",
    width: "8%",
    form: { include: false },
  },
];

/** Ficha del proveedor: lo que se le compró (resumen y todas las compras). */
function ComprasDelProveedor({ proveedor, compras, materias }: { proveedor: ProveedorRow; compras: CompraRow[]; materias: MateriaPrimaRow[] }) {
  const suyas = compras.filter((c) => c.proveedorId === proveedor.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  const total = suyas.reduce((s, c) => s + montoCompra(c), 0);
  const deuda = deudaPorProveedor(suyas).get(proveedor.id);
  const materia = (id: number) => materias.find((m) => m.id === id);
  return (
    <SeccionFicha titulo="Compras (Libro de compras)">
      <DatosFicha
        items={[
          ["Compras", fmtNumero(suyas.length)],
          ["Total comprado", formatCellValue(total, "currency")],
          ["Última compra", suyas.length ? formatCellValue(suyas[0].fecha, "date") : "—"],
          ["Materias primas", fmtNumero(new Set(suyas.map((c) => c.materiaPrimaId)).size)],
          ["Deuda pendiente", deuda ? formatCellValue(deuda.total, "currency") : "Sin deuda"],
          ...(deuda
            ? ([
                ["Compras impagas", fmtNumero(deuda.cantidad)],
                ["Pendiente desde", formatCellValue(deuda.masAntigua, "date")],
              ] as [string, string][])
            : []),
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
          { titulo: "Pago", centrar: true },
        ]}
        filas={suyas.map((c) => [
          c.id,
          formatCellValue(c.fecha, "date"),
          materia(c.materiaPrimaId)?.nombre ?? "—",
          formatCantidad(c.cantidad, materia(c.materiaPrimaId)?.unidad),
          formatCellValue(montoCompra(c), "currency"),
          formatComprobante(c) || "—",
          c.fechaPago ? formatCellValue(c.fechaPago, "date") : <span className="dt-tag" data-valor="Pendiente">Pendiente</span>,
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
  const [editingRow, setEditingRow] = useState<ProveedorConDeuda | null>(null);
  // ?foco=<id> (desde la alerta de pagos atrasados del Panel): muestra ese proveedor.
  const foco = Number(useSearchParams().get("foco")) || null;
  const filas = useMemo<ProveedorConDeuda[]>(() => {
    const deudas = deudaPorProveedor(compras);
    return proveedores.map((p) => ({ ...p, deuda: deudas.get(p.id)?.total ?? null }));
  }, [proveedores, compras]);

  return (
    <>
      <DataTable
        title="Proveedores"
        columns={columns}
        rows={filas}
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
        enfocar={foco}
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
