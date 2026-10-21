import type { Metadata } from "next";
import { Suspense } from "react";
import TrazabilidadView from "./TrazabilidadView";

export const metadata: Metadata = { title: "Trazabilidad" };

export default function TrazabilidadPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Trazabilidad</span>
      </div>
      <div className="content">
        <Suspense fallback={<div className="placeholder-view">Cargando…</div>}>
          <TrazabilidadView />
        </Suspense>
      </div>
    </>
  );
}
