import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import { StoreProvider } from "./store";
import { leerSesion } from "./sesion";
import { prisma } from "@/lib/prisma";
import { cargarEstado } from "./_datos/repositorio";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await leerSesion();

  if (!session) {
    redirect("/login");
  }

  // Todos los datos de la app, leídos de la base al entrar (después cada
  // cambio vuelve con el estado actualizado: ver store.tsx).
  const inicial = await cargarEstado(prisma);

  return (
    <StoreProvider inicial={inicial}>
      <div className="app-shell">
        <Sidebar usuario={session} />
        <div className="main">{children}</div>
      </div>
    </StoreProvider>
  );
}
