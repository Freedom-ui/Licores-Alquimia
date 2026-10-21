import type { Metadata } from "next";
import ProductosView from "./ProductosView";

export const metadata: Metadata = { title: "Productos" };

export default function ProductosPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Productos</span>
      </div>
      <div className="content">
        <ProductosView />
      </div>
    </>
  );
}
