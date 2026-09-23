import ProveedoresView from "./ProveedoresView";
import { proveedoresDemo } from "./data";

export default function ProveedoresPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Proveedores</span>
      </div>
      <div className="content">
        <ProveedoresView initialRows={proveedoresDemo} />
      </div>
    </>
  );
}