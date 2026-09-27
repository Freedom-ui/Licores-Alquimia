import OrdenesProduccionView from "./OrdenesProduccionView";

export default function OrdenesProduccionPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Órdenes de producción</span>
      </div>
      <div className="content">
        <OrdenesProduccionView />
      </div>
    </>
  );
}
