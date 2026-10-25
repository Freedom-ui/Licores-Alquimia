// Vuelta de Google después de que el usuario da el permiso de Drive. Se abre en
// el navegador del sistema (sin la sesión de la app): lo que la protege es el
// `state` de un solo uso que generó la app al pedir la conexión (ver
// lib/copias/drive.ts). Ruta pública en proxy.ts.

import { completarConexion, ErrorDrive } from "@/lib/copias/drive";
import { enFila, subirPendientes } from "@/lib/copias/programador";

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function pagina(titulo: string, texto: string, ok: boolean) {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} · Licores Alquimia</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f1ec; color: #2b2522; font: 16px/1.5 Arial, Helvetica, sans-serif; }
  main { max-width: 460px; margin: 16px; padding: 32px; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); text-align: center; }
  .marca { font-weight: bold; color: #7a4b2a; margin-bottom: 12px; }
  .icono { font-size: 40px; color: ${ok ? "#2e7d32" : "#b3261e"}; }
  h1 { font-size: 20px; margin: 8px 0; }
  p { margin: 8px 0 0; color: #5b524c; }
</style></head>
<body><main><div class="marca">Licores Alquimia</div><div class="icono">${ok ? "✓" : "✕"}</div><h1>${escapar(titulo)}</h1><p>${escapar(texto)}</p></main></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const estado = url.searchParams.get("state") ?? "";
  const codigo = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error || !codigo) {
    return pagina(
      "No se conectó Google Drive",
      error === "access_denied" ? "Cancelaste el permiso. Podés volver a la app e intentarlo de nuevo cuando quieras." : "Google no confirmó la conexión. Volvé a la app y probá de nuevo.",
      false
    );
  }
  try {
    const c = await completarConexion(estado, codigo);
    // Primera subida en segundo plano (la pantalla de Configuración la va mostrando).
    void enFila(subirPendientes);
    return pagina("¡Listo! Google Drive quedó conectado", `Las copias de seguridad se van a guardar en ${c.email || "tu Google Drive"}. Ya podés cerrar esta pestaña y volver a Licores Alquimia.`, true);
  } catch (e) {
    return pagina("No se conectó Google Drive", e instanceof ErrorDrive ? e.message : "Algo salió mal. Volvé a la app y probá de nuevo.", false);
  }
}
