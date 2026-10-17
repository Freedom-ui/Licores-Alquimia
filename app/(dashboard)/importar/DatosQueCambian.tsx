"use client";

// Registros que ya estaban en la app y que la planilla trae con datos
// distintos. Lo que en la app estaba vacío se completa solo; si la app ya
// tenía otro dato, no se pisa: el usuario elige cuál dejar (hasta que elija,
// queda el de la app y no se puede confirmar la importación).

import { conflictosSinElegir, NOMBRES_SECCION, type Eleccion, type Plan } from "../_importar/planificar";
import { fmtNumero } from "../estadisticas/formato";
import { Marca } from "./Marca";

export type CampoElegido = { clave: string; campo: string };

export default function DatosQueCambian({ plan, onElegir }: { plan: Plan; onElegir: (campos: CampoElegido[], eleccion: Eleccion) => void }) {
  if (!plan.modificaciones.length) return null;
  const conConflicto = plan.modificaciones.filter((m) => m.cambios.some((c) => c.conflicto));
  const todos = conConflicto.flatMap((m) => m.cambios.filter((c) => c.conflicto).map((c) => ({ clave: m.clave, campo: c.campo })));
  const completados = plan.modificaciones.flatMap((m) => m.cambios.filter((c) => !c.conflicto).map((c) => ({ m, c })));
  const sinElegir = conflictosSinElegir(plan);
  const donde = (m: Plan["modificaciones"][number]) =>
    `${NOMBRES_SECCION[m.seccion]} · ${m.nombre}${m.origen.fila > 0 ? ` · ${m.origen.hoja}, fila ${m.origen.fila}` : ""}`;

  return (
    <section className={`es-bloque im-cambios${sinElegir ? " pendiente" : ""}`}>
      <div className="es-bloque-head">
        <h3>
          Datos que cambiaron en la planilla
          {sinElegir > 0 && ` · ${fmtNumero(sinElegir)} ${sinElegir === 1 ? "para elegir" : "para elegir"}`}
        </h3>
        <p>
          Estos registros ya están en la app, pero en la planilla tienen algún dato distinto (un teléfono, un email, un precio…). Un
          dato vacío en la planilla no borra el de la app.
        </p>
      </div>

      {todos.length > 0 && (
        <>
          <div className="im-cambios-barra">
            {sinElegir ? (
              <Marca tipo="pendiente" titulo="Mientras no elijas, queda el dato de la app">
                {sinElegir === 1 ? "Falta elegir 1 dato" : `Faltan elegir ${fmtNumero(sinElegir)} datos`}
              </Marca>
            ) : (
              <Marca tipo="coincide">Todo elegido</Marca>
            )}
            <span className="tenue">La app ya tenía otro dato: elegí cuál queda para que no se pisen.</span>
            <span className="im-cambios-todos">
              <button type="button" className="tz-secondary-btn" onClick={() => onElegir(todos, "app")}>
                Dejar todos los de la app
              </button>
              <button type="button" className="tz-secondary-btn" onClick={() => onElegir(todos, "planilla")}>
                Usar todos los de la planilla
              </button>
            </span>
          </div>
          <ul className="im-conflictos">
            {conConflicto.map((m) => {
              const conflictos = m.cambios.filter((c) => c.conflicto);
              const pendiente = conflictos.some((c) => c.eleccion === null);
              return (
                <li key={m.clave} className={`im-conflicto${pendiente ? " pendiente" : ""}`}>
                  <span className="im-problema-donde">
                    <Marca tipo={pendiente ? "pendiente" : "modifica"} titulo={pendiente ? "Falta elegir" : "Elegido"} />
                    {donde(m)}
                  </span>
                  {conflictos.map((c) => {
                    const nombre = `eleccion-${m.clave}-${c.campo}`;
                    const elegir = (e: Eleccion) => onElegir([{ clave: m.clave, campo: c.campo }], e);
                    return (
                      <fieldset key={c.campo} className="im-eleccion">
                        <legend>{c.etiqueta}</legend>
                        <label className={c.eleccion === "app" ? "elegida" : ""}>
                          <input type="radio" name={nombre} checked={c.eleccion === "app"} onChange={() => elegir("app")} />
                          <span className="tenue">Dejar el de la app:</span> <strong>{c.antes}</strong>
                        </label>
                        <label className={c.eleccion === "planilla" ? "elegida" : ""}>
                          <input type="radio" name={nombre} checked={c.eleccion === "planilla"} onChange={() => elegir("planilla")} />
                          <span className="tenue">Usar el de la planilla:</span> <strong>{c.despues}</strong>
                        </label>
                      </fieldset>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {completados.length > 0 && (
        <details className="im-detalles" open={todos.length === 0}>
          <summary>
            Se completan solos: {completados.length === 1 ? "1 dato que estaba vacío" : `${fmtNumero(completados.length)} datos que estaban vacíos`} en
            la app <Marca tipo="modifica">{fmtNumero(completados.length)}</Marca>
          </summary>
          <ul className="im-lista-nuevos">
            {completados.map(({ m, c }) => (
              <li key={`${m.clave}-${c.campo}`}>
                <strong>{m.nombre}</strong> · {c.etiqueta}: {c.despues}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
