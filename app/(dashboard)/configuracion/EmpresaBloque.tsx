"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ErrorCampo } from "@/app/components/data-table/FormFields";
import { useErroresFormulario } from "@/app/components/data-table/useErroresFormulario";
import { LARGO_CORTO, LARGO_DOMICILIO, LARGO_NOMBRE } from "@/app/components/data-table/validacion";
import { fijarEmpresa, lineaDatosEmpresa, validarEmpresa, type Empresa } from "@/app/empresa";
import { guardarEmpresa } from "./acciones";

const CAMPOS: { campo: keyof Empresa; label: string; max: number; ejemplo: string; full?: boolean }[] = [
  { campo: "nombre", label: "Nombre del establecimiento *", max: LARGO_NOMBRE, ejemplo: "Licores Alquimia" },
  { campo: "razonSocial", label: "Razón social", max: LARGO_NOMBRE, ejemplo: "Ej: Alquimia Bebidas S.R.L." },
  { campo: "cuit", label: "CUIT", max: 13, ejemplo: "Ej: 30-71234567-1" },
  { campo: "domicilio", label: "Domicilio", max: LARGO_DOMICILIO, ejemplo: "Ej: Calle 12 N° 345, La Plata, Buenos Aires" },
  { campo: "registroPupaa", label: "N° de registro PUPAA", max: LARGO_CORTO, ejemplo: "Ej: 02-123456" },
  { campo: "reba", label: "N° de REBA", max: LARGO_CORTO, ejemplo: "Ej: 12345" },
];

const errores = (v: Empresa) => {
  const r = validarEmpresa(v);
  return r.ok ? {} : r.errores;
};

/** Datos que se imprimen en el encabezado de todos los PDF. */
export default function EmpresaBloque({ inicial }: { inicial: Empresa }) {
  const router = useRouter();
  const [valores, setValores] = useState(inicial);
  const [guardado, setGuardado] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(false);
  const f = useErroresFormulario<Empresa>("cg-empresa", errores);
  const cambios = CAMPOS.some(({ campo }) => valores[campo] !== guardado[campo]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setListo(false);
    if (!f.alGuardar(valores)) return;
    setOcupado(true);
    try {
      const r = await guardarEmpresa(valores);
      if (r.ok) {
        fijarEmpresa(r.empresa);
        setValores(r.empresa);
        setGuardado(r.empresa);
        setListo(true);
        router.refresh();
      } else if (r.sinSesion) {
        router.push("/login?motivo=expirada");
      } else if (r.errores) {
        f.alGuardar(valores);
      } else {
        f.deServidor(new Error(r.error), "No se pudieron guardar los datos.");
      }
    } finally {
      setOcupado(false);
    }
  }

  const vistaPrevia = lineaDatosEmpresa(valores);

  return (
    <section className="cg-bloque" id="cg-empresa">
      <header className="cg-bloque-head">
        <h2>Datos del establecimiento</h2>
        <p>Se imprimen en el encabezado de todos los PDF (reportes, remitos, trazabilidad). Los campos vacíos no se imprimen.</p>
      </header>
      <form onSubmit={guardar} noValidate>
        <div className="cg-form">
          {CAMPOS.map(({ campo, label, max, ejemplo }) => (
            <div key={campo} className="rf-field">
              <label htmlFor={f.idDe(campo)}>{label}</label>
              <input
                {...f.props(campo)}
                type="text"
                value={valores[campo]}
                maxLength={max}
                placeholder={ejemplo}
                onChange={(e) => {
                  const v = { ...valores, [campo]: e.target.value };
                  setValores(v);
                  setListo(false);
                  f.alEscribir(v);
                }}
                onBlur={() => f.alSalir(campo, valores)}
              />
              <ErrorCampo f={f} campo={campo} />
            </div>
          ))}
        </div>
        <div className="cg-vista-previa">
          <span className="cg-etiqueta">Así se ve en los PDF:</span>
          <strong>{valores.nombre.trim() || "—"}</strong>
          {vistaPrevia && <span>{vistaPrevia}</span>}
        </div>
        {f.general && <div className="rf-error">{f.general}</div>}
        <div className="cg-acciones">
          {listo && <span className="cg-ok">✓ Guardado</span>}
          <button type="button" className="rf-cancel-btn" disabled={!cambios || ocupado} onClick={() => setValores(guardado)}>
            Descartar cambios
          </button>
          <button type="submit" className="rf-submit-btn" disabled={!cambios || ocupado}>
            {ocupado ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </section>
  );
}
