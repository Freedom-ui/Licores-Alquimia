import ProductosView from "./ProductosView";
import { productosDemo } from "./data";

export default function ProductosPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Productos</span>
      </div>
      <div className="content">
        <ProductosView initialRows={productosDemo} />
      </div>
    </>
  );
}