"use client";

import { useMemo, useState, type FormEvent } from "react";
import ModalShell from "@/app/components/data-table/ModalShell";
import { LARGO_NOMBRE } from "@/app/components/data-table/validacion";
import { useStore } from "../store";
import { validarVendedor } from "../_dominio/reglas";

const mensajeDe = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto);

/**
 * Catálogo de vendedores (el select de cada venta). Se agregan, se renombran
 * (el nombre nuevo se aplica también a sus ventas) y se eliminan solo si no
 * tienen ventas.
 */
export default function VendedoresModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { vendedores, operaciones, addVendedor, updateVendedor, deleteVendedor } = store;
  const [nuevo, setNuevo] = useState("");
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: number; nombre: string; error: string | null } | null>(null);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ventasPorVendedor = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of operaciones) m.set(o.vendedor, (m.get(o.vendedor) ?? 0) + 1);
    return m;
  }, [operaciones]);
  const lista = useMemo(() => [...vendedores].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [vendedores]);

  function cerrar() {
    if (ocupado) return;
    setNuevo("");
    setErrorNuevo(null);
    setEditando(null);
    setBorrando(null);
    setError(null);
    onClose();
  }

  async function guardar(accion: () => Promise<void>, alFallar: (mensaje: string) => void) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      return true;
    } catch (err) {
      alFallar(mensajeDe(err, "No se pudo guardar el cambio."));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function agregar(e: FormEvent) {
    e.preventDefault();
    const r = validarVendedor({ nombre: nuevo }, store, null);
    if (!r.ok) return setErrorNuevo(r.errores.nombre ?? "Revisá el nombre.");
    if (await guardar(() => addVendedor({ nombre: nuevo }), setErrorNuevo)) {
      setNuevo("");
      setErrorNuevo(null);
    }
  }

  async function renombrar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const r = validarVendedor({ nombre: editando.nombre }, store, editando.id);
    if (!r.ok) return setEditando({ ...editando, error: r.errores.nombre ?? "Revisá el nombre." });
    if (await guardar(() => updateVendedor(editando.id, { nombre: editando.nombre }), (m) => setEditando({ ...editando, error: m }))) {
      setEditando(null);
    }
  }

  async function eliminar(id: number) {
    await guardar(() => deleteVendedor(id), setError);
    setBorrando(null);
  }

  return (
    <ModalShell open={open} eyebrow="Operaciones" title="Vendedores" width={600} onClose={cerrar}>
      <div className="tz-body">
        <form className="vd-alta" onSubmit={agregar} noValidate>
          <div className="rf-field">
            <label htmlFor="vd-nuevo">Nuevo vendedor</label>
            <input
              id="vd-nuevo"
              type="text"
              value={nuevo}
              maxLength={LARGO_NOMBRE}
              placeholder="Ej: PÉREZ, JUAN"
              className={errorNuevo ? "rf-input-error" : undefined}
              aria-invalid={errorNuevo ? true : undefined}
              onChange={(e) => {
                setNuevo(e.target.value);
                setErrorNuevo(null);
              }}
            />
            {errorNuevo && <span className="rf-field-error">{errorNuevo}</span>}
          </div>
          <button type="submit" className="rf-submit-btn" disabled={ocupado || !nuevo.trim()}>
            Agregar
          </button>
        </form>

        <section>
          <h3 className="tz-h">
            {lista.length} {lista.length === 1 ? "vendedor" : "vendedores"}
          </h3>
          {lista.length === 0 ? (
            <p className="tz-empty">Todavía no hay vendedores: agregá el primero arriba.</p>
          ) : (
            <div className="tz-table-wrap vd-tabla">
              <table className="dt-table tz-table">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th className="tz-c">Ventas</th>
                    <th className="dt-actions-col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((v) => {
                    const ventas = ventasPorVendedor.get(v.nombre) ?? 0;
                    if (editando?.id === v.id) {
                      return (
                        <tr key={v.id}>
                          <td colSpan={3}>
                            <form className="vd-editar" onSubmit={renombrar} noValidate>
                              <div className="rf-field">
                                <input
                                  autoFocus
                                  aria-label={`Nuevo nombre de ${v.nombre}`}
                                  type="text"
                                  value={editando.nombre}
                                  maxLength={LARGO_NOMBRE}
                                  className={editando.error ? "rf-input-error" : undefined}
                                  onChange={(e) => setEditando({ ...editando, nombre: e.target.value, error: null })}
                                  onKeyDown={(e) => {
                                    // Esc cancela el renombrado sin cerrar el modal.
                                    if (e.key === "Escape") {
                                      e.stopPropagation();
                                      e.nativeEvent.stopImmediatePropagation();
                                      setEditando(null);
                                    }
                                  }}
                                />
                                {editando.error && <span className="rf-field-error">{editando.error}</span>}
                                {ventas > 0 && !editando.error && (
                                  <span className="vd-nota">El nombre nuevo se aplica también a sus {ventas} ventas.</span>
                                )}
                              </div>
                              <button type="button" className="rf-cancel-btn" onClick={() => setEditando(null)} disabled={ocupado}>
                                Cancelar
                              </button>
                              <button type="submit" className="rf-submit-btn" disabled={ocupado}>
                                Guardar
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={v.id}>
                        <td title={v.nombre}>{v.nombre}</td>
                        <td className="tz-c">{ventas}</td>
                        <td className="dt-actions-cell">
                          {borrando === v.id ? (
                            <span className="vd-confirmar">
                              ¿Eliminar?
                              <button type="button" className="cf-danger-btn" onClick={() => eliminar(v.id)} disabled={ocupado}>
                                {ocupado ? "Eliminando…" : "Sí"}
                              </button>
                              <button type="button" className="rf-cancel-btn" onClick={() => setBorrando(null)} disabled={ocupado}>
                                No
                              </button>
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="dt-row-action-btn"
                                aria-label={`Renombrar ${v.nombre}`}
                                title="Renombrar"
                                onClick={() => {
                                  setError(null);
                                  setBorrando(null);
                                  setEditando({ id: v.id, nombre: v.nombre, error: null });
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
                                  <path d="M13.5 6.5l4 4" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="dt-row-action-btn danger"
                                aria-label={`Eliminar ${v.nombre}`}
                                title={ventas > 0 ? "Tiene ventas: no se puede eliminar" : "Eliminar"}
                                onClick={() => {
                                  setError(null);
                                  setEditando(null);
                                  setBorrando(v.id);
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4.5 7h15" />
                                  <path d="M9 7V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8V7" />
                                  <path d="M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L18.5 7" />
                                  <path d="M10 11v6" />
                                  <path d="M14 11v6" />
                                </svg>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {error && <div className="rf-error">{error}</div>}
        </section>

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={cerrar} disabled={ocupado}>
            Cerrar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
