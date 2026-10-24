"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DataTable from "@/app/components/data-table/DataTable";
import type { Column } from "@/app/components/data-table/types";
import { DatosFicha, SeccionFicha, TablaFicha } from "@/app/components/data-table/FichaBloques";
import { formatCellValue } from "@/app/components/data-table/format";
import CompraFormModal, { type CompraFormTarget } from "./CompraFormModal";
import RastreoLoteModal from "./RastreoLoteModal";
import FichaLoteModal from "./FichaLoteModal";
import PagarComprasModal from "./PagarComprasModal";
import { formatCantidad, formatComprobante, montoCompra, nombreMedioPago, stockDeCompra, type CompraRow } from "./data";
import { rastrearLoteProveedor, type TrazaContexto } from "./rastreo";
import { usadoDeCompra, useStore } from "../store";

// Fila tal como se ve en el libro. Nombres y marcas se derivan en cada render
// de los catálogos (no se guardan en la compra): renombrar un proveedor o una
// materia prima se refleja solo.
type LibroRow = {
  id: number;
  fecha: string;
  materiaPrima: string;
  cantidad: string;
  lote: string;
  proveedor: string;
  form: string;
  tipo: string;
  numero: string;
  medioPago: string;
  pago: string;
};

const PROVEEDOR = "Proveedor";

const columns: Column<LibroRow>[] = [
  { key: "id", label: "N° de OP", title: "N° de operación", type: "number", align: "center", width: "6%" },
  { key: "fecha", label: "Fecha", type: "date", width: "8%" },
  { key: "materiaPrima", label: "Materia prima", filterable: true, width: "14%" },
  { key: "cantidad", label: "Cant.", title: "Cantidad comprada", align: "center", sortable: false, width: "7%", maxWidth: null },
  { key: "lote", label: "Lote producto", title: "Lote del producto comprado (del proveedor)", width: "10%" },
  { key: "proveedor", label: "Nombre - Razón social", group: PROVEEDOR, filterable: true, width: "17%" },
  { key: "form", label: "Form.", title: "Forma del comprobante", group: PROVEEDOR, width: "6%", maxWidth: null },
  { key: "tipo", label: "Tipo", title: "Tipo de comprobante", group: PROVEEDOR, align: "center", width: "4%", maxWidth: null },
  { key: "numero", label: "N°", title: "N° de comprobante", group: PROVEEDOR, width: "11%", maxWidth: null },
  // En la planilla eran 4 columnas marcadas con X; acá una sola con el nombre.
  { key: "medioPago", label: "Medio de pago", type: "tag", filterable: true, align: "center", width: "8%" },
  {
    key: "pago",
    label: "Pago",
    title: "Pago al proveedor",
    type: "tag",
    filterable: true,
    align: "center",
    width: "7%",
  },
];

/** Ficha de una compra: costo, comprobante completo y en qué órdenes (y lotes) se usó. */
function UsoDeLaCompra({ compra, ctx }: { compra: CompraRow; ctx: TrazaContexto }) {
  const unidad = ctx.materiaPrima.find((m) => m.id === compra.materiaPrimaId)?.unidad;
  const usos = ctx.ordenes.flatMap((o) =>
    o.insumos.filter((i) => i.compraId === compra.id).map((i) => ({ orden: o, cantidad: i.cantidad }))
  );
  const stock = stockDeCompra(compra);
  const usado = usadoDeCompra(ctx.ordenes, compra.id);
  return (
    <>
      <SeccionFicha titulo="Compra">
        <DatosFicha
          items={[
            ["Comprobante", formatComprobante(compra) || "—"],
            ["Costo unitario", formatCellValue(compra.costoUnitario, "currency")],
            ["Total", formatCellValue(montoCompra(compra), "currency")],
            ["Pago", compra.fechaPago ? `Pagada el ${formatCellValue(compra.fechaPago, "date")}` : "Pendiente"],
            ...(compra.cantidadCascara ? ([["Cáscara", formatCantidad(compra.cantidadCascara, unidad)]] as [string, string][]) : []),
            ["Usado en órdenes", formatCantidad(usado, unidad)],
            ["Disponible", formatCantidad(Math.max(0, Math.round((stock - usado) * 100) / 100), unidad)],
          ]}
        />
      </SeccionFicha>
      <SeccionFicha titulo="Órdenes de producción que la usaron">
        <TablaFicha
          columnas={[
            { titulo: "Orden N°", centrar: true },
            { titulo: "Producto" },
            { titulo: "Maceración", centrar: true },
            { titulo: "Cantidad usada", centrar: true },
            { titulo: "Lote generado", centrar: true },
          ]}
          filas={usos.map(({ orden, cantidad }) => [
            orden.id,
            `${orden.producto} — ${orden.formato}`,
            formatCellValue(orden.fechaMaceracion, "date"),
            formatCantidad(cantidad, unidad),
            ctx.lotes.find((l) => l.origenOrdenId === orden.id)?.lote ?? <span className="tz-muted">Macerando</span>,
          ])}
          enlaces={usos.map(({ orden }) => `/ordenes-produccion?foco=${orden.id}`)}
          ayuda="Ver esta orden en Órdenes de producción"
          vacio="Todavía no se usó en ninguna orden."
        />
      </SeccionFicha>
    </>
  );
}

