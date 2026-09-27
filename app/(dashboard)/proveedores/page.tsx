import ProveedoresView from "./ProveedoresView";

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
