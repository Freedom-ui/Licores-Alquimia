"use client";

import type { ReactNode } from "react";
import ModalShell from "./ModalShell";
import Barcode from "./Barcode";
import { formatCellValue } from "./format";
import type { Column } from "./types";

/**
 * Ficha de solo lectura de una fila (doble clic o Enter en la tabla): todos
 * los datos completos, sin cortar, y lo que cada sección quiera sumar debajo
 * (ventas de un cliente, insumos de una orden…). "Editar" abre el modal de
 * edición de siempre.
 */
export default function FichaRegistroModal<T extends Record<string, unknown>>({
  seccion,
  titulo,
  columns,
  row,
  extra,
  onEditar,
  onClose,
}: {
  seccion: string;
  titulo: string;
  columns: Column<T>[];
  row: T;
  extra?: ReactNode;
  onEditar?: () => void;
  onClose: () => void;
}) {
  return (
    <ModalShell open eyebrow={`${seccion} · Ficha`} title={titulo} width={900} onClose={onClose}>
      <div className="tz-body">
        <section>
          <h3 className="tz-h">Datos</h3>
          <dl className="fr-datos">
            {columns.map((col) => {
              const value = row[col.key];
              const type = col.type ?? "text";
              const vacio = value === null || value === undefined || value === "";
              return (
                <div key={col.key} className="fr-item">
                  <dt>{col.group ? `${col.group} · ${col.title ?? col.label}` : col.title ?? col.label}</dt>
                  <dd>
                    {vacio ? (
                      <span className="tz-muted">—</span>
                    ) : type === "email" ? (
                      <a className="dt-email" href={`mailto:${String(value)}`}>
                        {String(value)}
                      </a>
                    ) : type === "barcode" ? (
                      <span className="dt-barcode-cell">
                        <Barcode value={String(value)} />
                      </span>
                    ) : (
                      formatCellValue(value, type)
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        {extra}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={onClose}>
            Cerrar
          </button>
          {onEditar && (
            <button type="button" className="rf-submit-btn" onClick={onEditar}>
              Editar
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
