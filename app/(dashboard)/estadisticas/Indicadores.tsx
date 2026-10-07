"use client";

// Piezas de Estadísticas que también usa el Panel principal: la tira de
// indicadores (con sparkline o barrita de composición) y la lista de alertas.

import type { Alerta, Destino, Kpi } from "./secciones";

/**
 * Tira de indicadores (ver .es-tira en globals.css): una franja con
 * divisiones finas en vez de una tarjeta por número. El reparto en filas
 * parejas lo resuelve el CSS según el ancho y la cantidad (data-n).
 */
export function Kpis({ items, onIr }: { items: Kpi[]; onIr: (d: Destino) => void }) {
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

export function Alertas({ items, vacio, onIr }: { items: Alerta[]; vacio: string; onIr: (d: Destino) => void }) {
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
