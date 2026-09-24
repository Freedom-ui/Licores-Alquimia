"use client";

import { useMemo, useState } from "react";
import { formatCellValue } from "@/app/components/data-table/format";
import type { LoteTerminado } from "./data";

type KardexFila = {
  id: string;
  fecha: string | null; // null = fila de Existencia Inicial
  entradaC: number | null;
  entradaPU: number | null;
  entradaPT: number | null;
  salidaC: number | null;
  salidaPU: number | null;
  salidaPT: number | null;
  saldoC: number;
  saldoPU: number;
  saldoPT: number;
};

/** Arma el kardex fila a fila (EI + movimientos), arrastrando el saldo acumulado. */
function buildKardex(lote: LoteTerminado): KardexFila[] {
  let saldoC = lote.existenciaInicial;
  const filas: KardexFila[] = [
    {
      id: "ei",
      fecha: null,
      entradaC: null,
      entradaPU: null,
      entradaPT: null,
      salidaC: null,
      salidaPU: null,
      salidaPT: null,
      saldoC,
      saldoPU: lote.costoUnitario,
      saldoPT: saldoC * lote.costoUnitario,
    },
  ];

  for (const m of lote.movimientos) {
    if (m.tipo === "entrada") {
      const pu = m.puEntrada ?? 0;
      saldoC += m.cantidad;
      filas.push({
        id: `m-${m.id}`,
        fecha: m.fecha,
        entradaC: m.cantidad,
        entradaPU: pu || null,
        entradaPT: pu ? m.cantidad * pu : null,
        salidaC: null,
        salidaPU: null,
        salidaPT: null,
        saldoC,
        saldoPU: lote.costoUnitario,
        saldoPT: saldoC * lote.costoUnitario,
      });
    } else {
      saldoC -= m.cantidad;
      filas.push({
        id: `m-${m.id}`,
        fecha: m.fecha,
        entradaC: null,
        entradaPU: null,
        entradaPT: null,
        salidaC: m.cantidad,
        salidaPU: lote.costoUnitario,
        salidaPT: m.cantidad * lote.costoUnitario,
        saldoC,
        saldoPU: lote.costoUnitario,
        saldoPT: saldoC * lote.costoUnitario,
      });
    }
  }

  return filas;
}

export default function ProductosTerminadosView({
  initialLotes,
}: {
  initialLotes: LoteTerminado[];
}) {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"" | "activo" | "agotado">("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Cada lote es "algo diferente": no es una fila más, es su propia tabla de
  // kardex. Se precalcula acá para no rearmarla en cada render de la tarjeta.
  const lotes = useMemo(
    () =>
      initialLotes.map((lote) => {
        const filas = buildKardex(lote);
        const ultima = filas[filas.length - 1];
        const totalEntradas = lote.movimientos
          .filter((m) => m.tipo === "entrada")
          .reduce((sum, m) => sum + m.cantidad, 0);
        const totalSalidas = lote.movimientos
          .filter((m) => m.tipo === "salida")
          .reduce((sum, m) => sum + m.cantidad, 0);
        return { lote, filas, saldoActual: ultima.saldoC, valorActual: ultima.saldoPT, totalEntradas, totalSalidas };
      }),
    [initialLotes]
  );

  const filtrados = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lotes.filter(({ lote, saldoActual }) => {
      if (estado === "activo" && saldoActual <= 0) return false;
      if (estado === "agotado" && saldoActual > 0) return false;
      if (!needle) return true;
      return (
        lote.producto.toLowerCase().includes(needle) ||
        lote.formato.toLowerCase().includes(needle) ||
        String(lote.lote).includes(needle)
      );
    });
  }, [lotes, search, estado]);

  const hayFiltros = search.trim() !== "" || estado !== "";
  const todoExpandido = filtrados.length > 0 && filtrados.every(({ lote }) => expanded[lote.id]);

  function toggleLote(id: number) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleTodos() {
    const next = !todoExpandido;
    setExpanded((prev) => {
      const copia = { ...prev };
      for (const { lote } of filtrados) copia[lote.id] = next;
      return copia;
    });
  }

  return (
    <div className="pt-wrapper">
      <div className="dt-toolbar">
        <input
          type="text"
          className="dt-search"
          placeholder="Buscar por producto, formato o N° de lote…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="dt-filter-select"
          value={estado}
          onChange={(e) => setEstado(e.target.value as "" | "activo" | "agotado")}
        >
          <option value="">Estado (todos)</option>
          <option value="activo">Con stock</option>
          <option value="agotado">Agotado</option>
        </select>

        {hayFiltros && (
          <button
            type="button"
            className="dt-clear-btn"
            onClick={() => {
              setSearch("");
              setEstado("");
            }}
          >
            Limpiar filtros
          </button>
        )}

        <div className="dt-actions">
          <button type="button" className="dt-clear-btn" onClick={toggleTodos} disabled={filtrados.length === 0}>
            {todoExpandido ? "Colapsar todo" : "Expandir todo"}
          </button>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="dt-empty">No hay lotes que coincidan con la búsqueda.</div>
      ) : (
        <div className="pt-list">
          {filtrados.map(({ lote, filas, saldoActual, valorActual, totalEntradas, totalSalidas }) => {
            const abierto = Boolean(expanded[lote.id]);
            return (
              <div className="pt-card" key={lote.id}>
                <button type="button" className="pt-card-header" onClick={() => toggleLote(lote.id)}>
                  <span className={`pt-chevron ${abierto ? "open" : ""}`}>▸</span>
                  <span className="pt-badge">Lote {lote.lote}</span>
                  <span className="pt-card-title">
                    {lote.producto} <span className="pt-card-formato">— {lote.formato}</span>
                  </span>
                  <span className="pt-card-stats">
                    <span title="Total entradas">E: {totalEntradas}</span>
                    <span title="Total salidas">S: {totalSalidas}</span>
                    <span title="Saldo actual" className={saldoActual > 0 ? "pt-stat-ok" : "pt-stat-off"}>
                      Saldo: {saldoActual}
                    </span>
                    <span title="Valor del saldo" className="pt-stat-value">
                      {formatCellValue(valorActual, "currency")}
                    </span>
                  </span>
                </button>

                {abierto && (
                  <div className="pt-table-scroll">
                    <table className="dt-table pt-kardex-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} title="Fecha de embarque o venta">
                            Fecha
                          </th>
                          <th colSpan={3}>Entradas</th>
                          <th colSpan={3}>Salidas</th>
                          <th colSpan={3}>Saldo</th>
                        </tr>
                        <tr>
                          <th title="Cantidad">C</th>
                          <th title="Precio unitario">PU</th>
                          <th title="Precio total">PT</th>
                          <th title="Cantidad">C</th>
                          <th title="Precio unitario">PU</th>
                          <th title="Precio total">PT</th>
                          <th title="Cantidad">C</th>
                          <th title="Precio unitario">PU</th>
                          <th title="Precio total">PT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((fila) => (
                          <tr key={fila.id}>
                            <td>{fila.fecha ? formatCellValue(fila.fecha, "date") : "Exist. inicial"}</td>
                            <td style={{ textAlign: "right" }}>{fila.entradaC ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.entradaPU, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.entradaPT, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{fila.salidaC ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.salidaPU, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.salidaPT, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{fila.saldoC}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.saldoPU, "currency")}</td>
                            <td style={{ textAlign: "right" }}>{formatCellValue(fila.saldoPT, "currency")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="dt-footer">
        Mostrando {filtrados.length} de {initialLotes.length} lotes
      </div>
    </div>
  );
}