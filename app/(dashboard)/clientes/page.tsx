import ClientesView from "./ClientesView";

export default function ClientesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Clientes</span>
      </div>
      <div className="content">
        <ClientesView />
      </div>
    </>
  );
}