export default function TrazabilidadView() {
  const {
    compras,
    proveedores,
    materiaPrima,
    ordenesProduccion,
    productosTerminados,
    operaciones,
    clientes,
    saveCompra,
    deleteCompra,
    pagarCompras,
    eliminarFilas,
  } = useStore();
  const [aPagar, setAPagar] = useState<CompraRow[] | null>(null);
  // ?nuevo=1 (desde los accesos rápidos del Panel principal): abre el alta directamente.
  const nuevo = useSearchParams().get("nuevo") === "1";
  const router = useRouter();
  const pathname = usePathname();
  const [target, setTarget] = useState<CompraFormTarget>(nuevo ? "new" : null);
  useEffect(() => {
    if (nuevo) router.replace(pathname, { scroll: false });
  }, [nuevo, router, pathname]);
  const [rastreoId, setRastreoId] = useState<number | null>(null);
  // ?foco=<N° de OP> (desde la ficha de un proveedor o de una orden): muestra esa compra.
  const foco = Number(useSearchParams().get("foco")) || null;
  const [fichaAbierta, setFichaAbierta] = useState(false);

  const rows = useMemo<LibroRow[]>(
    () =>
      compras.map((c) => {
        const mp = materiaPrima.find((m) => m.id === c.materiaPrimaId);
        return {
          id: c.id,
          fecha: c.fecha,
          materiaPrima: mp?.nombre ?? "Materia prima eliminada",
          cantidad: formatCantidad(c.cantidad, mp?.unidad),
          lote: c.lote,
          proveedor: proveedores.find((p) => p.id === c.proveedorId)?.razonSocial ?? "Proveedor eliminado",
          form: c.comprobanteForm,
          tipo: c.comprobanteTipo,
          numero: c.comprobanteNumero,
          medioPago: nombreMedioPago(c.medioPago),
          pago: c.fechaPago ? "Pagada" : "Pendiente",
        };
      }),
    [compras, proveedores, materiaPrima]
  );

  const ctx: TrazaContexto = {
    compras,
    proveedores,
    materiaPrima,
    ordenes: ordenesProduccion,
    lotes: productosTerminados,
    operaciones,
    clientes,
  };
  const compraEnRastreo = compras.find((c) => c.id === rastreoId);
  const rastreo = compraEnRastreo ? rastrearLoteProveedor(compraEnRastreo, ctx) : null;

  return (
    <>
      <DataTable
        title="Libro de compras"
        columns={columns}
        rows={rows}
        emptyMessage="Todavía no hay compras cargadas en el libro."
        actions={
          <>
            <button type="button" className="tz-secondary-btn" onClick={() => setFichaAbierta(true)}>
              Ficha de lote
            </button>
            <button type="button" className="rf-trigger-btn" onClick={() => setTarget("new")}>
              + Nueva compra
            </button>
          </>
        }
        rowActions={(row) => (
          <button
            type="button"
            className="dt-row-action-btn"
            onClick={() => setRastreoId(row.id)}
            aria-label="Rastrear lote"
            title="Rastrear: en qué lotes se usó y a qué clientes llegó"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="M14.6 14.6 20 20" />
            </svg>
          </button>
        )}
        onEditRow={(row) => setTarget(compras.find((c) => c.id === row.id) ?? null)}
        onDeleteRow={(row) => deleteCompra(row.id)}
        onDeleteRows={(filas) => eliminarFilas(filas, (r) => ({ tipo: "deleteCompra", id: r.id }))}
        accionesSeleccion={(filas) => (
          <button
            type="button"
            className="dt-sel-btn"
            onClick={() => setAPagar(compras.filter((c) => filas.some((r) => r.id === c.id)))}
            title="Marcar las compras seleccionadas como pagadas al proveedor"
          >
            Marcar pagadas
          </button>
        )}
        enfocar={foco}
        ficha={{
          titulo: (r) => `Compra OP N° ${r.id} — ${r.materiaPrima}`,
          extra: (r) => {
            const compra = compras.find((c) => c.id === r.id);
            return compra ? <UsoDeLaCompra compra={compra} ctx={ctx} /> : null;
          },
        }}
      />

      <CompraFormModal
        target={target}
        proveedores={proveedores}
        materiasPrimas={materiaPrima}
        onClose={() => setTarget(null)}
        onSubmit={saveCompra}
      />

      <PagarComprasModal
        compras={aPagar}
        etiqueta={(c) => {
          const r = rows.find((x) => x.id === c.id);
          return r ? `OP N° ${c.id} — ${r.materiaPrima} (${r.proveedor})` : `OP N° ${c.id}`;
        }}
        onClose={() => setAPagar(null)}
        onPagar={pagarCompras}
      />

      <RastreoLoteModal rastreo={rastreo} ctx={ctx} onClose={() => setRastreoId(null)} />

      {fichaAbierta && <FichaLoteModal ctx={ctx} onClose={() => setFichaAbierta(false)} />}
    </>
  );
}
