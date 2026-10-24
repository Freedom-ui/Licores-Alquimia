"use client";

import { useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { CampoFecha, ErrorCampo } from "@/app/components/data-table/FormFields";
import { formatCellValue } from "@/app/components/data-table/format";
import { hoyLocal, validarFecha, type Errores } from "@/app/components/data-table/validacion";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import { montoCompra, type CompraRow } from "./data";

type Resultado = { pagadas: number; fallos: { etiqueta: string; mensaje: string }[] };

/**
 * Marca como pagadas las compras seleccionadas en el Libro de compras, todas
 * con la misma fecha de pago. Las que ya estaban pagadas no se tocan; las que
 * no se pueden marcar (ej. la fecha es anterior a la compra) se informan.
 */
export default function PagarComprasModal({
  compras,
  etiqueta,
  onClose,
  onPagar,
}: {
  /** null = cerrado. */
  compras: CompraRow[] | null;
  etiqueta: (c: CompraRow) => string;
  onClose: () => void;
  onPagar: (compras: CompraRow[], fecha: string) => Promise<{ row: CompraRow; mensaje: string }[]>;
}) {
  const [fecha, setFecha] = useState(hoyLocal());
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [abiertoPara, setAbiertoPara] = useState<CompraRow[] | null>(null);
  const f = useErroresFormulario("pago", (v: { fecha: string }): Errores => {
    const error = validarFecha(v.fecha, { que: "la fecha de pago", requerido: true });
    return error ? { fecha: error } : {};
  });

  // Cada vez que se abre, arranca de cero (fecha de hoy, sin resultado).
  if (compras !== abiertoPara) {
    setAbiertoPara(compras);
    setFecha(hoyLocal());
    setResultado(null);
    f.limpiar();
  }

  const pendientes = (compras ?? []).filter((c) => !c.fechaPago);
  const yaPagadas = (compras?.length ?? 0) - pendientes.length;
  const total = pendientes.reduce((s, c) => s + montoCompra(c), 0);

  function cerrar() {
    if (!guardando) onClose();
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!f.alGuardar({ fecha }) || pendientes.length === 0) return;
    setGuardando(true);
    try {
      const fallos = await onPagar(pendientes, fecha);
      setResultado({
        pagadas: pendientes.length - fallos.length,
        fallos: fallos.map((x) => ({ etiqueta: etiqueta(x.row), mensaje: x.mensaje })),
      });
    } catch (err) {
      f.deServidor(err, "No se pudieron marcar las compras como pagadas.");
    } finally {
      setGuardando(false);
    }
  }

  const compraS = (n: number) => `${n} ${n === 1 ? "compra" : "compras"}`;

  if (resultado) {
    return (
      <ModalShell open={compras !== null} eyebrow="Libro de compras" title="Resultado" width={560} onClose={cerrar}>
        <div className="cf-body">
          <p className="cf-message">
            {resultado.pagadas > 0
              ? `${resultado.pagadas === 1 ? "Quedó pagada" : "Quedaron pagadas"} ${compraS(resultado.pagadas)}.`
              : "No se marcó ninguna compra."}{" "}
            {resultado.fallos.length > 0 && `No se ${resultado.fallos.length === 1 ? "pudo" : "pudieron"} marcar ${compraS(resultado.fallos.length)}:`}
          </p>
          {resultado.fallos.length > 0 && (
            <ul className="ev-fallos">
              {resultado.fallos.map((x, i) => (
                <li key={i}>
                  <strong>{x.etiqueta}</strong>
                  <span>{x.mensaje}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="rf-actions-row">
            <button type="button" className="rf-submit-btn" onClick={cerrar} autoFocus>
              Entendido
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={compras !== null} eyebrow="Libro de compras" title="Marcar como pagadas" width={460} onClose={cerrar}>
      <form className="rf-form" onSubmit={confirmar} noValidate>
        <p className="cf-message">
          {pendientes.length > 0
            ? `${compraS(pendientes.length)} ${pendientes.length === 1 ? "pendiente" : "pendientes"} por ${formatCellValue(total, "currency")}.`
            : "Todas las compras seleccionadas ya están pagadas."}
          {yaPagadas > 0 && pendientes.length > 0 && ` ${yaPagadas === 1 ? "Una ya estaba pagada y no se toca" : `${yaPagadas} ya estaban pagadas y no se tocan`}.`}
        </p>

        {pendientes.length > 0 && (
          <div className="rf-field">
            <label htmlFor="pago-fecha">
              Fecha de pago<span className="rf-required">*</span>
            </label>
            <CampoFecha
              {...f.props("fecha")}
              valor={fecha}
              onCambio={(v) => {
                setFecha(v);
                f.alEscribir({ fecha: v });
              }}
              onBlur={() => f.alSalir("fecha", { fecha })}
            />
            <ErrorCampo f={f} campo="fecha" />
          </div>
        )}

        {f.general && <div className="rf-error">{f.general}</div>}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={cerrar} disabled={guardando}>
            {pendientes.length > 0 ? "Cancelar" : "Cerrar"}
          </button>
          {pendientes.length > 0 && (
            <button type="submit" className="rf-submit-btn" disabled={guardando}>
              {guardando ? "Guardando…" : `Marcar ${compraS(pendientes.length)}`}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}
