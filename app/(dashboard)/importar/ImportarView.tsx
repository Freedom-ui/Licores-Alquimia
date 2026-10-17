"use client";

// Asistente de importación de la planilla. Se puede usar más de una vez: lo
// que ya está en la app se reconoce y solo se agrega lo nuevo (ver
// planificar.ts), así el cliente puede seguir con su Excel unos meses.
//   1. Subir: el Excel (o uno o más .csv) se lee acá, en el navegador (no se
//      sube el archivo).
//   2. Revisar: qué tabla es de qué sección (detectado solo; se puede
//      cambiar), qué ya estaba y qué es nuevo, errores por fila con lo que
//      dice la regla de la app (y campos para corregirlos), avisos, unidades
//      de materia prima deducidas y la comparación con la planilla.
//   3. Listo: el servidor vuelve a armar todo contra la base, agrega lo nuevo
//      (con copia de seguridad si había datos) y la app queda actualizada.
// Mientras hay una revisión en curso, salir de la pantalla pide confirmar.

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Estado } from "../_dominio/acciones";
import { useStore } from "../store";
import { irAlLogin, seVaAlLogin } from "../ControlInactividad";
import { marcarImportacionEnCurso } from "./enCurso";
import { importarPlanilla, registrarSubida } from "../_datos/importar";
import { DETALLE_VACIO, detalleConPlan, detalleDeLectura, totalesDePlan, type Subida } from "../_importar/historial";
import Historial, { descargarFilasConError } from "./Historial";
import DatosQueCambian from "./DatosQueCambian";
import { esCsv, leerCsv, leerLibro } from "../_importar/leer";
import { analizarLibro, letraColumna, motivoSinTablas, reasignar, subtitulo } from "../_importar/detectar";
import { extraer } from "../_importar/extraer";
import {
  aplicarCorrecciones,
  claveEleccion,
  conflictosSinElegir,
  hayCambios,
  planificar,
  type Eleccion,
  type Plan,
  type Problema,
  type ResumenSeccion,
} from "../_importar/planificar";
import { SECCIONES, seccionDef } from "../_importar/secciones";
import { descargarPlantilla } from "../_importar/plantilla";
import { aTexto, claveEnc } from "../_importar/normalizar";
import type { Deteccion, Hoja, Registro, SeccionId } from "../_importar/tipos";
import { UNIDADES_MEDIDA, type UnidadMedida } from "../materia-prima/data";
import { CONDICIONES_IVA } from "../clientes/data";
import { CANALES, CONDICIONES } from "../operaciones/data";
import { MEDIOS_PAGO } from "../trazabilidad/data";
import { fmtMoneda, fmtNumero } from "../estadisticas/formato";
import ModalShell from "@/app/components/data-table/ModalShell";
import Icon from "../icons";
import { Leyenda, Marca, RESULTADO_COTEJO, sinDato, type TipoMarca } from "./Marca";

type Paso = "subir" | "analizando" | "revisar" | "importando" | "listo";

type Libro = { nombre: string; archivos: { nombre: string; tamano: number }[]; hojas: Hoja[] };

type Exito = { resumen: ResumenSeccion[]; respaldo: string | null; errores: Problema[]; agregados: number; modificados: number };

/** Filas que el usuario corrigió: sus errores tal como estaban, para seguir mostrándolas. */
type FilasCorregidas = Record<string, Problema[]>;

const PASOS: { id: Paso[]; texto: string }[] = [
  { id: ["subir", "analizando"], texto: "Subir la planilla" },
  { id: ["revisar", "importando"], texto: "Revisar" },
  { id: ["listo"], texto: "Listo" },
];

/** Agrega una subida al historial o la reemplaza si ya estaba (queda arriba la más nueva). */
const conSubida = (lista: Subida[], s: Subida) => (lista.some((x) => x.id === s.id) ? lista.map((x) => (x.id === s.id ? s : x)) : [s, ...lista]);

