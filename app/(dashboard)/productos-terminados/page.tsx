import { Suspense } from "react";
import ProductosTerminadosView from "./Productosterminadosview";

export default function ProductosTerminadosPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Productos terminados</span>
      </div>
      <div className="content">
        <Suspense>
          <ProductosTerminadosView />
        </Suspense>
      </div>
    </>
  );
}
