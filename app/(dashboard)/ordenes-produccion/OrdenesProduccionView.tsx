"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DataTable from "@/app/components/data-table/DataTable";
import type { Column } from "@/app/components/data-table/types";
import { DatosFicha, SeccionFicha, TablaFicha } from "@/app/components/data-table/FichaBloques";
import { formatCellValue } from "@/app/components/data-table/format";
import { fmtNumero } from "@/app/components/data-table/validacion";
import OrdenFormModal, { type OrdenFormTarget } from "./OrdenFormModal";
import type { OrdenProduccionRow } from "./data";
import { useStore } from "../store";
import type { Estado } from "../_dominio/acciones";
import { saldoLote } from "../_dominio/sync";
import { formatCantidad, identificadorCompra } from "../trazabilidad/data";

const columns: Column<OrdenProduccionRow>[] = [
  { key: "id", label: "N° Orden", type: "number", width: "8%" },
  { key: "producto", label: "Producto", type: "tag", filterable: true, width: "17%" },
  { key: "formato", label: "Formato", type: "tag", filterable: true, width: "10%" },
  { key: "fechaMaceracion", label: "F. Maceración", type: "date", width: "11%" },
  { key: "fechaEmbotellado", label: "F. Embotellado", type: "date", width: "11%" },
  { key: "responsable", label: "Responsable", filterable: true, width: "13%" },
  { key: "cantidadProducida", label: "Cant.", title: "Cantidad producida", type: "number", width: "8%" },
  { key: "costoTotal", label: "Costo Total", type: "currency", width: "14%" },
];

/** Ficha de la orden: sus insumos (con la compra de la que sale cada uno) y el lote que generó. */
function DetalleOrden({ orden, e }: { orden: OrdenProduccionRow; e: Estado }) {
  const lote = e.productosTerminados.find((l) => l.origenOrdenId === orden.id);
  const ventas = lote ? lote.movimientos.filter((m) => m.origenOperacionId !== undefined) : [];
  const unidad = (nombre: string) => e.materiaPrima.find((m) => m.nombre === nombre)?.unidad;
  return (
    <>
      <SeccionFicha titulo="Insumos">
        <TablaFicha
          columnas={[
            { titulo: "Materia prima" },
            { titulo: "Compra (lote · proveedor)" },
            { titulo: "Cantidad", centrar: true },
            { titulo: "Costo unit.", centrar: true },
            { titulo: "Subtotal", centrar: true },
          ]}
          filas={orden.insumos.map((i) => {
            const compra = i.compraId === undefined ? undefined : e.compras.find((c) => c.id === i.compraId);
            const proveedor = compra && e.proveedores.find((p) => p.id === compra.proveedorId);
            return [
              i.materiaPrima,
              compra ? `${identificadorCompra(compra)} · ${proveedor?.razonSocial ?? "—"}` : <span className="tz-warn">Sin compra asociada</span>,
              formatCantidad(i.cantidad, unidad(i.materiaPrima)),
              formatCellValue(i.costoUnitario, "currency"),
              formatCellValue(i.cantidad * i.costoUnitario, "currency"),
            ];
          })}
          enlaces={orden.insumos.map((i) => (i.compraId === undefined ? undefined : `/trazabilidad?foco=${i.compraId}`))}
          ayuda="Ver esta compra en el Libro de compras (Trazabilidad)"
          vacio="La orden no tiene insumos cargados."
        />
      </SeccionFicha>
      <SeccionFicha titulo="Lote generado">
        {lote ? (
          <DatosFicha
            items={[
              ["Lote", lote.lote],
              ["Botellas producidas", fmtNumero(lote.existenciaInicial)],
              ["En stock", fmtNumero(saldoLote(lote))],
              ["Ventas", fmtNumero(new Set(ventas.map((m) => m.origenOperacionId)).size)],
              ["Costo por botella", formatCellValue(lote.costoUnitario, "currency")],
              ["Vencimiento", lote.fechaVencimiento ? formatCellValue(lote.fechaVencimiento, "date") : "—"],
            ]}
          />
        ) : (
          <p className="tz-empty">Todavía está macerando: el lote se genera al cargar la fecha de embotellado.</p>
        )}
      </SeccionFicha>
    </>
  );
}

export default function OrdenesProduccionView() {
  const store = useStore();
  const { ordenesProduccion, saveOrden, deleteOrden, eliminarFilas } = store;
  // ?nuevo=1 (desde los accesos rápidos del Panel principal): abre el alta directamente.
  const nuevo = useSearchParams().get("nuevo") === "1";
  const router = useRouter();
  const pathname = usePathname();
  const [target, setTarget] = useState<OrdenFormTarget>(nuevo ? "new" : null);
  // ?foco=<N° de orden> (desde la ficha de una compra): muestra esa orden.
  const foco = Number(useSearchParams().get("foco")) || null;
  useEffect(() => {
    if (nuevo) router.replace(pathname, { scroll: false });
  }, [nuevo, router, pathname]);

  return (
    <>
      <DataTable
        title="Órdenes de producción"
        columns={columns}
        rows={ordenesProduccion}
        actions={
          <button type="button" className="rf-trigger-btn" onClick={() => setTarget("new")}>
            + Nueva orden
          </button>
        }
        onEditRow={(row) => setTarget(row)}
        onDeleteRow={(row) => deleteOrden(row.id)}
        onDeleteRows={(filas) => eliminarFilas(filas, (r) => ({ tipo: "deleteOrden", id: r.id }))}
        enfocar={foco}
        ficha={{
          titulo: (r) => `Orden N° ${r.id} — ${r.producto} — ${r.formato}`,
          extra: (r) => <DetalleOrden orden={r} e={store} />,
        }}
      />

      <OrdenFormModal target={target} onClose={() => setTarget(null)} onSubmit={saveOrden} />
    </>
  );
}
