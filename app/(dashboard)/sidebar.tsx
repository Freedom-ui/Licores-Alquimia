"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { panelPrincipal, navSections } from "./nav-data";
import NavTree from "./nav-tree";
import Icon from "./icons";
import { irAlLogin } from "./ControlInactividad";
import { cerrarSesion } from "../(acceso)/acciones";
import ModalShell from "@/app/components/data-table/ModalShell";
import { useImportacionEnCurso } from "./importar/enCurso";

export default function Sidebar({ usuario }: { usuario: string }) {
  const pathname = usePathname();
  const [saliendo, setSaliendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const importando = useImportacionEnCurso();

  async function handleLogout() {
    setSaliendo(true);
    try {
      await cerrarSesion();
    } finally {
      irAlLogin("salida");
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-eyebrow">Licores</div>
        <div className="brand-mark">
          <svg
            className="brand-emblem"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2 20 12 12 22 4 12Z" />
            <path d="M7.5 9.5 12 5.5l4.5 4" />
            <path d="M7.5 14.5 12 18.5l4.5-4" />
          </svg>
          <span className="brand-name">Alquimia</span>
        </div>
        <div className="brand-sub">
          <span className="flourish">✦</span>
          <span>Destilería artesanal</span>
          <span className="flourish">✦</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <Link
          href={panelPrincipal.href!}
          className={`nav-item depth-0 ${pathname === panelPrincipal.href ? "active" : ""}`}
          style={{ paddingLeft: 18 }}
        >
          <span className="nav-item-label">
            <span className="icon">
              <Icon name={panelPrincipal.icon!} />
            </span>
            <span>{panelPrincipal.label}</span>
          </span>
        </Link>

        {navSections.map((section) => (
          <NavTree key={section.label} node={section} depth={0} />
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <span className="su-nombre" title={usuario}>
            {usuario}
          </span>
        </div>
        <button className="logout-btn" onClick={() => setConfirmando(true)} disabled={saliendo}>
          {saliendo ? "Cerrando…" : "Cerrar sesión"}
        </button>
      </div>

      <ModalShell open={confirmando} title="¿Cerrar sesión?" width={440} onClose={() => !saliendo && setConfirmando(false)}>
        <div className="cf-body">
          <p className="cf-message">
            {importando
              ? "Tenés una planilla en revisión. Si cerrás la sesión, la importación se cancela y se pierde lo que hiciste (el archivo, las correcciones y las unidades elegidas). No se guardó nada en la app."
              : "Vas a tener que volver a ingresar con tu usuario y contraseña."}
          </p>
          <div className="rf-actions-row">
            <button type="button" className="rf-cancel-btn" onClick={() => setConfirmando(false)} disabled={saliendo}>
              Cancelar
            </button>
            <button type="button" className="cf-danger-btn" onClick={handleLogout} disabled={saliendo}>
              {saliendo ? "Cerrando…" : importando ? "Cerrar sesión y cancelar" : "Cerrar sesión"}
            </button>
          </div>
        </div>
      </ModalShell>
    </aside>
  );
}
