"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../icons";
import { useStore } from "../store";
import Grafico from "./Grafico";
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
import { SECCIONES, construirSeccion, type Alerta, type Bloque, type Contexto, type Destino, type Kpi, type SeccionId } from "./secciones";
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

/**
 * Tira de indicadores (ver .es-tira en globals.css): una franja con
 * divisiones finas en vez de una tarjeta por número. El reparto en filas
 * parejas lo resuelve el CSS según el ancho y la cantidad (data-n).
 */
function Kpis({ items, onIr }: { items: Kpi[]; onIr: (d: Destino) => void }) {
  return (
    <div className="es-tira" data-n={items.length}>
      {items.map((k) => {
        const contenido = (
          <>
            <span className="es-celda-label" title={k.nota ? `${k.etiqueta} · ${k.nota}` : k.etiqueta}>
              {k.etiqueta}
              {k.nota && <span className="es-celda-nota"> · {k.nota}</span>}
            </span>
            <span className="es-celda-cuerpo">
              <span className="es-celda-valor">{k.valor}</span>
              {k.delta && <span className={`es-delta ${k.delta.tono}`}>{k.delta.texto}</span>}
              {k.tendencia ? <Sparkline valores={k.tendencia} /> : k.composicion ? <MiniBarra partes={k.composicion} /> : null}
            </span>
          </>
        );
        return k.destino ? (
          <button key={k.id} type="button" className="es-celda es-celda-link" onClick={() => onIr(k.destino!)} title="Ver el detalle">
            {contenido}
          </button>
        ) : (
          <div key={k.id} className="es-celda">
            {contenido}
          </div>
        );
      })}
    </div>
  );
}

/** Línea de tendencia del tamaño de una palabra (sin ejes): cómo vino el número en el período. */
function Sparkline({ valores }: { valores: (number | null)[] }) {
  const puntos = valores.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null);
  if (puntos.length < 2) return <span className="es-spark" aria-hidden="true" />;
  const min = Math.min(...puntos.map((p) => p.v));
  const max = Math.max(...puntos.map((p) => p.v));
  const x = (i: number) => (i / Math.max(valores.length - 1, 1)) * 100;
  const y = (v: number) => (max === min ? (max === 0 ? 27 : 15) : 27 - ((v - min) / (max - min)) * 24);
  const linea = puntos.map((p, n) => `${n ? "L" : "M"}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(" ");
  const area = `${linea} L${x(puntos[puntos.length - 1].i).toFixed(2)},30 L${x(puntos[0].i).toFixed(2)},30 Z`;
  return (
    <svg className="es-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill="rgba(212,119,42,0.12)" />
      <path d={linea} fill="none" stroke="#D4772A" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Barrita apilada para números que son una foto del momento (de qué se compone el total). */
function MiniBarra({ partes }: { partes: { nombre: string; valor: number; color: string }[] }) {
  const total = partes.reduce((s, p) => s + Math.max(p.valor, 0), 0);
  if (!total) return null;
  return (
    <span className="es-mini-barra" title={partes.map((p) => `${p.nombre}: ${Math.round((p.valor / total) * 100)}%`).join("\n")}>
      {partes
        .filter((p) => p.valor > 0)
        .map((p) => (
          <span key={p.nombre} style={{ flexGrow: p.valor, background: p.color }} />
        ))}
    </span>
  );
}

function Alertas({ items, vacio, onIr }: { items: Alerta[]; vacio: string; onIr: (d: Destino) => void }) {
  if (items.length === 0) return <div className="es-vacio es-vacio-ok">{vacio}</div>;
  return (
    <ul className="es-alertas">
      {items.map((a, i) => (
        <li key={i}>
          <button type="button" className={`es-alerta ${a.nivel}`} onClick={() => a.destino && onIr(a.destino)} disabled={!a.destino}>
            <span className="es-alerta-texto">
              <span className="es-alerta-titulo">{a.texto}</span>
              {a.detalle && <span className="es-alerta-detalle">{a.detalle}</span>}
            </span>
            {a.destino && <span className="es-alerta-ir" aria-hidden="true">›</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
