"use client";

import { useMemo, useState } from "react";
import type { Cliente } from "@/app/generated/prisma/client";

type ClienteForm = {
  razonSocial: string;
  apellidoNombre: string;
  condIva: string;
  cuit: string;
  telCel: string;
  mail: string;
  domicilio: string;
};

const formVacio: ClienteForm = {
  razonSocial: "",
  apellidoNombre: "",
  condIva: "",
  cuit: "",
  telCel: "",
  mail: "",
  domicilio: "",
};

function clienteAForm(c: Cliente): ClienteForm {
  return {
    razonSocial: c.razonSocial ?? "",
    apellidoNombre: c.apellidoNombre ?? "",
    condIva: c.condIva ?? "",
    cuit: c.cuit ?? "",
    telCel: c.telCel ?? "",
    mail: c.mail ?? "",
    domicilio: c.domicilio ?? "",
  };
}

export default function ClientesClient({
  clientesIniciales,
}: {
  clientesIniciales: Cliente[];
}) {
  const [clientes, setClientes] = useState<Cliente[]>(clientesIniciales);
  const [query, setQuery] = useState("");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<ClienteForm>(formVacio);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  function mostrarToast(msg: string) {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2800);
  }

  const clientesFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.razonSocial, c.apellidoNombre, c.condIva, c.cuit, c.telCel, c.mail, c.domicilio]
        .filter(Boolean)
        .some((valor) => valor!.toLowerCase().includes(q))
    );
  }, [clientes, query]);

  function abrirNuevo() {
    setEditando(null);
    setForm(formVacio);
    setError("");
    setModalAbierto(true);
  }

  function abrirEditar(cliente: Cliente) {
    setEditando(cliente);
    setForm(clienteAForm(cliente));
    setError("");
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false);
  }

  function actualizarCampo(campo: keyof ClienteForm, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardarCliente(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.razonSocial.trim() && !form.apellidoNombre.trim()) {
      setError("Ingresá al menos Razón social o Apellido y nombre");
      return;
    }

    setGuardando(true);
    try {
      const url = editando ? `/api/clientes/${editando.id}` : "/api/clientes";
      const method = editando ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al guardar el cliente");
        setGuardando(false);
        return;
      }

      if (editando) {
        setClientes((prev) => prev.map((c) => (c.id === data.id ? data : c)));
        mostrarToast(`Cliente "${data.razonSocial || data.apellidoNombre}" actualizado`);
      } else {
        setClientes((prev) =>
          [...prev, data].sort((a, b) =>
            (a.razonSocial || a.apellidoNombre || "").localeCompare(
              b.razonSocial || b.apellidoNombre || ""
            )
          )
        );
        mostrarToast(`Cliente "${data.razonSocial || data.apellidoNombre}" agregado`);
      }

      setModalAbierto(false);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarCliente(cliente: Cliente) {
    const nombre = cliente.razonSocial || cliente.apellidoNombre || "este cliente";
    if (!window.confirm(`¿Eliminar a "${nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setEliminandoId(cliente.id);
    try {
      const res = await fetch(`/api/clientes/${cliente.id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        mostrarToast(data.error || "No se pudo eliminar el cliente");
        return;
      }

      setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
      mostrarToast(`Cliente "${nombre}" eliminado`);
    } catch {
      mostrarToast("No se pudo conectar con el servidor");
    } finally {
      setEliminandoId(null);
    }
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Clientes</span>
      </div>

      <div className="content">
        <div className="section-title">Base de datos de clientes</div>
        <div className="section-sub">
          {clientes.length} cliente{clientes.length === 1 ? "" : "s"} cargado
          {clientes.length === 1 ? "" : "s"}
        </div>

        <div className="toolbar">
          <div className="search-box">
            <span>◎</span>
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="toolbar-spacer" />
          <button className="btn btn-primary" onClick={abrirNuevo}>
            + Nuevo cliente
          </button>
        </div>

        <div className="panel">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Razón social</th>
                  <th>Apellido y nombre</th>
                  <th>Cond. IVA</th>
                  <th>CUIT</th>
                  <th>Tel/Cel</th>
                  <th>Mail</th>
                  <th>Domicilio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={8}>
                      {clientes.length === 0
                        ? "Todavía no hay clientes cargados."
                        : "Ningún cliente coincide con la búsqueda."}
                    </td>
                  </tr>
                )}
                {clientesFiltrados.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.razonSocial || "—"}</strong>
                    </td>
                    <td className="muted">{c.apellidoNombre || "—"}</td>
                    <td>
                      {c.condIva ? (
                        <span className="badge badge-blue">{c.condIva}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="mono muted">{c.cuit || "—"}</td>
                    <td className="muted">{c.telCel || "—"}</td>
                    <td className="muted">{c.mail || "—"}</td>
                    <td className="muted">{c.domicilio || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirEditar(c)}>
                          Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => eliminarCliente(c)}
                          disabled={eliminandoId === c.id}
                        >
                          {eliminandoId === c.id ? "..." : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════ MODAL NUEVO / EDITAR CLIENTE ═══════ */}
      <div className={`modal-overlay ${modalAbierto ? "open" : ""}`} onClick={(e) => e.target === e.currentTarget && cerrarModal()}>
        <div className="modal" style={{ width: "min(560px, 96vw)" }}>
          <form onSubmit={guardarCliente}>
            <div className="modal-header">
              <span>◈</span>
              <h2>{editando ? "Editar cliente" : "Nuevo cliente"}</h2>
              <button type="button" className="modal-close" onClick={cerrarModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="form-error">{error}</div>}

              <div className="form-row cols-2">
                <div className="form-group">
                  <label>Razón social</label>
                  <input
                    type="text"
                    placeholder="Empresa S.R.L."
                    value={form.razonSocial}
                    onChange={(e) => actualizarCampo("razonSocial", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Apellido y nombre</label>
                  <input
                    type="text"
                    placeholder="Pérez, Juan"
                    value={form.apellidoNombre}
                    onChange={(e) => actualizarCampo("apellidoNombre", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Cond. IVA</label>
                  <input
                    type="text"
                    placeholder="RI, Monotributo, CF..."
                    value={form.condIva}
                    onChange={(e) => actualizarCampo("condIva", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>CUIT</label>
                  <input
                    type="text"
                    placeholder="20 - 00000000 - 0"
                    value={form.cuit}
                    onChange={(e) => actualizarCampo("cuit", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Tel/Cel</label>
                  <input
                    type="text"
                    placeholder="0223 000-0000"
                    value={form.telCel}
                    onChange={(e) => actualizarCampo("telCel", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Mail</label>
                  <input
                    type="email"
                    placeholder="cliente@mail.com"
                    value={form.mail}
                    onChange={(e) => actualizarCampo("mail", e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Domicilio</label>
                  <input
                    type="text"
                    placeholder="Calle 123, Localidad"
                    value={form.domicilio}
                    onChange={(e) => actualizarCampo("domicilio", e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="submit" className="btn btn-primary" disabled={guardando}>
                {guardando ? "Guardando..." : "✓ Guardar cliente"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cerrarModal}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className={`toast ${toastVisible ? "show" : ""}`}>{toast}</div>
    </>
  );
}
