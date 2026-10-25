// Datos del establecimiento que se imprimen en el encabezado de los PDF.
// Para el registro PUPAA (Res. MDA 150/2020) los registros de trazabilidad se
// presentan ante auditorías: conviene que identifiquen al elaborador. Los
// campos vacíos simplemente no se imprimen.
//
// Se guardan en la base (tabla Empresa) y se editan en Configuración. El layout
// del dashboard los fija al cargar (`fijarEmpresa`) y los generadores de PDF,
// que corren en el navegador, los leen con `empresaActual()`.

import {
  LARGO_CORTO,
  LARGO_DOMICILIO,
  LARGO_NOMBRE,
  normalizarCuit,
  normalizarTexto,
  validarCuit,
  validarTexto,
  type Errores,
  type Resultado,
} from "@/app/components/data-table/validacion";

export type Empresa = {
  nombre: string;
  razonSocial: string;
  cuit: string;
  domicilio: string;
  registroPupaa: string;
  reba: string;
};

export const EMPRESA_INICIAL: Empresa = {
  nombre: "Licores Alquimia",
  razonSocial: "",
  cuit: "",
  domicilio: "",
  registroPupaa: "",
  reba: "",
};

let actual: Empresa = EMPRESA_INICIAL;

export function fijarEmpresa(e: Empresa): void {
  actual = e;
}

export function empresaActual(): Empresa {
  return actual;
}

export function lineaDatosEmpresa(e: Empresa = actual): string {
  return [
    e.razonSocial,
    e.cuit && `CUIT ${e.cuit}`,
    e.domicilio,
    e.registroPupaa && `Registro PUPAA N° ${e.registroPupaa}`,
    e.reba && `REBA N° ${e.reba}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Valida los datos del formulario de Configuración (la pantalla y el servidor). */
export function validarEmpresa(v: unknown): Resultado<Empresa> {
  const o = typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const t = (k: keyof Empresa) => normalizarTexto(o[k]);
  const errores: Errores = {};
  const poner = (campo: keyof Empresa, error: string | null) => {
    if (error && !(campo in errores)) errores[campo] = error;
  };
  const e: Empresa = {
    nombre: t("nombre"),
    razonSocial: t("razonSocial"),
    cuit: normalizarCuit(o.cuit),
    domicilio: t("domicilio"),
    registroPupaa: t("registroPupaa"),
    reba: t("reba"),
  };
  poner("nombre", validarTexto(e.nombre, { que: "el nombre del establecimiento", requerido: true, max: LARGO_NOMBRE }));
  poner("razonSocial", validarTexto(e.razonSocial, { que: "la razón social", max: LARGO_NOMBRE }));
  poner("cuit", validarCuit(o.cuit));
  poner("domicilio", validarTexto(e.domicilio, { que: "el domicilio", max: LARGO_DOMICILIO }));
  poner("registroPupaa", validarTexto(e.registroPupaa, { que: "el N° de registro PUPAA", max: LARGO_CORTO }));
  poner("reba", validarTexto(e.reba, { que: "el N° de REBA", max: LARGO_CORTO }));
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, valor: e };
}
