import OperacionesView from "./OperacionesView";
import { operacionesDemo } from "./data";

export default function OperacionesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Operaciones</span>
      </div>
      <div className="content">
        <OperacionesView initialRows={operacionesDemo} />
      </div>
    </>
  );
}