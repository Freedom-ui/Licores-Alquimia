import type { Metadata } from "next";
import { leerEmpresa } from "@/lib/empresa";
import { estadoCopias } from "@/lib/copias/estado";
import ConfiguracionView from "./ConfiguracionView";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const empresa = await leerEmpresa();

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Configuración</span>
      </div>
      <div className="content">
        <ConfiguracionView empresa={empresa} copias={estadoCopias()} version={process.env.ALQUIMIA_VERSION ?? "desarrollo"} />
      </div>
    </>
  );
}
