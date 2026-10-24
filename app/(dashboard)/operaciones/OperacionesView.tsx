"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DataTable from "@/app/components/data-table/DataTable";
import type { Column } from "@/app/components/data-table/types";
import { SeccionFicha, TablaFicha } from "@/app/components/data-table/FichaBloques";
import { formatCellValue } from "@/app/components/data-table/format";
import { fmtNumero } from "@/app/components/data-table/validacion";
import type { OperacionRow } from "./data";
import OperacionFormModal, { type OperacionFormTarget } from "./OperacionFormModal";
import VendedoresModal from "./VendedoresModal";
import { useStore } from "../store";
import type { Estado } from "../_dominio/acciones";
import { embotelladoDeLote } from "../_dominio/reglas";
import { saldoLote } from "../_dominio/sync";
import { lotesDeVenta, motivoSinRemito } from "./remito";

const columns: Column<OperacionRow>[] = [
  { key: "id", label: "OP N°", type: "number", width: "5%" },
  { key: "fecha", label: "Fecha", type: "date", width: "8%" },
  { key: "cliente", label: "Cliente", filterable: true, width: "13%" },
  { key: "vendedor", label: "Vendedor", filterable: true, width: "11%" },
  { key: "cantidad", label: "Cant.", title: "Cantidad", type: "number", width: "5%" },
  { key: "descripcion", label: "Descripción", width: "16%" },
  { key: "canal", label: "Canal", type: "tag", filterable: true, width: "7%" },
  { key: "condicion", label: "Condición", type: "tag", filterable: true, width: "11%" },
  { key: "pu", label: "P.U.", title: "Precio Unitario", type: "currency", width: "8%" },
  { key: "subTotal", label: "Sub Total", type: "currency", width: "8%" },
];

/** Descarga el remito de esas ventas (todas del mismo cliente y fecha). */
async function descargarRemito(ventas: OperacionRow[], e: Estado) {
  const { exportRemitoPdf } = await import("./exportRemitoPdf");
  await exportRemitoPdf(ventas, e.clientes.find((c) => c.id === ventas[0].clienteId), e.productosTerminados);
}

const IconoRemito = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h9l3 3v15H6z" />
    <path d="M9 9h6M9 13h6M9 17h4" />
  </svg>
);

/** Ficha de la venta: de qué lote(s) salieron las botellas (FIFO por fechas). */
function LotesDeLaVenta({ op, e }: { op: OperacionRow; e: Estado }) {
  const salidas = lotesDeVenta(op, e.productosTerminados);
  return (
    <SeccionFicha titulo="Lote de origen">
      <div className="op-ficha-acciones">
        <button type="button" className="tz-secondary-btn" onClick={() => descargarRemito([op], e)}>
          Descargar remito
        </button>
      </div>
      <TablaFicha
        columnas={[
          { titulo: "Lote", centrar: true },
          { titulo: "Botellas", centrar: true },
          { titulo: "Embotellado", centrar: true },
          { titulo: "Vencimiento", centrar: true },
          { titulo: "Saldo del lote hoy", centrar: true },
        ]}
        filas={salidas.map(({ lote, cantidad }) => {
          const saldo = saldoLote(lote);
          return [
            lote.lote,
            fmtNumero(cantidad),
            lote.origenOrdenId === undefined ? "Stock previo" : formatCellValue(embotelladoDeLote(lote, e), "date"),
            lote.fechaVencimiento ? formatCellValue(lote.fechaVencimiento, "date") : "—",
            saldo < 0 ? <span className="tz-warn">{fmtNumero(saldo)} (falta embotellar)</span> : fmtNumero(saldo),
          ];
        })}
        enlaces={salidas.map(({ lote }) => `/productos-terminados?foco=${lote.id}`)}
        ayuda="Ver este lote en Productos terminados"
        vacio="Sin lote: a la fecha de la venta no había ningún lote embotellado de este producto."
      />
    </SeccionFicha>
  );
}

export default function OperacionesView() {
  const store = useStore();
  const { operaciones, clientes, productos, addOperacion, updateOperacion, deleteOperacion, eliminarFilas } = store;
  // ?nuevo=1 (desde los accesos rápidos del Panel principal): abre el alta directamente.
  const nuevo = useSearchParams().get("nuevo") === "1";
  const router = useRouter();
  const pathname = usePathname();
  const [target, setTarget] = useState<OperacionFormTarget>(nuevo ? "new" : null);
  const [vendedoresAbierto, setVendedoresAbierto] = useState(false);
  // ?foco=<OP N°> (desde la ficha de un cliente): muestra esa venta.
  const foco = Number(useSearchParams().get("foco")) || null;
  useEffect(() => {
    if (nuevo) router.replace(pathname, { scroll: false });
  }, [nuevo, router, pathname]);

  return (
    <>
      <DataTable
        title="Operaciones"
        columns={columns}
        rows={operaciones}
        actions={
          <>
            <button type="button" className="tz-secondary-btn" onClick={() => setVendedoresAbierto(true)}>
              Vendedores
            </button>
            <button type="button" className="rf-trigger-btn" onClick={() => setTarget("new")}>
              + Nuevo
            </button>
          </>
        }
        onEditRow={(row) => setTarget(row)}
        onDeleteRow={(row) => deleteOperacion(row.id)}
        onDeleteRows={(filas) => eliminarFilas(filas, (r) => ({ tipo: "deleteOperacion", id: r.id }))}
        rowActions={(row) => (
          <button
            type="button"
            className="dt-row-action-btn"
            onClick={() => descargarRemito([row], store)}
            aria-label="Descargar remito"
            title="Descargar el remito de esta venta (PDF)"
          >
            <IconoRemito />
          </button>
        )}
        accionesSeleccion={(filas) => {
          const motivo = motivoSinRemito(filas);
          return (
            <button
              type="button"
              className="dt-sel-btn"
              aria-disabled={motivo !== null}
              onClick={() => {
                if (!motivo) descargarRemito(filas, store);
              }}
              title={motivo ?? "Un solo remito con las ventas seleccionadas (PDF)"}
            >
              Remito
            </button>
          );
        }}
        enfocar={foco}
        ficha={{
          titulo: (r) => `Venta OP N° ${r.id} — ${r.cliente}`,
          extra: (r) => <LotesDeLaVenta op={r} e={store} />,
        }}
      />

      <OperacionFormModal
        target={target}
        clientes={clientes}
        productos={productos}
        onClose={() => setTarget(null)}
        onSubmit={(id, values) => (id === null ? addOperacion(values) : updateOperacion(id, values))}
      />

      <VendedoresModal open={vendedoresAbierto} onClose={() => setVendedoresAbierto(false)} />
    </>
  );
}
