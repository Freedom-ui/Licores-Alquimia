// Comunicación con el proceso principal de la app de escritorio (Electron), que
// levanta este servidor como proceso hijo con un canal de mensajes. En
// desarrollo (`npm run dev`) no hay canal y todo esto no hace nada. Solo servidor.

export type MensajeAlPrincipal =
  | { tipo: "listo" }
  | { tipo: "reiniciar" }
  | { tipo: "error-arranque"; mensaje: string }
  | { tipo: "copia-al-cerrar-lista" };

export type MensajeDelPrincipal = { tipo: "copia-al-cerrar" };

export const enEscritorio = () => process.env.ALQUIMIA_ESCRITORIO === "1" && typeof process.send === "function";

export function avisarAlPrincipal(m: MensajeAlPrincipal): boolean {
  if (!enEscritorio()) return false;
  process.send!(m);
  return true;
}

export function escucharAlPrincipal(manejar: (m: MensajeDelPrincipal) => void): void {
  if (!enEscritorio()) return;
  process.on("message", (m) => {
    if (m && typeof m === "object" && "tipo" in m) manejar(m as MensajeDelPrincipal);
  });
}

/** Pide reiniciar el servidor (para aplicar una restauración). false si no hay quién lo haga (desarrollo). */
export function pedirReinicio(): boolean {
  if (!enEscritorio()) return false;
  // Un momento, para que la respuesta de la acción llegue a la pantalla.
  setTimeout(() => avisarAlPrincipal({ tipo: "reiniciar" }), 300);
  return true;
}
