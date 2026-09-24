import OrdenesProduccionView from "./OrdenesProduccionView";
import { ordenesProduccionDemo } from "./data";

export default function OrdenesProduccionPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Órdenes de producción</span>
      </div>
      <div className="content">
        <OrdenesProduccionView initialRows={ordenesProduccionDemo} />
      </div>
    </>
  );
}
