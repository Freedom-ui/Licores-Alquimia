export type NavNode = {
  label: string;
  href?: string; // si tiene href, es clickeable / navegable
  icon?: string;
  children?: NavNode[];
};

export const panelPrincipal: NavNode = {
  label: "Panel principal",
  href: "/",
  icon: "❖",
};

export const navSections: NavNode[] = [
  {
    label: "Estados contables",
    icon: "▦",
    children: [
      { label: "Est. de sit. patrimonial", href: "/estados-contables/situacion-patrimonial" },
      { label: "EERR", href: "/estados-contables/eerr" },
      { label: "EEPN", href: "/estados-contables/eepn" },
      { label: "EFE", href: "/estados-contables/efe" },
    ],
  },
  {
    label: "Cuentas de Activo",
    icon: "▤",
    children: [
      { label: "Disponibilidades", href: "/cuentas-activo/disponibilidades" },
      { label: "Créditos", href: "/cuentas-activo/creditos" },
      { label: "Inversiones", href: "/cuentas-activo/inversiones" },
      { label: "Bienes de cambio", href: "/cuentas-activo/bienes-cambio" },
      { label: "Bienes de uso", href: "/cuentas-activo/bienes-uso" },
      { label: "Gastos adelantados", href: "/cuentas-activo/gastos-adelantados" },
    ],
  },
  {
    label: "Cuentas de Pasivo",
    icon: "▥",
    children: [
      { label: "Lorem ipsum", href: "/cuentas-pasivo/lorem-1" },
      { label: "Lorem ipsum", href: "/cuentas-pasivo/lorem-2" },
    ],
  },
  {
    label: "Cuentas de Patrim. Neto",
    icon: "▧",
    children: [
      { label: "Lorem ipsum", href: "/cuentas-patrimonio-neto/lorem-1" },
      { label: "Lorem ipsum", href: "/cuentas-patrimonio-neto/lorem-2" },
    ],
  },
  {
    label: "Cuentas de Resultados",
    icon: "▨",
    children: [
      {
        label: "Ventas",
        children: [
          { label: "CPTyV", href: "/cuentas-resultados/ventas/cptyv" },
          { label: "CIF", href: "/cuentas-resultados/ventas/cif" },
          { label: "Gastos generales", href: "/cuentas-resultados/ventas/gastos-generales" },
          { label: "RDOS. Fin. y x Ten.", href: "/cuentas-resultados/ventas/rdos-fin-ten" },
          { label: "RDOS. Extraordinarios", href: "/cuentas-resultados/ventas/rdos-extraordinarios" },
          { label: "Pérdidas/Gcias. normales", href: "/cuentas-resultados/ventas/perdidas-ganancias" },
          { label: "Deudas incobrables", href: "/cuentas-resultados/ventas/deudas-incobrables" },
        ],
      },
      { label: "Operaciones", href: "/cuentas-resultados/operaciones" },
      { label: "Trazabilidad", href: "/cuentas-resultados/trazabilidad" },
    ],
  },
  {
    label: "Bases de datos",
    icon: "▩",
    children: [
      { label: "Productos", href: "/bases-datos/productos" },
      { label: "Vendedores", href: "/bases-datos/vendedores" },
      { label: "Proveedores", href: "/bases-datos/proveedores" },
      { label: "Clientes", href: "/bases-datos/clientes" },
      { label: "Materia prima", href: "/bases-datos/materia-prima" },
      { label: "Entidades Bancarias", href: "/bases-datos/entidades-bancarias" },
      { label: "Transporte", href: "/bases-datos/transporte" },
    ],
  },
  {
    label: "Gestión",
    icon: "⚙",
    children: [
      { label: "Estadísticas", href: "/gestion/estadisticas" },
      { label: "Importación", href: "/gestion/importacion" },
    ],
  },
];