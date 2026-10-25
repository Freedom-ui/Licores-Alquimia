// Resumen de las copias de seguridad para la pantalla de Configuración y las
// alertas del Panel. `alertasCopias` es pura (con tests); `estadoCopias` lee
// los archivos (solo servidor).

import type { Alerta } from "@/app/(dashboard)/estadisticas/secciones";
import { carpetaCopias } from "@/lib/datos/rutas";
import { enEscritorio } from "@/lib/escritorio";
import { credencialesConfiguradas, leerConexion } from "./drive";
import { listarCopias } from "./local";
import type { Motivo } from "./nombres";

export type CopiaVista = { nombre: string; fecha: string; motivo: Motivo; tamano: number };

export type EstadoCopias = {
  /** Las copias automáticas están andando (app de escritorio, o ALQUIMIA_COPIAS=1 en desarrollo). */
  automaticas: boolean;
  escritorio: boolean;
  carpeta: string;
  locales: CopiaVista[];
  drive: {
    /** Esta versión de la app tiene las credenciales de Google. */
    disponible: boolean;
    conectado: boolean;
    email: string;
    /** Cuándo se conectó la cuenta (cambia al volver a conectar). */
    conectadoEn: string | null;
    /** Google quitó el permiso: hay que volver a conectar. */
    desconectada: boolean;
    ultimaSubida: { nombre: string; fecha: string } | null;
    error: { mensaje: string; desde: string } | null;
  };
};

export const DIAS_ALERTA = 3;

export function estadoCopias(): EstadoCopias {
  const c = leerConexion();
  return {
    automaticas: enEscritorio() || process.env.ALQUIMIA_COPIAS === "1",
    escritorio: enEscritorio(),
    carpeta: carpetaCopias(),
    locales: listarCopias().map((x) => ({ nombre: x.nombre, fecha: x.fecha.toISOString(), motivo: x.motivo, tamano: x.tamano })),
    drive: {
      disponible: credencialesConfiguradas(),
      conectado: Boolean(c),
      email: c?.email ?? "",
      conectadoEn: c?.conectadoEn ?? null,
      desconectada: Boolean(c?.desconectada),
      ultimaSubida: c?.ultimaSubida ?? null,
      error: c?.error ?? null,
    },
  };
}

const DIA = 86_400_000;
const dias = (desde: string, ahora: Date) => Math.floor((ahora.getTime() - new Date(desde).getTime()) / DIA);
const haceDias = (n: number) => (n === 1 ? "hace 1 día" : `hace ${n} días`);

/** Alertas del Panel sobre las copias. Solo si las copias automáticas están andando. */
export function alertasCopias(e: EstadoCopias, ahora = new Date()): Alerta[] {
  if (!e.automaticas) return [];
  const destino = { href: "/configuracion" };
  const out: Alerta[] = [];
  const ultima = e.locales[0];
  if (!ultima) {
    out.push({ nivel: "aviso", texto: "Todavía no hay copias de seguridad", detalle: "Se hace una sola en unos minutos; también podés hacerla ahora", destino });
  } else if (dias(ultima.fecha, ahora) > DIAS_ALERTA) {
    out.push({ nivel: "aviso", texto: `La última copia de seguridad es de ${haceDias(dias(ultima.fecha, ahora))}`, detalle: "Revisá las copias en Configuración", destino });
  }
  const d = e.drive;
  if (!d.disponible) return out;
  // Sin conectar no es alerta: el Panel muestra un cartel para conectarlo.
  if (!d.conectado) return out;
  if (d.desconectada) {
    out.push({ nivel: "critico", texto: "Google Drive se desconectó", detalle: "Las copias no se están subiendo: volvé a conectarlo en Configuración", destino });
  } else if (d.error && dias(d.error.desde, ahora) >= DIAS_ALERTA) {
    out.push({ nivel: "aviso", texto: `Las copias no se suben a Google Drive desde ${haceDias(dias(d.error.desde, ahora))}`, detalle: d.error.mensaje, destino });
  } else if (d.ultimaSubida && dias(d.ultimaSubida.fecha, ahora) > DIAS_ALERTA) {
    out.push({ nivel: "aviso", texto: `La última copia en Google Drive es de ${haceDias(dias(d.ultimaSubida.fecha, ahora))}`, detalle: "Revisá las copias en Configuración", destino });
  }
  return out;
}
