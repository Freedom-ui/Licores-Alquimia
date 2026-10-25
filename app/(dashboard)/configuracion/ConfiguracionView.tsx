"use client";

import type { Empresa } from "@/app/empresa";
import type { EstadoCopias } from "@/lib/copias/estado";
import CopiasBloque from "./CopiasBloque";
import EmpresaBloque from "./EmpresaBloque";
import AcercaBloque from "./AcercaBloque";

/** Configuración: copias de seguridad, datos del establecimiento y versión de la app. */
export default function ConfiguracionView({ empresa, copias, version }: { empresa: Empresa; copias: EstadoCopias; version: string }) {
  return (
    <div className="cg-wrapper">
      <CopiasBloque inicial={copias} />
      <EmpresaBloque inicial={empresa} />
      <AcercaBloque version={version} carpeta={copias.carpeta} escritorio={copias.escritorio} />
    </div>
  );
}
