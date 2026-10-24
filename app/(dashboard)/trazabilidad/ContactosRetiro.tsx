import { formatCantidad } from "./data";
import type { ContactoRetiro } from "./rastreo";

/** Clientes que recibieron un lote, con lo necesario para avisarles si hay que retirarlo. */
export default function ContactosRetiro({ contactos }: { contactos: ContactoRetiro[] }) {
  if (contactos.length === 0) return <p className="tz-empty">Ningún cliente recibió producto de este lote.</p>;
  return (
    <div className="tz-table-wrap">
      <table className="dt-table tz-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Contacto</th>
            <th className="tz-c">Teléfono</th>
            <th>Email</th>
            <th className="tz-c">Unidades</th>
          </tr>
        </thead>
        <tbody>
          {contactos.map((c) => (
            <tr key={c.clienteId}>
              <td>{c.cliente}</td>
              <td>{c.contacto || "—"}</td>
              <td className="tz-c">{c.telefono || "—"}</td>
              <td>{c.email || "—"}</td>
              <td className="tz-c">{formatCantidad(c.cantidad)} u.</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
