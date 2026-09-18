import ClientesView from "./ClientesView";
import { clientesDemo } from "./data";

export default function ClientesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Clientes</span>
      </div>
      <div className="content">
        <ClientesView initialRows={clientesDemo} />
      </div>
    </>
  );
}
