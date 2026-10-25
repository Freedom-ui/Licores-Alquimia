"use client";

// Historial de subidas de planillas: cada archivo que se subió, cuándo, quién,
// qué se encontró, qué se importó, qué filas tuvieron error y cómo dio la
// comparación con la planilla. Lo anota ImportarView (ver _importar/historial.ts).

import * as XLSX from "xlsx";
import { NOMBRES_SECCION } from "../_importar/planificar";
import type { EstadoSubida, Subida } from "../_importar/historial";
import type { SeccionRegistro } from "../_importar/tipos";
import { fmtMoneda, fmtNumero } from "../estadisticas/formato";
import { Marca, RESULTADO_COTEJO, sinDato, type TipoMarca } from "./Marca";

const ESTADO: Record<EstadoSubida, { tipo: TipoMarca; texto: string; ayuda: string }> = {
  importada: { tipo: "coincide", texto: "Importada", ayuda: "Se agregaron los registros nuevos a la app." },
  sinNovedades: { tipo: "enApp", texto: "Ya estaba todo", ayuda: "Todo lo de la planilla ya estaba en la app: no se agregó nada." },
  revision: { tipo: "ya", texto: "No se importó", ayuda: "Se subió y se revisó, pero no se confirmó la importación." },
  fallo: { tipo: "error", texto: "Falló al guardar", ayuda: "No se pudo guardar en la base de datos; no se cambió nada." },
  noLeida: { tipo: "error", texto: "No se pudo leer", ayuda: "El archivo no se pudo leer o no tenía tablas de la app." },
};

const nombreSeccion = (s: string) => NOMBRES_SECCION[s as SeccionRegistro] ?? s;

function fechaHora(iso: string, conSegundos = false): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", ...(conSegundos ? { second: "2-digit" } : {}), hour12: false });
  return `${fecha} ${hora} h`;
}

