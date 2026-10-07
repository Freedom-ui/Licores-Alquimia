"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../icons";
import { useStore } from "../store";
import Grafico from "./Grafico";
import { Alertas, Kpis } from "./Indicadores";
import type { Datos } from "./calculos";
import {
  COMPARACIONES,
  PRESETS,
  buckets,
  formatRango,
  granularidadPara,
  iso,
  rangoComparacion,
  resolverPeriodo,
  sumarDias,
  type Comparacion,
  type PresetPeriodo,
} from "./periodo";
import { SECCIONES, construirSeccion, type Bloque, type Contexto, type Destino, type SeccionId } from "./secciones";
import { exportEstadisticasPdf } from "./exportEstadisticasPdf";

const ES_SECCION = new Set<string>(SECCIONES.map((s) => s.id));

export default function EstadisticasView() {
  const router = useRouter();
  const params = useSearchParams();
  const activa: SeccionId = ES_SECCION.has(params.get("seccion") ?? "") ? (params.get("seccion") as SeccionId) : "resumen";
  const foco = params.get("foco");

  const store = useStore();
  const [hoy] = useState(() => iso(new Date()));
  const [preset, setPreset] = useState<PresetPeriodo>("3m");
  const [comparacion, setComparacion] = useState<Comparacion>("anterior");
  const [personalizado, setPersonalizado] = useState({ desde: sumarDias(hoy, -29), hasta: hoy });
  const [exportando, setExportando] = useState<"seccion" | "todo" | null>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);

  const datos: Datos = useMemo(
    () => ({
      hoy,
      operaciones: store.operaciones,
      ordenes: store.ordenesProduccion,
      lotes: store.productosTerminados,
      inventario: store.inventarioMateriaPrima,
      materiaPrima: store.materiaPrima,
      compras: store.compras,
      proveedores: store.proveedores,
    }),
    [hoy, store.operaciones, store.ordenesProduccion, store.productosTerminados, store.inventarioMateriaPrima, store.materiaPrima, store.compras, store.proveedores]
  );

  const ctx: Contexto = useMemo(() => {
    const rango = resolverPeriodo(preset, personalizado, hoy);
    const comp = rangoComparacion(rango, comparacion);
    const g = granularidadPara(rango);
    return { d: datos, rango, comp, bs: buckets(rango, g), bsComp: comp ? buckets(comp, g) : null };
  }, [datos, preset, personalizado, comparacion, hoy]);

  const seccion = useMemo(() => construirSeccion(activa, ctx), [activa, ctx]);
  const meta = { periodo: formatRango(ctx.rango), comparacion: ctx.comp ? formatRango(ctx.comp) : null };

  // Al llegar con ?foco=<bloque> (desde un indicador o una alerta), se lleva
  // la vista a ese bloque y se lo resalta un momento.
  useEffect(() => {
    if (!foco) return;
    // Se espera un instante a que la pantalla nueva termine de armarse (gráficos incluidos).
    const inicio = setTimeout(() => {
      const el = document.getElementById(`bloque-${foco}`);
      const contenedor = el?.closest(".content");
      if (!el || !contenedor) return;
      const destino = el.getBoundingClientRect().top - contenedor.getBoundingClientRect().top + contenedor.scrollTop - 16;
      contenedor.scrollTo({ top: Math.max(destino, 0) });
      setResaltado(foco);
    }, 120);
    const fin = setTimeout(() => setResaltado(null), 2200);
    return () => {
      clearTimeout(inicio);
      clearTimeout(fin);
    };
  }, [foco, activa]);

  function irA(destino: Destino) {
    if ("href" in destino) router.push(destino.href);
    else router.replace(`/estadisticas?seccion=${destino.seccion}&foco=${destino.foco}`, { scroll: false });
  }

  function cambiarSeccion(id: SeccionId) {
    router.replace(`/estadisticas?seccion=${id}`, { scroll: false });
    document.querySelector(".content")?.scrollTo({ top: 0 });
  }

  async function descargar(cual: "seccion" | "todo") {
    setExportando(cual);
    try {
      const secciones = cual === "seccion" ? [seccion] : SECCIONES.map((s) => construirSeccion(s.id, ctx));
      const nombre = cual === "seccion" ? `estadisticas-${seccion.id}` : "estadisticas-completo";
      await exportEstadisticasPdf(secciones, meta, `${nombre}-${ctx.rango.desde}-a-${ctx.rango.hasta}.pdf`);
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="es-wrapper">
      <nav className="es-tabs" aria-label="Pantallas de estadísticas">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`es-tab ${s.id === activa ? "active" : ""}`}
            aria-current={s.id === activa ? "page" : undefined}
            onClick={() => cambiarSeccion(s.id)}
          >
            <Icon name={s.icono} />
            {s.titulo}
          </button>
        ))}
      </nav>

      <div className="es-toolbar">
        <div className="es-toolbar-filtros">
          <select className="dt-filter-select" value={preset} onChange={(e) => setPreset(e.target.value as PresetPeriodo)} aria-label="Período">
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {preset === "personalizado" && (
            <>
              <input
                type="date"
                className="es-fecha"
                aria-label="Desde"
                value={personalizado.desde}
                onChange={(e) => e.target.value && setPersonalizado((p) => ({ ...p, desde: e.target.value }))}
              />
              <span className="es-sep">a</span>
              <input
                type="date"
                className="es-fecha"
                aria-label="Hasta"
                value={personalizado.hasta}
                onChange={(e) => e.target.value && setPersonalizado((p) => ({ ...p, hasta: e.target.value }))}
              />
            </>
          )}
          <select
            className="dt-filter-select"
            value={comparacion}
            onChange={(e) => setComparacion(e.target.value as Comparacion)}
            aria-label="Comparación"
          >
            {COMPARACIONES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="es-rango">
            {activa === "stock" ? `Situación al ${formatRango(ctx.rango).split(" – ")[1]}` : meta.periodo}
            {activa !== "stock" && meta.comparacion && <span className="es-rango-comp"> · comparado con {meta.comparacion}</span>}
          </span>
        </div>
        <div className="es-toolbar-acciones">
          <button type="button" className="dt-pdf-btn" onClick={() => descargar("seccion")} disabled={exportando !== null}>
            {exportando === "seccion" ? "Generando…" : `PDF de ${seccion.titulo.toLowerCase()}`}
          </button>
          <button type="button" className="tz-secondary-btn" onClick={() => descargar("todo")} disabled={exportando !== null}>
            {exportando === "todo" ? "Generando…" : "PDF completo"}
          </button>
        </div>
      </div>

      <p className="es-descripcion">{seccion.descripcion}</p>

      <div className="es-grid">
        {seccion.bloques.map((b) => (
          <BloqueView key={`${activa}-${b.id}`} bloque={b} resaltado={resaltado === b.id} onIr={irA} />
        ))}
      </div>
    </div>
  );
}

