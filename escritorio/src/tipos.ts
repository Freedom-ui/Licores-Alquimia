// Contrato con la página (window.alquimia). Copia de lib/puente.ts: este
// proyecto se compila aparte (no ve la carpeta lib/). Si cambia uno, cambiar
// el otro.

export type EstadoActualizacion =
  | { estado: "inactivo" }
  | { estado: "buscando" }
  | { estado: "al-dia"; revisado: string }
  | { estado: "descargando"; version: string; progreso: number }
  | { estado: "lista"; version: string }
  | { estado: "manual"; version: string; url: string }
  | { estado: "error"; mensaje: string };

/** Mensajes entre este proceso y el servidor de la app (lib/escritorio.ts). */
export type MensajeDelServidor =
  | { tipo: "listo" }
  | { tipo: "reiniciar" }
  | { tipo: "error-arranque"; mensaje: string }
  | { tipo: "copia-al-cerrar-lista" };

export const CANALES = {
  info: "alquimia:info",
  estado: "alquimia:actualizacion-estado",
  buscar: "alquimia:actualizacion-buscar",
  instalar: "alquimia:actualizacion-instalar",
  cambio: "alquimia:actualizacion-cambio",
  carpeta: "alquimia:abrir-carpeta",
  externo: "alquimia:abrir-externo",
} as const;
