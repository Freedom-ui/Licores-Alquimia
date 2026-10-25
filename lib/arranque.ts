// Lo que hace el servidor al arrancar, antes de atender pedidos
// (instrumentation.ts). Solo servidor.
//
// 1. Si se pidió restaurar una copia, la pone en lugar de la base.
// 2. Aplica las migraciones pendientes (en la PC del cliente no hay Prisma CLI);
//    si la base ya tenía datos, antes hace una copia de seguridad.
// 3. Empieza las copias automáticas (en la app de escritorio, o en desarrollo
//    con ALQUIMIA_COPIAS=1) y escucha al proceso de Electron.

import { aplicarRestauracionPendiente, hacerCopia } from "@/lib/copias/local";
import { copiaAlCerrar, iniciarProgramador } from "@/lib/copias/programador";
import { archivoBase, carpetaMigraciones } from "@/lib/datos/rutas";
import { migrar } from "@/lib/datos/migrar";
import { avisarAlPrincipal, enEscritorio, escucharAlPrincipal } from "@/lib/escritorio";

export function arrancar(): void {
  try {
    if (aplicarRestauracionPendiente()) console.log("[arranque] Se restauró la copia elegida.");
    const r = migrar(archivoBase(), carpetaMigraciones(), {
      antesDeAplicar: () => hacerCopia("antes-de-actualizar"),
    });
    if (r.aplicadas.length) console.log(`[arranque] Base actualizada: ${r.aplicadas.join(", ")}`);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[arranque]", mensaje);
    avisarAlPrincipal({ tipo: "error-arranque", mensaje });
    throw e;
  }

  if (enEscritorio() || process.env.ALQUIMIA_COPIAS === "1") iniciarProgramador();
  escucharAlPrincipal((m) => {
    if (m.tipo === "copia-al-cerrar") {
      void copiaAlCerrar().finally(() => avisarAlPrincipal({ tipo: "copia-al-cerrar-lista" }));
    }
  });
}
