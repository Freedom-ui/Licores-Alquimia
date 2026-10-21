"use client";

import ModalShell from "./ModalShell";

export type ResultadoEliminarVarios = {
  eliminados: number;
  /** Los que una regla no dejó borrar: cómo se llama el registro y por qué. */
  fallos: { etiqueta: string; mensaje: string }[];
};

/**
 * Confirmación única para borrar las filas seleccionadas y, después, el
 * resultado: cuántas se borraron y cuáles no (con el motivo de cada una).
 */
export default function EliminarVariosDialog({
  open,
  sectionTitle,
  cantidad,
  confirming,
  error,
  resultado,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  sectionTitle: string;
  cantidad: number;
  confirming: boolean;
  error: string | null;
  resultado: ResultadoEliminarVarios | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const registros = (n: number) => `${n} ${n === 1 ? "registro" : "registros"}`;

  if (resultado) {
    const { eliminados, fallos } = resultado;
    return (
      <ModalShell open={open} eyebrow={sectionTitle} title="Resultado de la eliminación" width={560} onClose={onCancel}>
        <div className="cf-body">
          <p className="cf-message">
            {eliminados > 0 ? `Se ${eliminados === 1 ? "eliminó" : "eliminaron"} ${registros(eliminados)}.` : "No se eliminó ningún registro."}{" "}
            {fallos.length > 0 && `No se ${fallos.length === 1 ? "pudo" : "pudieron"} eliminar ${registros(fallos.length)}:`}
          </p>
          {fallos.length > 0 && (
            <ul className="ev-fallos">
              {fallos.map((f, i) => (
                <li key={i}>
                  <strong>{f.etiqueta}</strong>
                  <span>{f.mensaje}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="rf-actions-row">
            <button type="button" className="rf-submit-btn" onClick={onCancel} autoFocus>
              Entendido
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={open} eyebrow={sectionTitle} title="Eliminar registros" width={460} onClose={onCancel}>
      <div className="cf-body">
        <p className="cf-message">
          ¿Eliminar {cantidad === 1 ? "el registro seleccionado" : `los ${cantidad} registros seleccionados`} de {sectionTitle.toLowerCase()}? Esta
          acción no se puede deshacer. Los que tengan datos relacionados (por ejemplo, un cliente con ventas) no se eliminan y te vamos a avisar
          cuáles son.
        </p>

        {error && <div className="rf-error">{error}</div>}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={onCancel} disabled={confirming} autoFocus>
            Cancelar
          </button>
          <button type="button" className="cf-danger-btn" onClick={onConfirm} disabled={confirming}>
            {confirming ? "Eliminando…" : `Eliminar ${registros(cantidad)}`}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
