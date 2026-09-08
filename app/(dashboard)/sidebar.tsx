"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/ventas", label: "Ventas", icon: "▤" },
  { href: "/stock", label: "Stock", icon: "▥" },
  { href: "/trazabilidad", label: "Trazabilidad", icon: "▦" },
  { href: "/clientes", label: "Clientes", icon: "▧" },
  { href: "/estadisticas", label: "Estadísticas", icon: "▨" },
];

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
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname === item.href ? "active" : ""}`}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </Link>
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