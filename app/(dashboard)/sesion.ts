import { cookies } from "next/headers";

export type Sesion = { id: number; username: string; rol: string };

/** Usuario logueado según la cookie `session` (null si no hay o no se puede leer). */
export async function leerSesion(): Promise<Sesion | null> {
  const cookie = (await cookies()).get("session");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as Sesion;
  } catch {
    return null;
  }
}
