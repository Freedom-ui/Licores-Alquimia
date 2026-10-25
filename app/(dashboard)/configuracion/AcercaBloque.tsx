"use client";

import { useEffect, useState } from "react";
import type { EstadoActualizacion } from "@/lib/puente";

/** Versión de la app, actualizaciones (solo en la app de escritorio) y carpeta de datos. */
export default function AcercaBloque({ version, carpeta, escritorio }: { version: string; carpeta: string; escritorio: boolean }) {
  const [act, setAct] = useState<EstadoActualizacion>({ estado: "inactivo" });
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const puente = window.alquimia;
    if (!puente) return;
    void puente.estadoActualizacion().then(setAct);
    return puente.alCambiarActualizacion(setAct);
  }, []);

  async function buscar() {
    if (!window.alquimia) return;
    setBuscando(true);
    try {
      setAct(await window.alquimia.buscarActualizacion());
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="cg-bloque" id="cg-acerca">
      <header className="cg-bloque-head">
        <h2>Acerca de Licores Alquimia</h2>
      </header>
      <dl className="cg-datos">
        <dt>Versión</dt>
        <dd>{version}</dd>
        {escritorio && (
          <>
            <dt>Actualizaciones</dt>
            <dd>
              <Actualizacion act={act} />
              {act.estado === "lista" ? (
                <button type="button" className="rf-submit-btn cg-inline-btn" onClick={() => window.alquimia?.instalarActualizacion()}>
                  Reiniciar y actualizar
                </button>
              ) : act.estado === "manual" ? (
                <button type="button" className="rf-submit-btn cg-inline-btn" onClick={() => window.alquimia?.abrirEnNavegador(act.url)}>
                  Descargar la versión {act.version}
                </button>
              ) : (
                act.estado !== "descargando" && (
                  <button type="button" className="tz-secondary-btn cg-inline-btn" onClick={buscar} disabled={buscando || act.estado === "buscando"}>
                    {buscando || act.estado === "buscando" ? "Buscando…" : "Buscar ahora"}
                  </button>
                )
              )}
            </dd>
          </>
        )}
        <dt>Copias en esta PC</dt>
        <dd>
          <code className="cg-ruta" title={carpeta}>
            {carpeta}
          </code>
          {escritorio && (
            <button type="button" className="tz-secondary-btn cg-inline-btn" onClick={() => window.alquimia?.abrirCarpetaDatos()}>
              Abrir carpeta
            </button>
          )}
        </dd>
      </dl>
    </section>
  );
}

function Actualizacion({ act }: { act: EstadoActualizacion }) {
  switch (act.estado) {
    case "inactivo":
      return <span>Se buscan solas al abrir la app.</span>;
    case "buscando":
      return <span>Buscando una versión nueva…</span>;
    case "al-dia":
      return <span>Tenés la última versión.</span>;
    case "descargando":
      return (
        <span>
          Descargando la versión {act.version}… {Math.round(act.progreso)} %
        </span>
      );
    case "lista":
      return <span>La versión {act.version} está lista: se instala sola al cerrar la app.</span>;
    case "manual":
      return <span>Hay una versión nueva ({act.version}): descargala e instalala encima (los datos se conservan).</span>;
    case "error":
      return <span className="cg-problema">{act.mensaje}</span>;
  }
}