export default function ImportarView({ subidasIniciales }: { subidasIniciales: Subida[] }) {
  const store = useStore();
  const [subidas, setSubidas] = useState(subidasIniciales);
  // La subida en revisión ya anotada en el historial (para actualizarla al importar).
  const registro = useRef<{ libro: Libro; id: Promise<number | null> } | null>(null);
  const [paso, setPaso] = useState<Paso>("subir");
  const [error, setError] = useState<string | null>(null);
  const [libro, setLibro] = useState<Libro | null>(null);
  const [detecciones, setDetecciones] = useState<Deteccion[]>([]);
  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>({});
  const [correcciones, setCorrecciones] = useState<Record<string, Record<string, string>>>({});
  const [unidades, setUnidades] = useState<Record<string, UnidadMedida>>({});
  const [filasCorregidas, setFilasCorregidas] = useState<FilasCorregidas>({});
  const [exito, setExito] = useState<Exito | null>(null);

  const tieneDatos = store.clientes.length + store.productos.length + store.compras.length + store.operaciones.length > 0;
  // Lo que ya tiene la app: la planilla se compara contra esto y solo se agrega lo nuevo.
  const { clientes, proveedores, materiaPrima, productos, vendedores, operaciones, ordenesProduccion, productosTerminados, inventarioMateriaPrima, compras } = store;
  const base = useMemo<Estado>(
    () => ({ clientes, proveedores, materiaPrima, productos, vendedores, operaciones, ordenesProduccion, productosTerminados, inventarioMateriaPrima, compras }),
    [clientes, proveedores, materiaPrima, productos, vendedores, operaciones, ordenesProduccion, productosTerminados, inventarioMateriaPrima, compras]
  );

  const extraccion = useMemo(() => (libro ? extraer(libro.hojas, detecciones) : null), [libro, detecciones]);
  const registros = useMemo(
    () => (extraccion ? aplicarCorrecciones(extraccion.registros, correcciones) : []),
    [extraccion, correcciones]
  );
  const plan = useMemo<Plan | null>(
    () => (extraccion ? planificar({ registros, referencias: extraccion.referencias }, { unidades, base, elecciones }) : null),
    [extraccion, registros, unidades, base, elecciones]
  );

  /** Una planilla de Excel, o uno o más CSV (cada uno es una hoja: ej. Clientes.csv + Ventas.csv). */
  function leerArchivos(archivos: File[]) {
    setError(null);
    const csv = archivos.filter((a) => esCsv(a.name));
    if (csv.length && csv.length < archivos.length) {
      setError("Subí una planilla de Excel o archivos .csv, no los dos juntos.");
      return;
    }
    if (!csv.length) {
      if (archivos.length > 1) {
        setError("Elegí una sola planilla de Excel (para varios archivos, tienen que ser .csv).");
        return;
      }
      if (!/\.(xlsx|xlsm|xls)$/i.test(archivos[0].name)) {
        setError("Elegí una planilla de Excel (.xlsx o .xls) o archivos .csv.");
        return;
      }
    }
    const nombreArchivo = archivos.length === 1 ? archivos[0].name : archivos.map((a) => a.name).join(", ");
    const infoArchivos = archivos.map((a) => ({ nombre: a.name, tamano: a.size }));
    const nombres = new Set(csv.map((a) => a.name.toLowerCase()));
    if (nombres.size < csv.length) {
      setError("Hay dos archivos .csv con el mismo nombre: dejá uno solo de cada uno.");
      return;
    }
    setPaso("analizando");
    Promise.all(archivos.map((a) => a.arrayBuffer()))
      // Un respiro para que se vea "Analizando…" antes del cálculo (una planilla grande tarda unos segundos).
      .then((bufs) => new Promise<ArrayBuffer[]>((ok) => setTimeout(() => ok(bufs), 50)))
      .then((bufs) => {
        const hojas = csv.length ? bufs.map((buf, i) => leerCsv(buf, archivos[i].name)) : leerLibro(bufs[0]);
        const ds = analizarLibro(hojas);
        if (!ds.some((d) => d.seccion !== null)) {
          throw new Error(motivoSinTablas(hojas, ds, csv.length > 0));
        }
        setLibro({ nombre: nombreArchivo, archivos: infoArchivos, hojas });
        setDetecciones(ds);
        setCorrecciones({});
        setFilasCorregidas({});
        setUnidades({});
        setElecciones({});
        setPaso("revisar");
      })
      .catch((e: unknown) => {
        const mensaje = e instanceof Error ? e.message : "No se pudo leer el archivo.";
        setError(mensaje);
        setPaso("subir");
        // También queda en el historial.
        registrarSubida({ estado: "noLeida", archivo: nombreArchivo, error: mensaje, detalle: JSON.stringify({ ...DETALLE_VACIO, archivos: infoArchivos }) })
          .then((r) => r.ok && setSubidas((l) => conSubida(l, r.subida)))
          .catch(() => {});
      });
  }

  // Al terminar de analizar una planilla se anota en el historial (con lo que se encontró).
  useEffect(() => {
    if (paso !== "revisar" || !libro || !plan || registro.current?.libro === libro) return;
    const detalle = detalleConPlan(detalleDeLectura(libro.archivos, libro.hojas, detecciones), plan);
    // Si no hay nada nuevo ni datos que cambien, queda como "Ya estaba todo" (no como "No se importó").
    const alDia = !hayCambios(plan) && conflictosSinElegir(plan) === 0;
    const id = registrarSubida({
      estado: alDia ? "sinNovedades" : "revision",
      archivo: libro.nombre,
      detalle: JSON.stringify(detalle),
      totales: totalesDePlan(plan),
    })
      .then((r) => {
        if (!r.ok) return null;
        setSubidas((l) => conSubida(l, r.subida));
        return r.subida.id;
      })
      .catch(() => null);
    registro.current = { libro, id };
  }, [paso, libro, plan, detecciones]);

  async function importar() {
    if (!plan || !extraccion) return;
    setError(null);
    setPaso("importando");
    const subidaId = registro.current?.libro === libro ? await registro.current.id : null;
    const r = await importarPlanilla({ extraccion: { registros, referencias: extraccion.referencias }, unidades, elecciones, subidaId });
    if (r.subida) setSubidas((l) => conSubida(l, r.subida!));
    if (!r.ok) {
      if (r.sinSesion) irAlLogin("expirada");
      setError(r.error);
      setPaso("revisar");
      return;
    }
    store.reemplazarEstado(r.estado);
    setExito({ resumen: r.resumen, respaldo: r.respaldo, errores: plan.problemas.filter((p) => p.tipo === "error"), agregados: r.agregados, modificados: r.modificados });
    setPaso("listo");
  }

  function corregir(clave: string, campo: string, valor: string) {
    // Se guarda cómo estaba la fila antes de la primera corrección: así sigue a la
    // vista con todos sus campos aunque alguno ya quede bien.
    if (plan && !filasCorregidas[clave]) {
      const previos = plan.problemas.filter((p) => p.tipo === "error" && p.clave === clave);
      setFilasCorregidas((f) => ({ ...f, [clave]: previos }));
    }
    setCorrecciones((c) => ({ ...c, [clave]: { ...c[clave], [campo]: valor } }));
  }

  function reiniciar() {
    setLibro(null);
    setDetecciones([]);
    setExito(null);
    setError(null);
    setPaso("subir");
  }

  const pasoActual = PASOS.findIndex((p) => p.id.includes(paso));

  return (
    <div className="im-wrapper">
      <header className="im-head">
        <div>
          <h1>Importar planilla de Excel</h1>
          <p>
            Subí tu planilla y la app reconoce sola cada tabla (clientes, proveedores, productos, materias primas, compras, órdenes y
            ventas). Podés volver a subirla cada vez que sumes datos en el Excel: lo que ya está en la app no se duplica, se agrega lo
            nuevo y, si cambió algún dato (un teléfono, un precio…), te pregunta cuál dejar. Antes de guardar vas a ver todo lo que se
            encontró y si hay algo para corregir.
          </p>
        </div>
        <button type="button" className="tz-secondary-btn" onClick={descargarPlantilla}>
          Descargar plantilla limpia
        </button>
      </header>

      <ol className="im-pasos">
        {PASOS.map((p, i) => (
          <li key={p.texto} className={i === pasoActual ? "actual" : i < pasoActual ? "hecho" : ""}>
            <span className="im-paso-n">{i < pasoActual ? "✓" : i + 1}</span>
            {p.texto}
          </li>
        ))}
      </ol>

      {error && <div className="rf-error">{error}</div>}

      {(paso === "subir" || paso === "analizando") && <ZonaSubida analizando={paso === "analizando"} onArchivos={leerArchivos} />}

      {(paso === "revisar" || paso === "importando") && libro && plan && extraccion && (
        <>
          <Detecciones
            libro={libro}
            detecciones={detecciones}
            registros={extraccion.registros}
            onCambiar={(i, seccion) => setDetecciones((ds) => ds.map((d, j) => (j === i ? reasignar(libro.hojas, d, seccion) : d)))}
            onCambiarGrupo={(seccion, nueva) =>
              setDetecciones((ds) => ds.map((d) => (d.seccion === seccion ? reasignar(libro.hojas, d, nueva) : d)))
            }
          />
          <ResumenPlan plan={plan} tieneDatos={tieneDatos} />
          {tieneDatos && <LoNuevo plan={plan} registros={registros} />}
          <DatosQueCambian
            plan={plan}
            onElegir={(campos, eleccion) =>
              setElecciones((x) => ({ ...x, ...Object.fromEntries(campos.map((c) => [claveEleccion(c.clave, c.campo), eleccion])) }))
            }
          />
          <Problemas
            plan={plan}
            registros={extraccion.registros}
            correcciones={correcciones}
            filasCorregidas={filasCorregidas}
            onCorregir={corregir}
          />
          <Unidades plan={plan} onCambiar={(nombre, u) => setUnidades((x) => ({ ...x, [claveEnc(nombre)]: u }))} />
          <Cotejo plan={plan} />
          <Confirmar
            plan={plan}
            tieneDatos={tieneDatos}
            importando={paso === "importando"}
            onImportar={importar}
            onOtroArchivo={reiniciar}
          />
        </>
      )}

      {paso === "listo" && exito && <Resultado exito={exito} onOtro={reiniciar} />}

      {(paso === "subir" || paso === "analizando" || paso === "listo") && <Historial subidas={subidas} />}

      <AvisoAlSalir activo={paso === "analizando" || paso === "revisar" || paso === "importando"} />
    </div>
  );
}

