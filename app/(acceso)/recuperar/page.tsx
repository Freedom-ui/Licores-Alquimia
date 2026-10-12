import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import RecuperarForm from "./RecuperarForm";

export const metadata: Metadata = { title: "Recuperar acceso" };

export default async function RecuperarPage() {
  await connection(); // depende de la base en cada pedido, no del momento del build
  if ((await prisma.usuario.count()) === 0) redirect("/configuracion-inicial");
  return <RecuperarForm />;
}
