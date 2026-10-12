import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth/sesion";
import CodigoView from "./CodigoView";

export const metadata: Metadata = { title: "Código de recuperación" };

// Se muestra mientras la cuenta tenga un código sin confirmar: al crearla, al
// primer ingreso de una cuenta vieja o después de recuperar el acceso.
// Recargar no lo pierde.
export default async function CodigoRecuperacionPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login?motivo=expirada");
  if (!sesion.codigoPendiente) redirect("/");

  const { motivo } = await searchParams;
  return <CodigoView codigo={sesion.codigoPendiente} motivo={motivo} />;
}
