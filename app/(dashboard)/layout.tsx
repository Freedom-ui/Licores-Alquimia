import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import { StoreProvider } from "./store";
import ControlInactividad from "./ControlInactividad";
import { prisma } from "@/lib/prisma";
import { minutosInactividad, obtenerSesion } from "@/lib/auth/sesion";
import { cargarEstado } from "./_datos/repositorio";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sesión validada contra la base (no alcanza con que exista la cookie).
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login?motivo=expirada");
  // Todavía no confirmó que guardó su código de recuperación.
  if (sesion.codigoPendiente) redirect("/codigo-recuperacion");

  // Todos los datos de la app, leídos de la base al entrar (después cada
  // cambio vuelve con el estado actualizado: ver store.tsx).
  const inicial = await cargarEstado(prisma);

  return (
    <StoreProvider inicial={inicial}>
      <ControlInactividad minutos={minutosInactividad()} />
      <div className="app-shell">
        <Sidebar usuario={sesion.username} />
        <div className="main">{children}</div>
      </div>
    </StoreProvider>
  );
}
