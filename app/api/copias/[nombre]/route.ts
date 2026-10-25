// Descarga de una copia de seguridad local (para guardarla en un pendrive u
// otra carpeta). Solo con sesión iniciada.

import { readFileSync } from "node:fs";
import { obtenerSesion } from "@/lib/auth/sesion";
import { buscarCopia } from "@/lib/copias/local";

export async function GET(_request: Request, { params }: { params: Promise<{ nombre: string }> }) {
  if (!(await obtenerSesion({ tocar: false }))) return new Response("Tu sesión terminó: volvé a iniciar sesión.", { status: 401 });
  const { nombre } = await params;
  const copia = buscarCopia(nombre);
  if (!copia) return new Response("Esa copia ya no está.", { status: 404 });
  return new Response(new Uint8Array(readFileSync(copia.ruta)), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${copia.nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
