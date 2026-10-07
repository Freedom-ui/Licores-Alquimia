import { Suspense } from "react";
import OrdenesProduccionView from "./OrdenesProduccionView";

export default function OrdenesProduccionPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Órdenes de producción</span>
      </div>
      <div className="content">
        <Suspense fallback={<div className="placeholder-view">Cargando…</div>}>
          <OrdenesProduccionView />
        </Suspense>
      </div>
    </>
  );
}
