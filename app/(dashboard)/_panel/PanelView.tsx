"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "../store";
import Grafico from "../estadisticas/Grafico";
import { Alertas, Kpis } from "../estadisticas/Indicadores";
import type { Datos } from "../estadisticas/calculos";
import { iso } from "../estadisticas/periodo";
import type { Destino } from "../estadisticas/secciones";
import { construirPanel, type FilaPanel } from "./calculos";

export default function PanelView({ usuario }: { usuario: string }) {
  const router = useRouter();
  const store = useStore();
  const [hoy] = useState(() => iso(new Date()));

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
  const panel = useMemo(() => construirPanel(datos), [datos]);

  function irA(destino: Destino) {
    router.push("href" in destino ? destino.href : `/estadisticas?seccion=${destino.seccion}&foco=${destino.foco}`);
  }

  return (
    <div className="pp-wrapper">
      <header className="pp-head">
        <Saludo usuario={usuario} />
        <div className="pp-acciones">
          <Link href="/operaciones?nuevo=1" className="rf-trigger-btn pp-accion">
            + Nueva venta
          </Link>
          <Link href="/trazabilidad?nuevo=1" className="tz-secondary-btn pp-accion">
            + Nueva compra
          </Link>
          <Link href="/ordenes-produccion?nuevo=1" className="tz-secondary-btn pp-accion">
            + Nueva orden
          </Link>
        </div>
      </header>

      <div className="es-grid">
        <section className="es-bloque es-bloque-kpis" style={{ gridColumn: "span 12" }}>
          <Kpis items={panel.kpis} onIr={irA} />
        </section>

        <section className="es-bloque" style={{ gridColumn: "span 8" }}>
          <BloqueHead titulo="Ventas de las últimas 12 semanas" subtitulo={`Facturación por semana · ${panel.grafico.total} en total`} href="/estadisticas?seccion=ventas" link="Ver estadísticas" />
          {panel.grafico.vacio ? (
            <div className="es-vacio es-llenar">{panel.grafico.vacio}</div>
          ) : (
            <Grafico option={panel.grafico.option} alto={260} />
          )}
        </section>

        <section className="es-bloque" style={{ gridColumn: "span 4" }}>
          <BloqueHead
            titulo="Alertas"
            subtitulo={panel.alertas.length ? `${panel.alertas.length} para revisar · tocá una para ir a ver` : undefined}
            href="/estadisticas?seccion=stock&foco=stock-alertas"
            link="Ver todas"
          />
          <Alertas items={panel.alertas.slice(0, 6)} vacio="Todo en orden: no hay alertas." onIr={irA} />
        </section>

        <Lista titulo="Últimas ventas" href="/operaciones" filas={panel.ventas} vacio="Todavía no hay ventas cargadas." />
        <Lista titulo="Últimas compras" href="/trazabilidad" filas={panel.compras} vacio="Todavía no hay compras en el libro." />
        <Lista titulo="Producción" subtitulo="En maceración y último embotellado" href="/ordenes-produccion" filas={panel.produccion} vacio="Todavía no hay órdenes de producción." />
      </div>
    </div>
  );
}

// ── Saludo con fecha y hora ─────────────────────────────────────────────────
// La hora se lee del reloj del navegador: en el servidor no hay (null) y se
// muestra recién al hidratar, así no hay diferencias entre servidor y cliente.

function suscribirReloj(aviso: () => void) {
  const t = setInterval(aviso, 15_000);
  return () => clearInterval(t);
}
const minutoActual = () => Math.floor(Date.now() / 60_000);
const sinReloj = () => null;

const FECHA_LARGA = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const HORA = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

function Saludo({ usuario }: { usuario: string }) {
  const minuto = useSyncExternalStore(suscribirReloj, minutoActual, sinReloj);
  const ahora = minuto === null ? null : new Date(minuto * 60_000);
  const hora = ahora?.getHours();
  const saludo = hora === undefined ? "Hola" : hora >= 6 && hora < 13 ? "Buen día" : hora >= 13 && hora < 20 ? "Buenas tardes" : "Buenas noches";
  const fecha = ahora ? FECHA_LARGA.format(ahora) : "";

  return (
    <div className="pp-saludo">
      <h1>
        {saludo}, <span className="pp-usuario">{usuario}</span>
      </h1>
      <p className="pp-fecha">
        {ahora ? (
          <>
            {fecha.charAt(0).toUpperCase() + fecha.slice(1)}
            <span className="pp-sep">·</span>
            <span className="pp-hora">{HORA.format(ahora)} hs</span>
          </>
        ) : (
          " "
        )}
      </p>
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function BloqueHead({ titulo, subtitulo, href, link }: { titulo: string; subtitulo?: string; href: string; link: string }) {
  return (
    <header className="es-bloque-head pp-bloque-head">
      <div>
        <h3>{titulo}</h3>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      <Link href={href} className="pp-ver">
        {link} ›
      </Link>
    </header>
  );
}

function Lista({ titulo, subtitulo, href, filas, vacio }: { titulo: string; subtitulo?: string; href: string; filas: FilaPanel[]; vacio: string }) {
  return (
    <section className="es-bloque" style={{ gridColumn: "span 4" }}>
      <BloqueHead titulo={titulo} subtitulo={subtitulo} href={href} link="Ver todas" />
      {filas.length === 0 ? (
        <div className="es-vacio es-llenar">{vacio}</div>
      ) : (
        <ul className="pp-lista">
          {filas.map((f) => (
            <li key={f.id}>
              <Link href={f.href} className="pp-fila">
                <span className="pp-fila-fecha">{f.fecha}</span>
                <span className="pp-fila-texto">
                  <span className="pp-fila-titulo">{f.titulo}</span>
                  <span className="pp-fila-detalle">{f.detalle}</span>
                </span>
                <span className="pp-fila-fin">
                  <span className="pp-fila-valor">{f.valor}</span>
                  {f.estado && <span className={`pp-estado ${f.estado.tono}`}>{f.estado.texto}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
