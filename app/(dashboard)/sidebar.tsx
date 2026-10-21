"use client";

import { useEffect, useState } from "react";
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
  // Pantallas angostas (< 1100 px, ver globals.css): la sidebar queda en solo
  // íconos y este botón la despliega encima del contenido.
  const [desplegada, setDesplegada] = useState(false);
  const importando = useImportacionEnCurso();

  useEffect(() => {
    if (!desplegada) return;
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") setDesplegada(false);
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [desplegada]);

  async function handleLogout() {
    setSaliendo(true);
    try {
      await cerrarSesion();
    } finally {
      irAlLogin("salida");
    }
  }

  return (
    <>
      {desplegada && <div className="sidebar-fondo" onClick={() => setDesplegada(false)} aria-hidden="true" />}
      <aside className={`sidebar ${desplegada ? "sidebar-desplegada" : ""}`}>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setDesplegada((d) => !d)}
          aria-label={desplegada ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={desplegada}
          title={desplegada ? "Cerrar menú" : "Abrir menú"}
        >
          <Icon name={desplegada ? "close" : "menu"} />
        </button>
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

        {/* Elegir una sección cierra la sidebar desplegada. */}
        <nav className="sidebar-nav" onClick={(e) => (e.target as Element).closest("a") && setDesplegada(false)}>
          <Link
            href={panelPrincipal.href!}
            className={`nav-item depth-0 ${pathname === panelPrincipal.href ? "active" : ""}`}
            style={{ paddingLeft: 18 }}
            title={panelPrincipal.label}
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
          <button className="logout-btn" onClick={() => setConfirmando(true)} disabled={saliendo} title="Cerrar sesión">
            <Icon name="logout" />
            <span>{saliendo ? "Cerrando…" : "Cerrar sesión"}</span>
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
    </>
  );
}
