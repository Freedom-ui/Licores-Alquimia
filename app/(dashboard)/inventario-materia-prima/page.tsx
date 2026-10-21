import type { Metadata } from "next";
import { Suspense } from "react";
import InventarioMateriaPrimaView from "./InventarioMateriaPrimaView";

export const metadata: Metadata = { title: "Inventario de materia prima" };

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
