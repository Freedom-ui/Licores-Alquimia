import { Suspense } from "react";
import OperacionesView from "./OperacionesView";

export default function OperacionesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Operaciones</span>
      </div>
      <div className="content">
        <Suspense fallback={<div className="placeholder-view">Cargando…</div>}>
          <OperacionesView />
        </Suspense>
      </div>
    </>
  );
}
