import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import { StoreProvider } from "./store";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (!sessionCookie) {
    redirect("/login");
  }

  const session = JSON.parse(sessionCookie!.value) as {
    id: number;
    username: string;
    rol: string;
  };

  return (
    <StoreProvider>
      <div className="app-shell">
        <Sidebar usuario={session} />
        <div className="main">{children}</div>
      </div>
    </StoreProvider>
  );
}