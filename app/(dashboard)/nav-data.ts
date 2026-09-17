export type NavNode = {
  label: string;
  href?: string; // si tiene href, es clickeable / navegable
  icon?: string;
  children?: NavNode[];
};

export const panelPrincipal: NavNode = {
  label: "Panel principal",
  href: "/",
  icon: "home",
};

export const navSections: NavNode[] = [
  { label: "Trazabilidad", href: "/trazabilidad", icon: "route" },
  { label: "Operaciones", href: "/operaciones", icon: "swap" },
  { label: "Productos terminados", href: "/productos-terminados", icon: "bottle" },
  { label: "Órdenes de producción", href: "/ordenes-produccion", icon: "clipboard" },
  { label: "Inventario de materia prima", href: "/inventario-materia-prima", icon: "boxes" },
  { label: "Materia prima", href: "/materia-prima", icon: "leaf" },
  { label: "Productos", href: "/productos", icon: "tag" },
  { label: "Proveedores", href: "/proveedores", icon: "truck" },
  { label: "Clientes", href: "/clientes", icon: "users" },
  { label: "Estadísticas", href: "/estadisticas", icon: "chart" },
];