function tamano(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${fmtNumero(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`;
  return `${fmtNumero(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

type CambioGuardado = Subida["detalle"]["modificaciones"][number]["cambios"][number];

/** Qué pasó con un dato que cambió: se completó, se cambió, o se dejó el de la app. */
function resultadoCambio(c: CambioGuardado, importada: boolean): string {
  if (!c.conflicto) return `${importada ? "se completó" : "se completaba"} con ${c.despues} (estaba vacío)`;
  if (c.eleccion === "planilla") return `${c.antes} → ${c.despues} (${importada ? "se usó" : "se elegía"} el de la planilla)`;
  if (c.eleccion === "app") return `se dejó ${c.antes} (la planilla decía ${c.despues})`;
  return `sin elegir: quedó ${c.antes} (la planilla decía ${c.despues})`;
}

export type FilaConError = { seccion: string; hoja: string; fila: number; mensaje: string };

/** Descarga las filas que no se importaron, para corregirlas en la planilla. */
export function descargarFilasConError(filas: FilaConError[], archivo = "Filas no importadas.xlsx") {
  const datos = [["Sección", "Hoja", "Fila", "Problema"], ...filas.map((p) => [nombreSeccion(p.seccion), p.hoja, p.fila || "", p.mensaje])];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(datos);
  ws["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 8 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, ws, "Filas no importadas");
  XLSX.writeFile(wb, archivo);
}

export default function Historial({ subidas }: { subidas: Subida[] }) {
  return (
    <section className="es-bloque">
      <div className="es-bloque-head">
        <h3>Historial de subidas</h3>
        <p>
          {subidas.length
            ? "Cada planilla que se subió, con la fecha y hora, lo que se encontró, lo que se importó y las filas con error. Abrí una para ver el detalle."
            : "Todavía no se subió ninguna planilla."}
        </p>
      </div>
      {subidas.length > 0 && (
        <div className="im-historial">
          {subidas.map((s) => (
            <SubidaFila key={s.id} s={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function SubidaFila({ s }: { s: Subida }) {
  const e = ESTADO[s.estado];
  const d = s.detalle;
  const leida = s.estado !== "noLeida";
  const actualizados = d.modificaciones.filter((m) => m.cambios.some((c) => c.aplicado)).length;
  return (
    <details className="im-subida">
      <summary>
        <span className="im-subida-fecha">{fechaHora(s.fecha)}</span>
        <span className="im-subida-archivo" title={s.archivo}>
          {s.archivo}
        </span>
        <span className="im-subida-marcas">
          <Marca tipo={e.tipo} titulo={e.ayuda}>
            {e.texto}
          </Marca>
          {s.agregados > 0 && <Marca tipo="nuevo" titulo="Registros agregados a la app">{fmtNumero(s.agregados)}</Marca>}
          {actualizados > 0 && (
            <Marca tipo="modifica" titulo={s.estado === "importada" ? "Registros actualizados" : "Registros con datos distintos (no se importó)"}>
              {fmtNumero(actualizados)}
            </Marca>
          )}
          {s.existentes > 0 && <Marca tipo="ya" titulo="Ya estaban en la app">{fmtNumero(s.existentes)}</Marca>}
          {s.conError > 0 && <Marca tipo="error" titulo="Filas con error (no se importaron)">{fmtNumero(s.conError)}</Marca>}
        </span>
      </summary>

      <div className="im-subida-cuerpo">
        <p>
          {e.ayuda} Subida el {fechaHora(s.fecha, true)} por <strong>{s.usuario}</strong>.
        </p>
        {s.error && <div className="rf-error">{s.error}</div>}
        <ul className="im-subida-datos">
          {d.archivos.map((a) => (
            <li key={a.nombre}>
              Archivo: <strong>{a.nombre}</strong> <span className="tenue">({tamano(a.tamano)})</span>
            </li>
          ))}
          {leida && d.hojas > 0 && (
            <li>
              {d.hojas === 1 ? "1 hoja" : `${fmtNumero(d.hojas)} hojas`} · {d.tablas.length === 1 ? "1 tabla reconocida" : `${fmtNumero(d.tablas.length)} tablas reconocidas`}
              {d.tablasNoImportadas > 0 && ` · ${fmtNumero(d.tablasNoImportadas)} que no se importan`}
            </li>
          )}
          {s.avisos > 0 && <li>{s.avisos === 1 ? "1 aviso" : `${fmtNumero(s.avisos)} avisos`} (datos completados o interpretados solos)</li>}
          {s.respaldo && (
            <li>
              Copia de seguridad antes de importar: <code>{s.respaldo}</code> (en Configuración → Copias de seguridad)
            </li>
          )}
        </ul>

        {d.tablas.length > 0 && (
          <details className="im-detalles">
            <summary>Tablas reconocidas ({fmtNumero(d.tablas.length)})</summary>
            <ul className="im-ignoradas">
              {d.tablas.map((t, i) => (
                <li key={i}>
                  {t.seccion}
                  <span className="tenue">
                    {" "}
                    · {t.hoja} «{t.titulo}» · {fmtNumero(t.filas)} filas
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {d.resumen.length > 0 && (
          <div className="im-tabla-scroll">
            <table className="im-tabla">
              <thead>
                <tr>
                  <th>Sección</th>
                  <th className="der">En la planilla</th>
                  <th className="der">Sin cambios</th>
                  <th className="der">{s.estado === "importada" ? "Actualizados" : "Con datos distintos"}</th>
                  <th className="der">{s.estado === "importada" ? "Agregados" : "Nuevos"}</th>
                  <th className="der">Con error</th>
                </tr>
              </thead>
              <tbody>
                {d.resumen.map((r) => (
                  <tr key={r.nombre}>
                    <td>{r.nombre}</td>
                    <td className="der">{fmtNumero(r.total)}</td>
                    <td className="der">{r.existentes ? <Marca tipo="ya">{fmtNumero(r.existentes)}</Marca> : sinDato}</td>
                    <td className="der">{r.modificados ? <Marca tipo="modifica">{fmtNumero(r.modificados)}</Marca> : sinDato}</td>
                    <td className="der">
                      {r.importados ? (
                        <Marca tipo="nuevo" titulo={s.estado === "importada" ? "Se agregaron" : "No se agregaron: la importación no se confirmó"}>
                          {fmtNumero(r.importados)}
                        </Marca>
                      ) : (
                        sinDato
                      )}
                    </td>
                    <td className="der">{r.conError ? <Marca tipo="error">{fmtNumero(r.conError)}</Marca> : sinDato}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {d.modificaciones.length > 0 && (
          <details className="im-detalles">
            <summary>Datos que cambiaron en la planilla ({fmtNumero(d.modificaciones.length)} registros)</summary>
            <ul className="im-problemas">
              {d.modificaciones.map((m, i) => (
                <li key={i} className="im-problema">
                  <span className="im-problema-donde">
                    <Marca tipo="modifica" />
                    {nombreSeccion(m.seccion)} · {m.nombre}
                    {m.fila > 0 && ` · ${m.hoja}, fila ${m.fila}`}
                  </span>
                  <ul className="im-lista-cambios">
                    {m.cambios.map((c, j) => (
                      <li key={j}>
                        {c.etiqueta}: {resultadoCambio(c, s.estado === "importada")}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        )}

        {d.errores.length > 0 && (
          <details className="im-detalles">
            <summary>
              Filas con error ({fmtNumero(d.totalErrores || d.errores.length)}
              {d.totalErrores > d.errores.length ? `, se guardaron las primeras ${fmtNumero(d.errores.length)}` : ""})
            </summary>
            <ul className="im-problemas">
              {d.errores.slice(0, 100).map((p, i) => (
                <li key={i} className="im-problema error">
                  <span className="im-problema-donde">
                    <Marca tipo="error" />
                    {nombreSeccion(p.seccion)}
                    {p.fila > 0 && ` · ${p.hoja}, fila ${p.fila}`}
                  </span>
                  <span className="im-texto-error">{p.mensaje}</span>
                </li>
              ))}
              {d.errores.length > 100 && <li className="im-problema tenue">… y {fmtNumero(d.errores.length - 100)} más (están en el archivo para descargar)</li>}
            </ul>
            <button type="button" className="tz-secondary-btn" onClick={() => descargarFilasConError(d.errores)}>
              Descargar filas con error (.xlsx)
            </button>
          </details>
        )}

        {d.cotejo.length > 0 && (
          <details className="im-detalles">
            <summary>Comparación con la planilla</summary>
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
                  {d.cotejo.map((c) => {
                    const r = RESULTADO_COTEJO[c.estado];
                    const fmt = (n: number | null) => (n === null ? "—" : c.formato === "moneda" ? fmtMoneda(n) : fmtNumero(n));
                    return (
                      <tr key={c.concepto}>
                        <td>{c.concepto}</td>
                        <td className="der">{fmt(c.planilla)}</td>
                        <td className="der">{fmt(c.app)}</td>
                        <td>
                          <div className="im-resultado">
                            <Marca tipo={r.tipo}>{r.texto}</Marca>
                            {c.detalle && <span className="tenue">{c.detalle}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {d.avisos.length > 0 && (
          <details className="im-detalles">
            <summary>Avisos ({fmtNumero(s.avisos || d.avisos.length)})</summary>
            <ul className="im-lista-avisos">
              {d.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}
