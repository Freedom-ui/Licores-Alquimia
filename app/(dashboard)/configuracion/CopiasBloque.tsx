"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import ModalShell from "@/app/components/data-table/ModalShell";
import type { CopiaVista, EstadoCopias } from "@/lib/copias/estado";
import { MOTIVO_TEXTO } from "@/lib/copias/nombres";
import {
  conectarDrive,
  consultarCopias,
  copiarAhora,
  desconectarDrive,
  listarDrive,
  restaurarArchivo,
  restaurarDrive,
  restaurarLocal,
  subirAhora,
  type CopiaDriveVista,
  type ResultadoCopias,
  type ResultadoRestaurar,
} from "./acciones";

const dos = (n: number) => String(n).padStart(2, "0");
/** "24/10/2026 19:47" (a mano: el formato de Intl puede variar entre el servidor y el navegador). */
export function fmtFechaHora(iso: string): string {
  const f = new Date(iso);
  return `${dos(f.getDate())}/${dos(f.getMonth() + 1)}/${f.getFullYear()} ${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

export function fmtTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}

// La hora actual solo en el navegador (en el servidor es null: así lo que se
// dibuja primero coincide con lo que arma la página al cargar).
function suscribirReloj(aviso: () => void) {
  const t = setInterval(aviso, 30_000);
  return () => clearInterval(t);
}
const minutoActual = () => Math.floor(Date.now() / 60_000) * 60_000;
const sinReloj = () => null;
const useAhora = () => useSyncExternalStore(suscribirReloj, minutoActual, sinReloj);

/** "hace 5 minutos", "hace 3 días". */
export function hace(iso: string, ahora: number): string {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return min === 1 ? "hace 1 minuto" : `hace ${min} minutos`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
  const d = Math.round(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

type ARestaurar = { origen: "local"; copia: CopiaVista } | { origen: "drive"; copia: CopiaDriveVista } | { origen: "archivo"; archivo: File };

const VISIBLES = 8;

export default function CopiasBloque({ inicial }: { inicial: EstadoCopias }) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperandoGoogle, setEsperandoGoogle] = useState(false);
  const [drive, setDrive] = useState<{ cargando: boolean; copias: CopiaDriveVista[] | null; error: string | null }>({ cargando: false, copias: null, error: null });
  const [verTodas, setVerTodas] = useState(false);
  const [aRestaurar, setARestaurar] = useState<ARestaurar | null>(null);
  const [reiniciando, setReiniciando] = useState<"auto" | "manual" | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const ahora = useAhora();
  const d = estado.drive;
  const conectado = d.conectado && !d.desconectada;

  const aplicar = useCallback(
    (r: ResultadoCopias) => {
      if (r.ok) {
        setEstado(r.estado);
        return true;
      }
      if (r.sinSesion) router.push("/login?motivo=expirada");
      else setError(r.error);
      return false;
    },
    [router]
  );

  const cargarDrive = useCallback(async () => {
    setDrive((x) => ({ ...x, cargando: true, error: null }));
    const r = await listarDrive();
    if (r.ok) setDrive({ cargando: false, copias: r.copias, error: null });
    else if (r.sinSesion) router.push("/login?motivo=expirada");
    else setDrive({ cargando: false, copias: null, error: r.error });
  }, [router]);

  // Lista de Drive al entrar (si está conectado).
  const conectadoAlEntrar = useRef(conectado);
  useEffect(() => {
    if (conectadoAlEntrar.current) void cargarDrive();
  }, [cargarDrive]);

  // Mientras el usuario da el permiso en el navegador, se consulta cada 2 s
  // hasta que aparece una conexión nueva (o pasan 10 minutos).
  const [esperandoDesde, setEsperandoDesde] = useState<string | null>(null);
  useEffect(() => {
    if (!esperandoGoogle) return;
    const desde = Date.now();
    const id = setInterval(async () => {
      const r = await consultarCopias();
      if (!r.ok) return;
      const n = r.estado.drive;
      if (n.conectado && !n.desconectada && n.conectadoEn !== esperandoDesde) {
        setEstado(r.estado);
        setEsperandoGoogle(false);
        setAviso(`Google Drive quedó conectado${n.email ? ` con ${n.email}` : ""}. Las copias se suben solas.`);
        setTimeout(() => void consultarCopias().then((x) => x.ok && setEstado(x.estado)).then(cargarDrive), 5000);
        return;
      }
      if (Date.now() - desde > 10 * 60_000) setEsperandoGoogle(false);
    }, 2000);
    return () => clearInterval(id);
  }, [esperandoGoogle, esperandoDesde, cargarDrive]);

  async function correr(que: string, tarea: () => Promise<void>) {
    setOcupado(que);
    setError(null);
    setAviso(null);
    try {
      await tarea();
    } catch {
      setError("No se pudo completar la operación. Probá de nuevo.");
    } finally {
      setOcupado(null);
    }
  }

  const copiar = () =>
    correr("copia", async () => {
      const r = await copiarAhora();
      if (aplicar(r)) {
        setAviso(conectado ? "Copia hecha. Se está subiendo a Google Drive." : "Copia hecha y verificada.");
        if (conectado) setTimeout(() => void consultarCopias().then(aplicar).then(() => cargarDrive()), 4000);
      }
    });

  const conectar = () =>
    correr("conectar", async () => {
      const r = await conectarDrive();
      if (!r.ok) {
        if (r.sinSesion) router.push("/login?motivo=expirada");
        else setError(r.error);
        return;
      }
      if (window.alquimia) window.alquimia.abrirEnNavegador(r.url);
      else window.open(r.url, "_blank", "noopener");
      setEsperandoDesde(estado.drive.conectadoEn);
      setEsperandoGoogle(true);
    });

  const desconectarCuenta = () =>
    correr("desconectar", async () => {
      if (aplicar(await desconectarDrive())) {
        setDrive({ cargando: false, copias: null, error: null });
        setAviso("Google Drive quedó desconectado. Las copias que ya estaban subidas siguen en tu Drive.");
      }
    });

  const subir = () =>
    correr("subir", async () => {
      if (aplicar(await subirAhora())) await cargarDrive();
    });

  async function confirmarRestauracion() {
    if (!aRestaurar) return;
    setOcupado("restaurar");
    setError(null);
    let r: ResultadoRestaurar;
    try {
      if (aRestaurar.origen === "local") r = await restaurarLocal(aRestaurar.copia.nombre);
      else if (aRestaurar.origen === "drive") r = await restaurarDrive(aRestaurar.copia.id);
      else {
        const form = new FormData();
        form.set("archivo", aRestaurar.archivo);
        r = await restaurarArchivo(form);
      }
    } catch {
      r = { ok: false, error: "No se pudo preparar la restauración. Probá de nuevo." };
    }
    setOcupado(null);
    if (r.ok) {
      setARestaurar(null);
      setReiniciando(r.reinicio ? "auto" : "manual");
    } else if (r.sinSesion) {
      router.push("/login?motivo=expirada");
    } else {
      setError(r.error);
    }
  }

  const ultima = estado.locales[0];
  const locales = verTodas ? estado.locales : estado.locales.slice(0, VISIBLES);

  if (reiniciando) {
    return (
      <div className="cg-reinicio" role="status">
        <div className="cg-reinicio-caja">
          <h2>{reiniciando === "auto" ? "Restaurando la copia…" : "Copia lista para restaurar"}</h2>
          {reiniciando === "auto" ? (
            <p>La app se reinicia sola en unos segundos. Después entrá con el usuario y la contraseña que tenías cuando se hizo esa copia.</p>
          ) : (
            <p>
              Para terminar, reiniciá el servidor de la app (cerrá <code>npm run dev</code> y volvé a abrirlo). Después entrá con el usuario y la contraseña que tenías
              cuando se hizo esa copia.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="cg-bloque" id="cg-copias">
      <header className="cg-bloque-head">
        <h2>Copias de seguridad</h2>
        <p>
          {estado.automaticas
            ? "La app hace sola una copia por día y otra al cerrarse si hubo cambios. Se guardan en esta PC (las últimas 30 diarias y una por mes) y, si lo conectás, en tu Google Drive."
            : "En esta instalación las copias automáticas están apagadas (solo se hacen a mano o antes de importar una planilla)."}
        </p>
      </header>

      <div className="cg-estado">
        <div className={`cg-tarjeta${ultima ? " cg-tarjeta-ok" : " cg-tarjeta-aviso"}`}>
          <span className="cg-etiqueta">En esta PC</span>
          {ultima ? (
            <>
              <strong>Última copia {ahora === null ? `del ${fmtFechaHora(ultima.fecha)}` : hace(ultima.fecha, ahora)}</strong>
              <span>
                {fmtFechaHora(ultima.fecha)} · {fmtTamano(ultima.tamano)} · verificada
              </span>
            </>
          ) : (
            <strong>Todavía no hay copias</strong>
          )}
          <div className="cg-botones">
            <button type="button" className="rf-submit-btn" onClick={copiar} disabled={ocupado !== null}>
              {ocupado === "copia" ? "Copiando…" : "Hacer una copia ahora"}
            </button>
          </div>
        </div>

        <div className={`cg-tarjeta ${conectado ? (d.error ? "cg-tarjeta-aviso" : "cg-tarjeta-ok") : "cg-tarjeta-aviso"}`}>
          <span className="cg-etiqueta">Google Drive</span>
          {!d.disponible ? (
            <span>Esta versión de la app no trae la conexión con Google Drive.</span>
          ) : esperandoGoogle ? (
            <>
              <strong>Esperando el permiso…</strong>
              <span>Se abrió Google en el navegador: elegí tu cuenta y tocá «Continuar». Cuando termine, volvé acá.</span>
              <div className="cg-botones">
                <button type="button" className="rf-cancel-btn" onClick={() => setEsperandoGoogle(false)}>
                  Cancelar
                </button>
              </div>
            </>
          ) : conectado ? (
            <>
              <strong title={d.email}>Conectado: {d.email || "cuenta de Google"}</strong>
              <span>{d.ultimaSubida
                  ? `Última copia subida ${ahora === null ? "el" : `${hace(d.ultimaSubida.fecha, ahora)},`} ${fmtFechaHora(d.ultimaSubida.fecha)}`
                  : "Todavía no se subió ninguna copia."}</span>
              {d.error && <span className="cg-problema">{d.error.mensaje}</span>}
              <div className="cg-botones">
                <button type="button" className="tz-secondary-btn" onClick={subir} disabled={ocupado !== null}>
                  {ocupado === "subir" ? "Subiendo…" : d.error ? "Reintentar ahora" : "Subir ahora"}
                </button>
                <button type="button" className="rf-cancel-btn" onClick={desconectarCuenta} disabled={ocupado !== null}>
                  Desconectar
                </button>
              </div>
            </>
          ) : (
            <>
              <strong>{d.desconectada ? `Se desconectó ${d.email}` : "No conectado"}</strong>
              <span>
                {d.desconectada
                  ? "Google quitó el permiso (o venció). Volvé a conectarlo para que las copias se sigan subiendo."
                  : "Conectalo para tener las copias también en la nube: si la PC se rompe o se pierde, los datos se recuperan desde ahí."}
              </span>
              <div className="cg-botones">
                <button type="button" className="rf-submit-btn" onClick={conectar} disabled={ocupado !== null}>
                  {ocupado === "conectar" ? "Abriendo Google…" : d.desconectada ? "Volver a conectar" : "Conectar con Google Drive"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {aviso && <div className="cg-aviso" role="status">{aviso}</div>}
      {error && <div className="rf-error">{error}</div>}

      <div className="cg-listas">
        <div>
          <div className="cg-lista-head">
            <h3 className="tz-h">Copias en esta PC</h3>
            <button type="button" className="tz-secondary-btn" onClick={() => archivoRef.current?.click()} disabled={ocupado !== null}>
              Restaurar desde un archivo…
            </button>
            <input
              ref={archivoRef}
              type="file"
              accept=".db,.gz,application/gzip,application/octet-stream"
              hidden
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.target.value = "";
                if (archivo) setARestaurar({ origen: "archivo", archivo });
              }}
            />
          </div>
          {estado.locales.length === 0 ? (
            <p className="tz-empty">Todavía no hay copias en esta PC.</p>
          ) : (
            <TablaCopias
              filas={locales.map((c) => ({ clave: c.nombre, ...c }))}
              acciones={(c) => (
                <>
                  <a className="dt-row-action-btn cg-accion-txt" href={`/api/copias/${encodeURIComponent(c.clave)}`} download={c.clave} title="Guardar una copia en otra carpeta o un pendrive">
                    Descargar
                  </a>
                  <button type="button" className="dt-row-action-btn cg-accion-txt" disabled={ocupado !== null} onClick={() => setARestaurar({ origen: "local", copia: estado.locales.find((x) => x.nombre === c.clave)! })}>
                    Restaurar
                  </button>
                </>
              )}
            />
          )}
          {estado.locales.length > VISIBLES && (
            <button type="button" className="cg-link" onClick={() => setVerTodas(!verTodas)}>
              {verTodas ? "Ver menos" : `Ver las ${estado.locales.length} copias`}
            </button>
          )}
        </div>

        {conectado && (
          <div>
            <div className="cg-lista-head">
              <h3 className="tz-h">Copias en Google Drive</h3>
              <button type="button" className="cg-link" onClick={() => void cargarDrive()} disabled={drive.cargando}>
                {drive.cargando ? "Actualizando…" : "Actualizar"}
              </button>
            </div>
            {drive.error ? (
              <p className="cg-problema">{drive.error}</p>
            ) : drive.copias === null ? (
              <p className="tz-empty">{drive.cargando ? "Cargando…" : ""}</p>
            ) : drive.copias.length === 0 ? (
              <p className="tz-empty">Todavía no hay copias en Google Drive.</p>
            ) : (
              <TablaCopias
                filas={(verTodas ? drive.copias : drive.copias.slice(0, VISIBLES)).map((c) => ({ clave: c.id, ...c }))}
                acciones={(c) => (
                  <button type="button" className="dt-row-action-btn cg-accion-txt" disabled={ocupado !== null} onClick={() => setARestaurar({ origen: "drive", copia: drive.copias!.find((x) => x.id === c.clave)! })}>
                    Restaurar
                  </button>
                )}
              />
            )}
            {drive.copias && drive.copias.length > VISIBLES && (
              <button type="button" className="cg-link" onClick={() => setVerTodas(!verTodas)}>
                {verTodas ? "Ver menos" : `Ver las ${drive.copias.length} copias`}
              </button>
            )}
          </div>
        )}
      </div>

      {aRestaurar && (
        <ConfirmarRestauracion
          aRestaurar={aRestaurar}
          ocupado={ocupado === "restaurar"}
          error={error}
          onCancelar={() => {
            if (ocupado !== "restaurar") {
              setARestaurar(null);
              setError(null);
            }
          }}
          onConfirmar={confirmarRestauracion}
        />
      )}
    </section>
  );
}

type FilaCopia = { clave: string; fecha: string; motivo: CopiaVista["motivo"]; tamano: number };

function TablaCopias({ filas, acciones }: { filas: FilaCopia[]; acciones: (c: FilaCopia) => React.ReactNode }) {
  return (
    <div className="tz-table-wrap cg-tabla">
      <table className="dt-table tz-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th className="tz-r">Tamaño</th>
            <th className="dt-actions-col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.clave}>
              <td>{fmtFechaHora(c.fecha)}</td>
              <td>{MOTIVO_TEXTO[c.motivo]}</td>
              <td className="tz-r">{fmtTamano(c.tamano)}</td>
              <td className="dt-actions-cell">{acciones(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmarRestauracion({
  aRestaurar,
  ocupado,
  error,
  onCancelar,
  onConfirmar,
}: {
  aRestaurar: ARestaurar;
  ocupado: boolean;
  error: string | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const que =
    aRestaurar.origen === "archivo"
      ? `el archivo «${aRestaurar.archivo.name}»`
      : `la copia del ${fmtFechaHora(aRestaurar.copia.fecha)}${aRestaurar.origen === "drive" ? " (de Google Drive)" : ""}`;
  const listo = texto.trim().toUpperCase() === "RESTAURAR";

  return (
    <ModalShell open eyebrow="Copias de seguridad" title="Restaurar una copia" width={520} onClose={onCancelar}>
      <form
        className="cf-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (listo && !ocupado) onConfirmar();
        }}
      >
        <p className="cf-message">
          Todos los datos actuales se reemplazan por los de {que}. <strong>Lo que hayas cargado después de esa copia se pierde.</strong>
        </p>
        <ul className="cg-puntos">
          <li>Antes se guarda una copia de los datos actuales, por si te arrepentís.</li>
          <li>La app se reinicia y vas a tener que entrar con el usuario y la contraseña que tenías cuando se hizo esa copia.</li>
        </ul>
        <div className="rf-field">
          <label htmlFor="cg-confirmar">Para confirmar, escribí RESTAURAR</label>
          <input id="cg-confirmar" type="text" value={texto} autoFocus autoComplete="off" onChange={(e) => setTexto(e.target.value)} disabled={ocupado} />
        </div>
        {error && <div className="rf-error">{error}</div>}
        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" className="cf-danger-btn" disabled={!listo || ocupado}>
            {ocupado ? "Preparando…" : "Restaurar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
