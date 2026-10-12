import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import ConfiguracionInicialForm from "./ConfiguracionInicialForm";

export const metadata: Metadata = { title: "Configuración inicial" };

export default async function ConfiguracionInicialPage() {
  await connection(); // depende de la base en cada pedido, no del momento del build
  // Solo existe mientras no hay ninguna cuenta.
  if ((await prisma.usuario.count()) > 0) redirect("/login");
  return <ConfiguracionInicialForm />;
}
