import type { Metadata } from "next";
import ProveedoresView from "./ProveedoresView";

export const metadata: Metadata = { title: "Proveedores" };

export default function ProveedoresPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Proveedores</span>
      </div>
      <div className="content">
        <ProveedoresView />
      </div>
    </>
  );
}
