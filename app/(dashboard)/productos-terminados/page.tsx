import ProductosTerminadosView from "./Productosterminadosview";
import { productosTerminadosDemo } from "./data";

export default function ProductosTerminadosPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Productos terminados</span>
      </div>
      <div className="content">
        <ProductosTerminadosView initialLotes={productosTerminadosDemo} />
      </div>
    </>
  );
}