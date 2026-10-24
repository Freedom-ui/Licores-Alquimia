import type { Metadata } from "next";
import { Suspense } from "react";
import ProveedoresView from "./ProveedoresView";

export const metadata: Metadata = { title: "Proveedores" };

export default function ProveedoresPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Proveedores</span>
      </div>
      <div className="content">
        <Suspense fallback={<div className="placeholder-view">Cargando…</div>}>
          <ProveedoresView />
        </Suspense>
      </div>
    </>
  );
}
