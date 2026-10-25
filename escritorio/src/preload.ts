// Lo único que la página puede pedirle a la app de escritorio (window.alquimia).
// Corre aislado (contextIsolation + sandbox): la página no tiene acceso a Node.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { CANALES as Canales, EstadoActualizacion } from "./tipos";

// Con sandbox el preload no puede cargar otros archivos: los nombres de los
// canales se repiten acá (el tipo asegura que coincidan con tipos.ts).
const CANALES: typeof Canales = {
  info: "alquimia:info",
  estado: "alquimia:actualizacion-estado",
  buscar: "alquimia:actualizacion-buscar",
  instalar: "alquimia:actualizacion-instalar",
  cambio: "alquimia:actualizacion-cambio",
  carpeta: "alquimia:abrir-carpeta",
  externo: "alquimia:abrir-externo",
};

const info = ipcRenderer.sendSync(CANALES.info) as { version: string; plataforma: string };

contextBridge.exposeInMainWorld("alquimia", {
  version: info.version,
  plataforma: info.plataforma,
  estadoActualizacion: (): Promise<EstadoActualizacion> => ipcRenderer.invoke(CANALES.estado),
  buscarActualizacion: (): Promise<EstadoActualizacion> => ipcRenderer.invoke(CANALES.buscar),
  instalarActualizacion: () => ipcRenderer.send(CANALES.instalar),
  abrirCarpetaDatos: () => ipcRenderer.send(CANALES.carpeta),
  abrirEnNavegador: (url: string) => ipcRenderer.send(CANALES.externo, url),
  alCambiarActualizacion: (fn: (e: EstadoActualizacion) => void) => {
    const manejar = (_: IpcRendererEvent, e: EstadoActualizacion) => fn(e);
    ipcRenderer.on(CANALES.cambio, manejar);
    return () => {
      ipcRenderer.removeListener(CANALES.cambio, manejar);
    };
  },
});
