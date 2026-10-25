// Lo que la app de escritorio (electron/preload.ts) le expone a la página en
// `window.alquimia`. En el navegador común (desarrollo, pruebas) no existe.
// Solo tipos: lo comparten la página y el proceso de Electron.

export type EstadoActualizacion =
  | { estado: "inactivo" }
  | { estado: "buscando" }
  | { estado: "al-dia"; revisado: string }
  | { estado: "descargando"; version: string; progreso: number }
  | { estado: "lista"; version: string }
  /** Mac sin firma de Apple: no se puede instalar sola, se baja de la página. */
  | { estado: "manual"; version: string; url: string }
  | { estado: "error"; mensaje: string };

export type PuenteEscritorio = {
  version: string;
  plataforma: string;
  estadoActualizacion(): Promise<EstadoActualizacion>;
  buscarActualizacion(): Promise<EstadoActualizacion>;
  /** Cierra la app, instala la versión descargada y la vuelve a abrir. */
  instalarActualizacion(): void;
  abrirCarpetaDatos(): void;
  /** Abre una dirección en el navegador del sistema (ej. el permiso de Google). */
  abrirEnNavegador(url: string): void;
  /** Avisa cuando cambia el estado de la actualización. Devuelve cómo dejar de escuchar. */
  alCambiarActualizacion(fn: (e: EstadoActualizacion) => void): () => void;
};

declare global {
  interface Window {
    alquimia?: PuenteEscritorio;
  }
}
