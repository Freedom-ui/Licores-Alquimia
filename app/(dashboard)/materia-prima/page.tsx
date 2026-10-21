import type { Metadata } from "next";
import MateriaPrimaView from "./MateriaPrimaView";

export const metadata: Metadata = { title: "Materia prima" };

export default function MateriaPrimaPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Materia prima</span>
      </div>
      <div className="content">
        <MateriaPrimaView />
      </div>
    </>
  );
}
