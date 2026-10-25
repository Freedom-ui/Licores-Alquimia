import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerSesion } from "@/lib/auth/sesion";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

const AVISOS: Record<string, string> = {
  inactividad: "Por seguridad se cerró la sesión después de un rato sin uso. Volvé a ingresar.",
  expirada: "Tu sesión terminó. Volvé a ingresar.",
  salida: "Cerraste la sesión.",
  restaurada: "Se restauró la copia de seguridad. Entrá con el usuario y la contraseña que tenías cuando se hizo esa copia.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  // Primer arranque: todavía no hay cuenta.
  if ((await prisma.usuario.count()) === 0) redirect("/configuracion-inicial");
  // Con una sesión válida no tiene sentido el login (con una cookie vieja sí).
  if (await obtenerSesion({ tocar: false })) redirect("/");

  const { motivo } = await searchParams;
  return <LoginForm aviso={motivo ? AVISOS[motivo] : undefined} />;
}
