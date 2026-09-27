import OperacionesView from "./OperacionesView";

export default function OperacionesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Operaciones</span>
      </div>
      <div className="content">
        <OperacionesView />
      </div>
    </>
  );
}
