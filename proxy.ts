import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/auth/reglas";

// Chequeo optimista (sin base, como recomienda Next para Proxy): sin cookie de
// sesión, todo lo que no sea público va al login. La validación de verdad
// (token en la base, vencimiento) la hacen el layout del dashboard, la página
// de login y cada server action (lib/auth/sesion.ts).
//
// No redirige del login al panel por tener cookie: una cookie vencida haría
// un bucle; eso lo decide la página de login validando la sesión.

const RUTAS_PUBLICAS = ["/login", "/recuperar", "/configuracion-inicial"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publica = RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));

  if (!publica && !request.cookies.has(COOKIE_SESION)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     * - _next/static, _next/image (assets de Next)
     * - favicon.ico y archivos con extensión de /public
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
