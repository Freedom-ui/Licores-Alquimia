import { Suspense } from "react";
import InventarioMateriaPrimaView from "./InventarioMateriaPrimaView";

export default function InventarioMateriaPrimaPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Inventario de materia prima</span>
      </div>
      <div className="content">
        <Suspense>
          <InventarioMateriaPrimaView />
        </Suspense>
      </div>
    </>
  );
}
