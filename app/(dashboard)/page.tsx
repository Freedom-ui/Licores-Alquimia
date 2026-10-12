import type { Metadata } from "next";
import PanelView from "./_panel/PanelView";
import { obtenerSesion } from "@/lib/auth/sesion";

export const metadata: Metadata = { title: "Panel principal" };

export default async function PanelPrincipalPage() {
  const sesion = await obtenerSesion({ tocar: false });

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Panel principal</span>
      </div>
      <div className="content">
        <PanelView usuario={sesion?.username ?? ""} />
      </div>
    </>
  );
}
