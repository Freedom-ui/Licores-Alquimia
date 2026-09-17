"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { panelPrincipal, navSections } from "./nav-data";
import NavTree from "./nav-tree";
import Icon from "./icons";

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
