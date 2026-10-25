import type { Metadata } from "next";
import PanelView from "./_panel/PanelView";
import { obtenerSesion } from "@/lib/auth/sesion";
import { alertasCopias, estadoCopias } from "@/lib/copias/estado";

export const metadata: Metadata = { title: "Panel principal" };

export default async function PanelPrincipalPage() {
  const sesion = await obtenerSesion({ tocar: false });
  const copias = estadoCopias();
  // Primera vez (o se desconectó): un cartel invita a conectar Google Drive.
  const sinDrive = copias.automaticas && copias.drive.disponible && (!copias.drive.conectado || copias.drive.desconectada);

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Panel principal</span>
      </div>
      <div className="content">
        <PanelView usuario={sesion?.username ?? ""} alertasExtra={alertasCopias(copias)} sinDrive={sinDrive} />
      </div>
    </>
  );
}