// ── Aviso al salir con una revisión a medias ────────────────────────────────

const ATRAS = "__atras__";

/**
 * Mientras hay una planilla en revisión, salir de la pantalla pide confirmar
 * (se pierde lo hecho: archivo, correcciones, unidades). Cubre los links de
 * toda la app (sidebar, accesos, etc.), recargar o cerrar la pestaña y el
 * botón Atrás del navegador. "Cerrar sesión" tiene su propia confirmación
 * (sidebar.tsx), que avisa que se pierde la importación.
 */
function AvisoAlSalir({ activo }: { activo: boolean }) {
  const router = useRouter();
  const [destino, setDestino] = useState<string | null>(null);
  const saliendo = useRef(false);

  useEffect(() => {
    if (!activo) return;
    saliendo.current = false;
    // Clic en cualquier link interno: se frena antes de que llegue a Next.
    const alClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setDestino(url.pathname + url.search + url.hash);
    };
    // Recargar o cerrar la pestaña: el aviso propio del navegador (no si la sesión se cerró).
    const alCerrar = (e: BeforeUnloadEvent) => {
      if (saliendo.current || seVaAlLogin()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // Atrás: se agrega una entrada de historial de más; si el usuario vuelve, se
    // la repone y se pregunta.
    window.history.pushState(window.history.state, "", window.location.href);
    const alVolver = () => {
      if (saliendo.current) return;
      window.history.pushState(window.history.state, "", window.location.href);
      setDestino(ATRAS);
    };
    document.addEventListener("click", alClic, true);
    window.addEventListener("beforeunload", alCerrar);
    window.addEventListener("popstate", alVolver);
    marcarImportacionEnCurso(true);
    return () => {
      marcarImportacionEnCurso(false);
      document.removeEventListener("click", alClic, true);
      window.removeEventListener("beforeunload", alCerrar);
      window.removeEventListener("popstate", alVolver);
    };
  }, [activo]);

  function salir() {
    const a = destino;
    saliendo.current = true;
    setDestino(null);
    if (a === ATRAS) window.history.go(-2);
    else if (a) router.push(a);
  }

  return (
    <ModalShell open={destino !== null} eyebrow="Importar planilla" title="¿Salir de la importación?" width={460} onClose={() => setDestino(null)}>
      <div className="cf-body">
        <p className="cf-message">
          Tenés una planilla en revisión. Si salís, la importación se cancela y se pierde lo que hiciste acá (el archivo, las correcciones y
          las unidades elegidas). No se guardó nada en la app.
        </p>
        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={() => setDestino(null)}>
            Quedarme
          </button>
          <button type="button" className="cf-danger-btn" onClick={salir}>
            Salir y cancelar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Paso 1 ──────────────────────────────────────────────────────────────────

function ZonaSubida({ analizando, onArchivos }: { analizando: boolean; onArchivos: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  function soltar(e: DragEvent) {
    e.preventDefault();
    setEncima(false);
    const fs = [...e.dataTransfer.files];
    if (fs.length && !analizando) onArchivos(fs);
  }

  return (
    <section
      className={`im-zona${encima ? " encima" : ""}${analizando ? " analizando" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
      onClick={() => !analizando && input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !analizando) input.current?.click();
      }}
      aria-busy={analizando}
    >
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.xls,.csv"
        multiple
        hidden
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          if (fs.length) onArchivos(fs);
          e.target.value = "";
        }}
      />
      {analizando ? (
        <>
          <span className="im-spinner" aria-hidden />
          <strong>Analizando la planilla…</strong>
          <span>Con una planilla grande puede tardar unos segundos.</span>
        </>
      ) : (
        <>
          <span className="im-zona-icono" aria-hidden>
            ⇪
          </span>
          <strong>Arrastrá la planilla acá o hacé clic para elegirla</strong>
          <span>
            Excel (.xlsx o .xls) o archivos .csv (podés elegir varios juntos, uno por sección). El archivo se lee en esta computadora: no se
            sube a ningún lado.
          </span>
        </>
      )}
    </section>
  );
}

// ── Paso 2: qué se encontró ─────────────────────────────────────────────────

const OPCIONES_SECCION = SECCIONES.map((s) => ({ value: s.id, label: s.nombre }));

function SelectSeccion({ valor, onChange }: { valor: SeccionId | null; onChange: (s: SeccionId | null) => void }) {
  return (
    <select className="im-select" value={valor ?? ""} onChange={(e) => onChange((e.target.value || null) as SeccionId | null)}>
      <option value="">No importar</option>
      {OPCIONES_SECCION.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const ubicacion = (d: Deteccion) => `${d.bloque.hoja} › ${letraColumna(d.bloque.col0)}${d.filaDatos + 1}`;

/** Qué se muestra como cantidad en cada tarjeta: las filas que realmente se leyeron. */
function cantidadTarjeta(seccion: SeccionId, registros: Registro[]): string {
  const n = (s: Registro["seccion"]) => registros.filter((r) => r.seccion === s).length;
  switch (seccion) {
    case "comprasTrazabilidad":
      return "Se une con el libro de compras por el N° de OP";
    case "inventarioMP":
      return `${fmtNumero(n("existenciaMP"))} con existencia inicial`;
    case "inventarioPT":
      return `${fmtNumero(n("existenciaPT"))} lotes con existencia inicial`;
    default:
      return `${fmtNumero(n(seccion))} filas`;
  }
}

function Detecciones({
  libro,
  detecciones,
  registros,
  onCambiar,
  onCambiarGrupo,
}: {
  libro: Libro;
  detecciones: Deteccion[];
  registros: Registro[];
  onCambiar: (i: number, s: SeccionId | null) => void;
  onCambiarGrupo: (s: SeccionId, nueva: SeccionId | null) => void;
}) {
  const asignadas = SECCIONES.map((def) => ({ def, ds: detecciones.filter((d) => d.seccion === def.id) })).filter((g) => g.ds.length);
  const dudosas = detecciones.map((d, i) => ({ d, i })).filter(({ d }) => d.seccion === null && d.confianza === "media");
  const ignoradas = detecciones.filter((d) => d.seccion === null && d.confianza === "baja");
  // Títulos repetidos (ej. siete "PLAZO FIJO") se muestran una vez con la cantidad.
  const porTitulo = new Map<string, { titulo: string; hojas: Set<string>; n: number }>();
  for (const d of ignoradas) {
    const t = d.titulo.replace(/\s*[-:–]\s*$/, "").replace(/\s+-\s*$/, "");
    const k = claveEnc(t.split(":")[0]);
    const g = porTitulo.get(k) ?? { titulo: t.split(":")[0].trim(), hojas: new Set(), n: 0 };
    g.hojas.add(d.bloque.hoja);
    g.n++;
    porTitulo.set(k, g);
  }

  return (
    <section className="es-bloque">
      <div className="es-bloque-head">
        <h3>Esto encontramos en «{libro.nombre}»</h3>
        <p>Cada tabla de la planilla se asignó a una sección de la app. Si alguna no es correcta, cambiala con el desplegable.</p>
      </div>
      <div className="im-tarjetas">
        {asignadas.map(({ def, ds }) => {
          const revisar = ds.some((d) => d.confianza === "media");
          return (
            <article key={def.id} className={`im-tarjeta${revisar ? " revisar" : ""}`}>
              <div className="im-tarjeta-head">
                <strong>{def.nombre}</strong>
                <span className={`im-chip ${revisar ? "aviso" : "ok"}`}>{revisar ? "Revisar" : "✓ Reconocida"}</span>
              </div>
              <p className="im-tarjeta-desc">
                {def.multiple
                  ? `${ds.length} ${def.id === "inventarioMP" ? "materias primas" : "productos"}: ${ds.map((d) => subtitulo(d.bloque)).slice(0, 4).join(", ")}${ds.length > 4 ? "…" : ""}`
                  : ds[0].titulo}
              </p>
              <p className="im-tarjeta-desc">
                <strong>{cantidadTarjeta(def.id, registros)}</strong>
              </p>
              <p className="im-tarjeta-desc tenue">{def.multiple ? def.descripcion : `Hoja ${ubicacion(ds[0])}`}</p>
              <div className="im-tarjeta-pie">
                {def.multiple ? (
                  <select className="im-select" value={def.id} onChange={(e) => onCambiarGrupo(def.id, (e.target.value || null) as SeccionId | null)}>
                    <option value={def.id}>Importar</option>
                    <option value="">No importar</option>
                  </select>
                ) : (
                  <SelectSeccion valor={def.id} onChange={(s) => onCambiar(detecciones.indexOf(ds[0]), s)} />
                )}
                {!def.multiple && <Columnas d={ds[0]} />}
              </div>
            </article>
          );
        })}
      </div>

      {dudosas.length > 0 && (
        <div className="im-dudosas">
          <h4>Para revisar: ¿estas tablas son de alguna sección?</h4>
          {dudosas.map(({ d, i }) => (
            <div key={d.bloque.id} className="im-dudosa">
              <div>
                <strong>{d.titulo}</strong>
                <span className="tenue">
                  {" "}
                  · Hoja {ubicacion(d)} · {fmtNumero(d.cantidadFilas)} filas
                  {d.sugerida ? ` · parece ${seccionDef(d.sugerida).nombre}` : ""}
                </span>
              </div>
              <SelectSeccion valor={null} onChange={(s) => onCambiar(i, s)} />
            </div>
          ))}
        </div>
      )}

      {porTitulo.size > 0 && (
        <details className="im-detalles">
          <summary>No se importa ({porTitulo.size} tablas)</summary>
          <p className="tenue">
            Son datos que la app no maneja (contabilidad, bancos, consignaciones…) o que calcula sola a partir de las compras, órdenes y
            ventas (inventarios, estados de costos, estadísticas). La lista de vendedores tampoco se importa: los vendedores se toman de las
            ventas. Las hojas de cálculos auxiliares se saltean.
          </p>
          <ul className="im-ignoradas">
            {[...porTitulo.values()].map((g) => (
              <li key={g.titulo}>
                {g.titulo || "(sin título)"}
                <span className="tenue">
                  {" "}
                  · {[...g.hojas].join(", ")}
                  {g.n > 1 ? ` · ${g.n} tablas` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Columnas({ d }: { d: Deteccion }) {
  const def = d.seccion ? seccionDef(d.seccion) : null;
  if (!def) return null;
  const usadas = d.columnas.filter((c) => c.campo);
  return (
    <details className="im-columnas">
      <summary>Ver columnas</summary>
      <ul>
        {usadas.map((c) => (
          <li key={c.col}>
            <span className="tenue">{letraColumna(c.col)} «{c.encabezado}»</span> → {def.campos.find((x) => x.id === c.campo)?.etiqueta}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ── Resumen ─────────────────────────────────────────────────────────────────

function ResumenPlan({ plan, tieneDatos }: { plan: Plan; tieneDatos: boolean }) {
  const nuevos = plan.resumen.reduce((s, r) => s + r.importados, 0);
  const existentes = plan.resumen.reduce((s, r) => s + r.existentes, 0);
  const modificados = plan.resumen.reduce((s, r) => s + r.modificados, 0);
  const conError = plan.resumen.reduce((s, r) => s + r.conError, 0);
  const texto = !tieneDatos
    ? "Cada fila pasa por las mismas reglas que la carga a mano. Las que tienen errores no se importan (podés corregirlas abajo)."
    : existentes && !nuevos && !modificados
      ? `Todo lo de la planilla ya está cargado en la app, con los mismos datos: no hay nada nuevo para agregar${
          conError ? ` (salvo ${conError === 1 ? "la fila con error, que se puede corregir abajo" : `las ${fmtNumero(conError)} filas con error, que se pueden corregir abajo`})` : ""
        }.`
      : "La app ya tiene datos: se comparó la planilla con lo cargado, fila por fila y dato por dato. " +
        [
          existentes ? `${fmtNumero(existentes)} ${existentes === 1 ? "registro ya estaba sin cambios" : "registros ya estaban sin cambios"}` : "",
          modificados ? `${fmtNumero(modificados)} ${modificados === 1 ? "ya estaba y se actualiza" : "ya estaban y se actualizan"} (ver "Datos que cambiaron")` : "",
          nuevos ? (nuevos === 1 ? "se agrega 1 nuevo" : `se agregan ${fmtNumero(nuevos)} nuevos`) : "",
        ]
          .filter(Boolean)
          .join("; ") +
        ".";
  return (
    <section className="es-bloque">
      <div className="es-bloque-head">
        <h3>Qué se va a importar</h3>
        <p>{texto}</p>
      </div>
      <Leyenda
        items={[
          ["nuevo", tieneDatos ? "Nuevo: se agrega" : "Se importa"],
          ...(tieneDatos
            ? ([
                ["ya", "Ya estaba en la app, sin cambios"],
                ["modifica", "Ya estaba: se actualizan datos que cambiaron"],
              ] as [TipoMarca, string][])
            : []),
          ["error", "Con error: no se importa"],
        ]}
      />
      <div className="im-tabla-scroll">
        <table className="im-tabla">
          <thead>
            <tr>
              <th>Sección</th>
              <th className="der">En la planilla</th>
              {tieneDatos && <th className="der">Sin cambios</th>}
              {tieneDatos && <th className="der">Se actualizan</th>}
              <th className="der">{tieneDatos ? "Nuevos" : "Se importan"}</th>
              <th className="der">Con error</th>
            </tr>
          </thead>
          <tbody>
            {plan.resumen.map((r) => (
              <tr key={r.seccion}>
                <td>{r.nombre}</td>
                <td className="der">{fmtNumero(r.total)}</td>
                {tieneDatos && <td className="der">{r.existentes ? <Marca tipo="ya">{fmtNumero(r.existentes)}</Marca> : sinDato}</td>}
                {tieneDatos && <td className="der">{r.modificados ? <Marca tipo="modifica">{fmtNumero(r.modificados)}</Marca> : sinDato}</td>}
                <td className="der">{r.importados ? <Marca tipo="nuevo">{fmtNumero(r.importados)}</Marca> : sinDato}</td>
                <td className="der">{r.conError ? <Marca tipo="error">{fmtNumero(r.conError)}</Marca> : sinDato}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Lo que se va a agregar, por sección (solo cuando la app ya tenía datos). */
function LoNuevo({ plan, registros }: { plan: Plan; registros: Registro[] }) {
  const porClave = useMemo(() => new Map(registros.map((r) => [r.clave, r])), [registros]);
  const grupos = new Map<string, Registro[]>();
  for (const clave of plan.nuevos) {
    const r = porClave.get(clave);
    if (r) grupos.set(r.seccion, [...(grupos.get(r.seccion) ?? []), r]);
  }
  if (grupos.size === 0) return null;
  return (
    <section className="es-bloque">
      <div className="es-bloque-head">
        <h3>Lo nuevo que se va a agregar</h3>
        <p>Es lo que está en la planilla y todavía no está en la app. Abrí cada sección para ver el detalle.</p>
      </div>
      <div className="im-nuevos">
        {[...grupos].map(([seccion, rs]) => (
          <details key={seccion} className="im-detalles">
            <summary>
              {NOMBRE_SECCION_CORTO[seccion] ?? seccion} <Marca tipo="nuevo">{fmtNumero(rs.length)}</Marca>
            </summary>
            <ul className="im-lista-nuevos">
              {rs.slice(0, 200).map((r) => (
                <li key={r.clave}>
                  <span className="im-item-nuevo" aria-hidden>
                    <Icon name="plus" />
                  </span>
                  {resumenRegistro(r) || "(sin nombre)"}
                  {r.origen.fila > 0 && (
                    <span className="tenue">
                      {" "}
                      · {r.origen.hoja}, fila {r.origen.fila}
                    </span>
                  )}
                </li>
              ))}
              {rs.length > 200 && <li className="tenue">… y {fmtNumero(rs.length - 200)} más</li>}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── Errores y avisos ────────────────────────────────────────────────────────

const lugar = (p: Problema) => (p.origen && p.origen.fila > 0 ? `${p.origen.hoja}, fila ${p.origen.fila}` : "");

function opcionesCampo(campo: string, plan: Plan): string[] | null {
  const e = plan.estado;
  switch (campo) {
    case "cliente":
      return e.clientes.map((c) => c.razonSocial);
    case "producto":
      return e.productos.map((p) => `${p.nombre} ${p.formato}`);
    case "materiaPrima":
      return e.materiaPrima.map((m) => m.nombre);
    case "proveedor":
      return e.proveedores.map((p) => p.razonSocial);
    case "vendedor":
      return e.vendedores.map((v) => v.nombre);
    case "condicionIva":
      return CONDICIONES_IVA;
    case "canal":
      return CANALES;
    case "condicion":
      return CONDICIONES;
    case "medioPago":
      return MEDIOS_PAGO.map((m) => m.value);
    default:
      return null;
  }
}

type CampoFila = { campo: string | undefined; mensaje: string; pendiente: boolean };
type FilaRevision = { clave: string | undefined; problema: Problema; campos: CampoFila[]; resuelta: boolean };

/**
 * Filas para revisar: las que hoy tienen errores y las que el usuario ya
 * corrigió (siguen a la vista con todos sus campos, editables, hasta que se
 * importe). Cada campo dice si todavía falla o si ya quedó bien.
 */
function filasParaRevisar(errores: Problema[], corregidas: FilasCorregidas, orden: Map<string, number>): FilaRevision[] {
  const filas = new Map<string, FilaRevision>();
  const sueltas: FilaRevision[] = [];
  for (const p of errores) {
    const campo: CampoFila = { campo: p.campo, mensaje: p.mensaje, pendiente: true };
    if (!p.clave) {
      sueltas.push({ clave: undefined, problema: p, campos: [campo], resuelta: false });
      continue;
    }
    const f = filas.get(p.clave) ?? { clave: p.clave, problema: p, campos: [], resuelta: false };
    f.campos.push(campo);
    filas.set(p.clave, f);
  }
  for (const [clave, previos] of Object.entries(corregidas)) {
    const f = filas.get(clave) ?? { clave, problema: previos[0], campos: [], resuelta: true };
    for (const p of previos) {
      if (p.campo && !f.campos.some((c) => c.campo === p.campo)) f.campos.push({ campo: p.campo, mensaje: p.mensaje, pendiente: false });
    }
    // Los campos en el orden en que aparecieron (no saltan de lugar al corregirlos).
    const posicion = (c: CampoFila) => {
      const i = previos.findIndex((p) => p.campo === c.campo);
      return i < 0 ? previos.length : i;
    };
    f.campos.sort((a, b) => posicion(a) - posicion(b));
    if (previos.length) filas.set(clave, f);
  }
  const ordenadas = [...filas.values()].sort((a, b) => (orden.get(a.clave!) ?? 0) - (orden.get(b.clave!) ?? 0));
  return [...ordenadas, ...sueltas];
}

function Problemas({
  plan,
  registros,
  correcciones,
  filasCorregidas,
  onCorregir,
}: {
  plan: Plan;
  registros: Registro[];
  correcciones: Record<string, Record<string, string>>;
  filasCorregidas: FilasCorregidas;
  onCorregir: (clave: string, campo: string, valor: string) => void;
}) {
  const errores = plan.problemas.filter((p) => p.tipo === "error");
  const avisos = plan.problemas.filter((p) => p.tipo === "aviso");
  const porClave = useMemo(() => new Map(registros.map((r) => [r.clave, r])), [registros]);
  const orden = useMemo(() => new Map(registros.map((r, i) => [r.clave, i])), [registros]);
  const filas = filasParaRevisar(errores, filasCorregidas, orden);
  const conError = filas.filter((f) => !f.resuelta).length;
  const corregidas = filas.length - conError;
  if (!filas.length && !avisos.length) return null;

  return (
    <section className="es-bloque">
      <div className="es-bloque-head">
        <h3>
          {conError ? (conError === 1 ? "1 fila con error" : `${fmtNumero(conError)} filas con errores`) : "Sin errores"}
          {corregidas ? ` · ${fmtNumero(corregidas)} ${corregidas === 1 ? "corregida" : "corregidas"}` : ""}
          {avisos.length ? ` · ${avisos.length === 1 ? "1 aviso" : `${fmtNumero(avisos.length)} avisos`}` : ""}
        </h3>
        <p>
          {conError
            ? "Corregí los datos acá (o en la planilla y volvé a subirla). Si los dejás así, esas filas no se importan."
            : "Todo se puede importar. Los avisos dicen qué se completó o se interpretó solo."}
        </p>
      </div>
      {filas.length > 0 && (
        <ul className="im-problemas">
          {filas.map(({ clave, problema, campos, resuelta }, i) => {
            const r = clave ? porClave.get(clave) : undefined;
            return (
              <li key={clave ?? i} className={`im-problema ${resuelta ? "corregida" : "error"}`}>
                <span className="im-problema-donde">
                  {resuelta ? (
                    <Marca tipo="coincide" titulo="Corregida: se va a importar" />
                  ) : (
                    <Marca tipo="error" />
                  )}
                  {seccionNombre(problema)} {lugar(problema) && `· ${lugar(problema)}`}
                  {r ? ` · ${resumenRegistro(r)}` : ""}
                  {resuelta && <span className="im-chip ok">Corregida: se va a importar</span>}
                </span>
                {campos.map((c, j) => {
                  const original = r && c.campo ? aTexto(r.v[c.campo] ?? null) : "";
                  const valor = clave && c.campo ? (correcciones[clave]?.[c.campo] ?? original) : "";
                  return (
                    <div key={`${c.campo}-${j}`} className="im-problema-linea">
                      <span className={`im-problema-texto${c.pendiente ? " im-texto-error" : " im-verde-suave"}`}>
                        {c.pendiente ? c.mensaje : `Corregido (era: ${c.mensaje})`}
                      </span>
                      {clave && c.campo && (
                        <Correccion
                          key={`${clave}-${c.campo}`}
                          valor={valor}
                          opciones={opcionesCampo(c.campo, plan)}
                          onCommit={(v) => onCorregir(clave, c.campo!, v)}
                        />
                      )}
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
      )}
      {avisos.length > 0 && (
        <details className="im-detalles" open={errores.length === 0}>
          <summary>Avisos ({fmtNumero(avisos.length)})</summary>
          <ul className="im-problemas">
            {avisos.map((p, i) => (
              <li key={i} className="im-problema aviso">
                <div className="im-problema-texto">
                  <span className="im-problema-donde">
                    {seccionNombre(p)} {lugar(p) && `· ${lugar(p)}`}
                  </span>
                  <span>{p.mensaje}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const NOMBRE_SECCION_CORTO: Record<string, string> = {
  materiaPrima: "Materia prima",
  productos: "Productos",
  proveedores: "Proveedores",
  clientes: "Clientes",
  existenciaMP: "Inventario de materia prima",
  existenciaPT: "Productos terminados",
  compras: "Compras",
  ordenes: "Órdenes",
  ventas: "Ventas",
};
const seccionNombre = (p: Problema) => NOMBRE_SECCION_CORTO[p.seccion] ?? p.seccion;

/** Lo que identifica la fila para el usuario (ej. "OP 12 · Alcohol"). */
function resumenRegistro(r: Registro): string {
  const v = r.v;
  const partes =
    r.seccion === "compras"
      ? [v.numero ? `OP ${v.numero}` : "", aTexto(v.materiaPrima)]
      : r.seccion === "ventas"
        ? [v.numero ? `OP ${v.numero}` : "", aTexto(v.cliente), aTexto(v.producto)]
        : r.seccion === "ordenes"
          ? [v.numero ? `O.P. ${v.numero}` : "", aTexto(v.producto)]
          : [aTexto(v.razonSocial ?? v.nombre ?? v.materiaPrima ?? v.producto ?? null)];
  return partes.filter(Boolean).join(" · ");
}

function Correccion({ valor, opciones, onCommit }: { valor: string; opciones: string[] | null; onCommit: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  if (opciones) {
    // El dato de la planilla que no está en la lista se muestra marcado (no es una opción válida).
    const invalido = valor && !opciones.includes(valor) ? valor : null;
    return (
      <select className="im-select im-correccion" value={valor} onChange={(e) => onCommit(e.target.value)} aria-label="Corregir el dato">
        <option value="">Elegir…</option>
        {invalido && (
          <option value={invalido} disabled>
            {invalido} (no está en la app)
          </option>
        )}
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="im-input im-correccion"
      value={texto}
      placeholder="Corregir el dato"
      aria-label="Corregir el dato"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto !== valor && onCommit(texto)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && texto !== valor) onCommit(texto);
      }}
    />
  );
}

// ── Unidades de materia prima ───────────────────────────────────────────────

function Unidades({ plan, onCambiar }: { plan: Plan; onCambiar: (nombre: string, u: UnidadMedida) => void }) {
  const deducidas = plan.unidades.filter((u) => u.inferida).length;
  if (!plan.unidades.length) return null;
  const porUnidad = UNIDADES_MEDIDA.map((x) => ({ x, n: plan.unidades.filter((u) => u.unidad === x).length })).filter((g) => g.n);
  return (
    <section className="es-bloque">
      <details className="im-detalles">
        <summary>
          Unidades de las materias primas: {porUnidad.map((g) => `${g.n} en ${g.x.toLowerCase()}`).join(", ")}
          {deducidas > 0 && <span className="tenue"> · {deducidas === plan.unidades.length ? "todas" : deducidas} deducidas por el nombre (revisalas)</span>}
        </summary>
        <p className="tenue">La planilla no dice en qué se mide cada materia prima. Se dedujo por el nombre; cambiá las que no correspondan.</p>
        <div className="im-unidades">
          {plan.unidades.map((u) => (
            <label key={u.nombre} className="im-unidad">
              <span>{u.nombre}</span>
              <select className="im-select" value={u.unidad} onChange={(e) => onCambiar(u.nombre, e.target.value as UnidadMedida)}>
                {UNIDADES_MEDIDA.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}

// ── Comparación con la planilla ─────────────────────────────────────────────

function Cotejo({ plan }: { plan: Plan }) {
  if (!plan.cotejo.length) return null;
  const conErrores = plan.cotejo.filter((c) => c.estado === "conErrores").length;
  const distintas = plan.cotejo.filter((c) => c.estado === "distinto").length;
  const fmt = (n: number | null, formato: "moneda" | "numero") => (n === null ? "—" : formato === "moneda" ? fmtMoneda(n) : fmtNumero(n));
  const texto = [
    conErrores ? `${conErrores} ${conErrores === 1 ? "valor no cierra" : "valores no cierran"} por filas con error (corregilas arriba)` : "",
    distintas ? `${distintas} ${distintas === 1 ? "valor no coincide" : "valores no coinciden"} por cálculos propios de la planilla (ver avisos)` : "",
  ].filter(Boolean);
  return (
    <section className="es-bloque">
      <div className="es-bloque-head">
        <h3>Comparación con la planilla</h3>
        <p>
          {texto.length
            ? `${texto.join("; ")}. Lo que está en verde está bien.`
            : "Todo está bien: lo de la planilla queda igual en la app. Si un número difiere es por datos que ya estaban cargados en la app."}
        </p>
      </div>
      <Leyenda
        items={[
          ["coincide", "Coincide"],
          ["enApp", "Ya está en la app o la diferencia es por datos cargados en la app (está bien)"],
          ["pendiente", "Faltan filas con error"],
          ["distinto", "No coincide"],
        ]}
      />
      <div className="im-tabla-scroll">
        <table className="im-tabla">
          <thead>
            <tr>
              <th>Concepto</th>
              <th className="der">Planilla</th>
              <th className="der">En la app</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {plan.cotejo.map((c) => {
              const r = RESULTADO_COTEJO[c.estado];
              return (
                <tr key={c.concepto} className={c.estado === "distinto" || c.estado === "conErrores" ? "im-fila-distinta" : ""}>
                  <td>{c.concepto}</td>
                  <td className="der">{fmt(c.planilla, c.formato)}</td>
                  <td className="der">{fmt(c.app, c.formato)}</td>
                  <td>
                    <div className="im-resultado">
                      <Marca tipo={r.tipo}>{r.texto}</Marca>
                      <span className="tenue">{c.detalle}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Confirmar ───────────────────────────────────────────────────────────────

function Confirmar({
  plan,
  tieneDatos,
  importando,
  onImportar,
  onOtroArchivo,
}: {
  plan: Plan;
  tieneDatos: boolean;
  importando: boolean;
  onImportar: () => void;
  onOtroArchivo: () => void;
}) {
  const importados = plan.resumen.reduce((s, r) => s + r.importados, 0);
  const modificados = plan.modificaciones.filter((m) => m.aplicada).length;
  const conError = plan.resumen.reduce((s, r) => s + r.conError, 0);
  const sinElegir = conflictosSinElegir(plan);
  const bloqueado = importando || sinElegir > 0 || !hayCambios(plan);
  const sinError = conError === 1 ? " (sin la fila con error)" : conError ? ` (sin las ${fmtNumero(conError)} filas con error)` : "";
  const partes = [
    importados ? `agregar ${fmtNumero(importados)} ${importados === 1 ? "registro nuevo" : "registros nuevos"}` : "",
    modificados ? `actualizar ${fmtNumero(modificados)} ${modificados === 1 ? "registro" : "registros"}` : "",
  ].filter(Boolean);
  const accion = partes.join(" y ");
  const textoBoton = importando
    ? "Importando…"
    : sinElegir
      ? `Elegí qué dato dejar (${sinElegir === 1 ? "falta 1" : `faltan ${fmtNumero(sinElegir)}`})`
      : !accion
        ? "No hay nada nuevo para agregar ni datos que cambien"
        : tieneDatos
          ? `${accion[0].toUpperCase()}${accion.slice(1)}${sinError}`
          : `Importar ${fmtNumero(importados)} ${importados === 1 ? "registro" : "registros"}${sinError}`;
  return (
    <section className="es-bloque im-confirmar">
      {tieneDatos && (
        <div className="im-info">
          <strong>No se borra nada de lo que ya tenés en la app:</strong> se agregan los registros nuevos de la planilla y, en los que ya
          estaban, se completan los datos que faltaban y se cambian los que elegiste. Se reconocen por el CUIT o el nombre (clientes,
          proveedores, productos, materias primas) y por fecha, producto y cantidad (compras, órdenes y ventas). Antes de guardar se hace una
          copia de seguridad de la base.
        </div>
      )}
      {sinElegir > 0 && (
        <div className="im-pendiente">
          {sinElegir === 1 ? "Hay 1 dato en el que" : `Hay ${fmtNumero(sinElegir)} datos en los que`} la app y la planilla no coinciden: elegí cuál dejar en
          «Datos que cambiaron en la planilla» para poder importar.
        </div>
      )}
      <div className="im-acciones">
        <button type="button" className="tz-secondary-btn" onClick={onOtroArchivo} disabled={importando}>
          Elegir otro archivo
        </button>
        <button type="button" className="rf-trigger-btn" onClick={onImportar} disabled={bloqueado}>
          {textoBoton}
        </button>
      </div>
    </section>
  );
}

// ── Paso 3 ──────────────────────────────────────────────────────────────────

const DESTINOS: { href: string; texto: string }[] = [
  { href: "/", texto: "Panel principal" },
  { href: "/operaciones", texto: "Operaciones" },
  { href: "/trazabilidad", texto: "Trazabilidad" },
  { href: "/ordenes-produccion", texto: "Órdenes de producción" },
  { href: "/clientes", texto: "Clientes" },
  { href: "/inventario-materia-prima", texto: "Inventario de materia prima" },
];

function Resultado({ exito, onOtro }: { exito: Exito; onOtro: () => void }) {
  const total = exito.agregados;
  const existentes = exito.resumen.reduce((s, r) => s + r.existentes, 0);
  const hecho = [
    total ? (total === 1 ? "se agregó 1 registro" : `se agregaron ${fmtNumero(total)} registros`) : "",
    exito.modificados ? (exito.modificados === 1 ? "se actualizó 1 registro" : `se actualizaron ${fmtNumero(exito.modificados)} registros`) : "",
  ]
    .filter(Boolean)
    .join(" y ");
  return (
    <section className="es-bloque im-listo">
      <div className="es-bloque-head">
        <h3>
          ✓ Listo: {hecho}
          {existentes ? ` (${fmtNumero(existentes)} ya estaban sin cambios y no se tocaron)` : ""}
        </h3>
        <p>
          La app ya tiene los datos nuevos y actualizados de la planilla.
          {exito.respaldo && ` Los datos anteriores quedaron guardados en la copia de seguridad respaldos/${exito.respaldo}.`}
        </p>
      </div>
      <div className="im-tabla-scroll">
        <table className="im-tabla">
          <thead>
            <tr>
              <th>Sección</th>
              <th className="der">Agregados</th>
              <th className="der">Actualizados</th>
              <th className="der">Sin cambios</th>
              <th className="der">Con error</th>
            </tr>
          </thead>
          <tbody>
            {exito.resumen.map((r) => (
              <tr key={r.seccion}>
                <td>{r.nombre}</td>
                <td className="der">{r.importados ? <Marca tipo="nuevo">{fmtNumero(r.importados)}</Marca> : sinDato}</td>
                <td className="der">{r.modificados ? <Marca tipo="modifica">{fmtNumero(r.modificados)}</Marca> : sinDato}</td>
                <td className="der">{r.existentes ? <Marca tipo="ya">{fmtNumero(r.existentes)}</Marca> : sinDato}</td>
                <td className="der">{r.conError ? <Marca tipo="error">{fmtNumero(r.conError)}</Marca> : sinDato}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="im-acciones izq">
        {DESTINOS.map((d) => (
          <Link key={d.href} href={d.href} className="tz-secondary-btn im-link">
            {d.texto}
          </Link>
        ))}
      </div>
      <div className="im-acciones izq">
        {exito.errores.length > 0 && (
          <button type="button" className="tz-secondary-btn" onClick={() => descargarFilasConError(exito.errores.map((p) => ({ seccion: p.seccion, hoja: p.origen?.hoja ?? "", fila: p.origen?.fila ?? 0, mensaje: p.mensaje })))}>
            Descargar filas no importadas (.xlsx)
          </button>
        )}
        <button type="button" className="tz-secondary-btn" onClick={onOtro}>
          Importar otra planilla
        </button>
      </div>
    </section>
  );
}