function BloqueView({ bloque: b, resaltado, onIr }: { bloque: Bloque; resaltado: boolean; onIr: (d: Destino) => void }) {
  const clase = `es-bloque ${b.tipo === "kpis" ? "es-bloque-kpis" : ""} ${resaltado ? "es-resaltado" : ""}`;
  return (
    <section id={`bloque-${b.id}`} className={clase} style={{ gridColumn: `span ${b.span}` }}>
      {b.titulo && (
        <header className="es-bloque-head">
          <h3>{b.titulo}</h3>
          {b.subtitulo && <p>{b.subtitulo}</p>}
        </header>
      )}
      {b.tipo === "kpis" && <Kpis items={b.items} onIr={onIr} />}
      {b.tipo === "grafico" &&
        (b.vacio ? <div className="es-vacio es-llenar" style={{ minHeight: b.alto }}>{b.vacio}</div> : <Grafico option={b.option} alto={b.alto} />)}
      {b.tipo === "tabla" && (
        <div className="es-tabla-wrap">
          <table className="dt-table es-tabla">
            <thead>
              <tr>
                {b.columnas.map((c) => (
                  <th key={c.titulo} className={`es-${c.alinear ?? "izq"}`}>
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.filas.length === 0 ? (
                <tr>
                  <td colSpan={b.columnas.length} className="dt-empty">
                    {b.vacio}
                  </td>
                </tr>
              ) : (
                b.filas.map((f, i) => (
                  <tr key={i}>
                    {f.map((celda, j) => (
                      <td key={j} className={`es-${b.columnas[j]?.alinear ?? "izq"}`}>
                        {celda}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {b.tipo === "alertas" && <Alertas items={b.items} vacio={b.vacio} onIr={onIr} />}
    </section>
  );
}
