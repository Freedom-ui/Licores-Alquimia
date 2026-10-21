"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Bloques para el contenido extra de una ficha (FichaRegistroModal): una
 * sección con título, una tira de datos (tz-stat) y una tabla chica. Mismo
 * estilo que las fichas de Trazabilidad.
 */

export function SeccionFicha({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="tz-h">{titulo}</h3>
      {children}
    </section>
  );
}

/** Lista "Etiqueta: valor" en columnas, igual que los datos de la ficha. */
export function DatosFicha({ items }: { items: [etiqueta: string, valor: ReactNode][] }) {
  return (
    <dl className="fr-datos">
      {items.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="fr-item">
          <dt>{etiqueta}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export type ColumnaFicha = { titulo: string; centrar?: boolean; ajustar?: boolean };

/**
 * Tabla de la ficha con todas sus filas (scroll propio si son muchas). Con
 * `enlaces`, cada fila lleva a ese registro en su sección (ej. una venta en
 * Operaciones); `ayuda` es el tooltip de esas filas.
 */
export function TablaFicha({
  columnas,
  filas,
  vacio,
  enlaces,
  ayuda,
}: {
  columnas: ColumnaFicha[];
  filas: ReactNode[][];
  vacio: string;
  enlaces?: (string | undefined)[];
  ayuda?: string;
}) {
  const router = useRouter();
  if (filas.length === 0) return <p className="tz-empty">{vacio}</p>;
  return (
    <div className="tz-table-wrap fr-tabla">
      <table className="dt-table tz-table">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.titulo} className={c.centrar ? "tz-c" : undefined}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr
              key={i}
              className={enlaces?.[i] ? "fr-fila-link" : undefined}
              title={enlaces?.[i] ? ayuda : undefined}
              tabIndex={enlaces?.[i] ? 0 : undefined}
              onClick={enlaces?.[i] ? () => router.push(enlaces[i]!) : undefined}
              onKeyDown={
                enlaces?.[i]
                  ? (e) => {
                      if (e.key === "Enter") router.push(enlaces[i]!);
                    }
                  : undefined
              }
            >
              {fila.map((celda, j) => (
                <td key={j} className={[columnas[j]?.centrar ? "tz-c" : "", columnas[j]?.ajustar ? "tz-wrap" : ""].filter(Boolean).join(" ") || undefined}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
