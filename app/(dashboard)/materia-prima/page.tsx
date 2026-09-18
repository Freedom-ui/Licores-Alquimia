import MateriaPrimaView from "./MateriaPrimaView";
import { materiaPrimaDemo } from "./data";

export default function MateriaPrimaPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Materia prima</span>
      </div>
      <div className="content">
        <MateriaPrimaView initialRows={materiaPrimaDemo} />
      </div>
    </>
  );
}