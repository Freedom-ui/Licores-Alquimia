// Marcas de estado de la importación: lo nuevo, lo que ya estaba, lo que
// coincide o no con la planilla y lo que tiene error. Mismo color e ícono en
// toda la pantalla y en el historial (CSS .im-marca).

import type { ReactNode } from "react";
import Icon, { type IconName } from "../icons";
import type { EstadoCotejo } from "../_importar/planificar";

export type TipoMarca = "nuevo" | "ya" | "modifica" | "enApp" | "coincide" | "pendiente" | "distinto" | "error";

const MARCAS: Record<TipoMarca, { icono: IconName; texto: string }> = {
  nuevo: { icono: "plus", texto: "Nuevo: se agrega" },
  ya: { icono: "equal", texto: "Ya estaba en la app: no se toca" },
  modifica: { icono: "edit", texto: "Ya estaba: se actualizan datos que cambiaron en la planilla" },
  enApp: { icono: "equal", texto: "Ya está en la app" },
  coincide: { icono: "check", texto: "Coincide" },
  pendiente: { icono: "alert", texto: "Faltan filas con error" },
  distinto: { icono: "notEqual", texto: "No coincide" },
  error: { icono: "alert", texto: "Con error: no se importa" },
};

export function Marca({ tipo, children, titulo }: { tipo: TipoMarca; children?: ReactNode; titulo?: string }) {
  return (
    <span className={`im-marca ${tipo}${children == null ? " solo" : ""}`} title={titulo ?? MARCAS[tipo].texto}>
      <Icon name={MARCAS[tipo].icono} />
      {children}
    </span>
  );
}

export function Leyenda({ items }: { items: [TipoMarca, string][] }) {
  return (
    <ul className="im-leyenda" aria-label="Referencias">
      {items.map(([tipo, texto]) => (
        <li key={tipo}>
          <Marca tipo={tipo} titulo={texto} />
          {texto}
        </li>
      ))}
    </ul>
  );
}

export const sinDato = <span className="tenue">—</span>;

/** Comparación con la planilla: verde lo que está bien (aunque los números difieran por datos de la app), ámbar lo que hay que mirar. */
export const RESULTADO_COTEJO: Record<EstadoCotejo, { tipo: TipoMarca; texto: string }> = {
  coincide: { tipo: "coincide", texto: "Coincide" },
  yaEstaba: { tipo: "enApp", texto: "Ya está en la app" },
  otrosDatos: { tipo: "enApp", texto: "Incluye datos de la app" },
  conErrores: { tipo: "pendiente", texto: "Faltan filas con error" },
  distinto: { tipo: "distinto", texto: "No coincide" },
};
