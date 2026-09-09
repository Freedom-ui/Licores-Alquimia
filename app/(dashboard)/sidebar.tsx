"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const principal = { href: "/", label: "Panel principal", icon: "❖" };

const secciones = [
  {
    label: "Comercial",
    items: [
      { href: "/ventas", label: "Ventas", icon: "▤" },
      { href: "/clientes", label: "Clientes", icon: "▧" },
    ],
  },
  {
    label: "Inventario",
    items: [
      { href: "/stock", label: "Stock", icon: "☰" },
      { href: "/trazabilidad", label: "Trazabilidad", icon: "▦" },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/finanzas", label: "Finanzas", icon: "$" },
      { href: "/estadisticas", label: "Estadísticas", icon: "▨" },
    ],
  },
  {
    label: "Sistemas",
    items: [{ href: "/importacion", label: "Importación", icon: "▩" }],
  },
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
        <Link
          href={principal.href}
          className={`nav-item ${pathname === principal.href ? "active" : ""}`}
        >
          <span className="icon">{principal.icon}</span>
          {principal.label}
        </Link>

        {secciones.map((seccion) => (
          <div key={seccion.label} className="nav-section">
            <div className="nav-section-label">{seccion.label}</div>
            {seccion.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${pathname === item.href ? "active" : ""}`}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
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
