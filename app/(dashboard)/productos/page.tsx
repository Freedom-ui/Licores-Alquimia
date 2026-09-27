import ProductosView from "./ProductosView";

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
