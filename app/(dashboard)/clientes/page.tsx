import type { Metadata } from "next";
import ClientesView from "./ClientesView";

export const metadata: Metadata = { title: "Clientes" };

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
