"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { panelPrincipal, navSections } from "./nav-data";
import NavTree from "./nav-tree";

export default function Sidebar({
  usuario,
}: {
  usuario: { username: string; rol: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-name">Licores Alquimia</div>
        <div className="brand-sub">Sistema de Gestión</div>
      </div>

      <nav className="sidebar-nav">
        <Link
          href={panelPrincipal.href!}
          className={`nav-item depth-0 ${pathname === panelPrincipal.href ? "active" : ""}`}
          style={{ paddingLeft: 18 }}
        >
          <span className="nav-item-label">
            <span className="icon">{panelPrincipal.icon}</span>
            <span>{panelPrincipal.label}</span>
          </span>
        </Link>

        {navSections.map((section) => (
          <NavTree key={section.label} node={section} depth={0} />
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <span className="su-nombre">{usuario.username}</span>
          <span className="su-rol">{usuario.rol}</span>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
