// Datos del establecimiento guardados en la base (tabla Empresa, fila 1). Solo servidor.

import { prisma } from "@/lib/prisma";
import { EMPRESA_INICIAL, type Empresa } from "@/app/empresa";

export async function leerEmpresa(): Promise<Empresa> {
  const fila = await prisma.empresa.findUnique({ where: { id: 1 } });
  if (!fila) return EMPRESA_INICIAL;
  const { nombre, razonSocial, cuit, domicilio, registroPupaa, reba } = fila;
  return { nombre, razonSocial, cuit, domicilio, registroPupaa, reba };
}
