import type { Metadata } from "next";
import ImportarView from "./ImportarView";
import { listarSubidas } from "../_datos/importar";

export const metadata: Metadata = { title: "Importar planilla" };

export default async function ImportarPage() {
  const subidas = await listarSubidas();
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Importar planilla</span>
      </div>
      <div className="content">
        <ImportarView subidasIniciales={subidas} />
      </div>
    </>
  );
}
