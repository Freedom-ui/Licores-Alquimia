import type { Metadata } from "next";
import { Suspense } from "react";
import EstadisticasView from "./EstadisticasView";

export const metadata: Metadata = { title: "Estadísticas" };

export default function EstadisticasPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Estadísticas</span>
      </div>
      <div className="content">
        <Suspense fallback={<div className="placeholder-view">Cargando estadísticas…</div>}>
          <EstadisticasView />
        </Suspense>
      </div>
    </>
  );
}
