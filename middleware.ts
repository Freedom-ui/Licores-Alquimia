import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("session");

  const { pathname } = request.nextUrl;

  // Rutas públicas que no requieren sesión
  const rutasPublicas = ["/login", "/registro", "/api/login", "/api/register"];
  const esRutaPublica = rutasPublicas.some((ruta) => pathname.startsWith(ruta));

  if (!session && !esRutaPublica) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto:
     * - _next/static, _next/image (assets de Next)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};