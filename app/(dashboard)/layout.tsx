import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import { StoreProvider } from "./store";
import { leerSesion } from "./sesion";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await leerSesion();

  if (!session) {
    redirect("/login");
  }

  return (
    <StoreProvider>
      <div className="app-shell">
        <Sidebar usuario={session} />
        <div className="main">{children}</div>
      </div>
    </StoreProvider>
  );
}
