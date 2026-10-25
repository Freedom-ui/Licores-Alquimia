"use client";

import { fijarEmpresa, type Empresa } from "@/app/empresa";

/**
 * Deja los datos del establecimiento a mano para los PDF (que se arman en el
 * navegador y los leen con empresaActual()). Se fija al dibujar, antes de que
 * se pueda tocar cualquier botón de PDF; al guardar en Configuración el layout
 * se vuelve a dibujar con los datos nuevos.
 */
export default function EmpresaActual({ datos }: { datos: Empresa }) {
  fijarEmpresa(datos);
  return null;
}
