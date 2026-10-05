// Datos del establecimiento que se imprimen en el encabezado de los PDF.
// Para el registro PUPAA (Res. MDA 150/2020) los registros de trazabilidad se
// presentan ante auditorías: conviene que identifiquen al elaborador. Los
// campos vacíos simplemente no se imprimen.
export const EMPRESA = {
  nombre: "Licores Alquimia",
  razonSocial: "",
  cuit: "",
  domicilio: "",
  registroPupaa: "",
  reba: "",
};

export function lineaDatosEmpresa(): string {
  return [
    EMPRESA.razonSocial,
    EMPRESA.cuit && `CUIT ${EMPRESA.cuit}`,
    EMPRESA.domicilio,
    EMPRESA.registroPupaa && `Registro PUPAA N° ${EMPRESA.registroPupaa}`,
    EMPRESA.reba && `REBA N° ${EMPRESA.reba}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
