"use server";

// Único punto de entrada para cambiar datos desde el navegador. Cada cambio
// corre en una transacción: lee el estado de la base, aplica la acción con la
// lógica del dominio (validaciones + sincronizaciones entre secciones),
// guarda las diferencias y devuelve el estado actualizado.

import { prisma } from "@/lib/prisma";
import { obtenerSesion } from "@/lib/auth/sesion";
import { aplicar, aplicarVarios, ErrorNegocio, type Accion, type Estado, type FalloVarios } from "../_dominio/acciones";
import { cargarEstado, guardarCambios } from "./repositorio";

export type Resultado =
  | { ok: true; estado: Estado }
  // sinSesion: la sesión venció o no existe; la pantalla vuelve al login.
  // campo: el campo del formulario donde mostrar el error (si corresponde a uno).
  | { ok: false; error: string; campo?: string; sinSesion?: true };

/** Lo mínimo para que `aplicar` pueda leer la acción; el resto lo valida cada caso (reglas.ts). */
function esAccion(a: unknown): a is Accion {
  return typeof a === "object" && a !== null && typeof (a as { tipo?: unknown }).tipo === "string";
}

// `accion` llega como unknown: cualquiera puede llamar a esta función con lo que quiera.
export async function ejecutar(accion: unknown): Promise<Resultado> {
  // Las server actions son públicas: se valida la sesión en cada cambio (y cuenta como uso).
  if (!(await obtenerSesion())) return { ok: false, error: "Tu sesión terminó: volvé a iniciar sesión.", sinSesion: true };
  if (!esAccion(accion)) return { ok: false, error: "Acción desconocida." };
  try {
    const estado = await prisma.$transaction(
      async (tx) => {
        const antes = await cargarEstado(tx);
        const despues = aplicar(antes, accion);
        await guardarCambios(tx, antes, despues);
        return cargarEstado(tx);
      },
      { timeout: 15_000 }
    );
    return { ok: true, estado };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message, ...(e.campo ? { campo: e.campo } : {}) };
    console.error(`No se pudo guardar (${accion.tipo}):`, e);
    return { ok: false, error: "No se pudo guardar el cambio en la base de datos. Probá de nuevo." };
  }
}

export type ResultadoVarios =
  | { ok: true; estado: Estado; fallos: FalloVarios[] }
  | { ok: false; error: string; sinSesion?: true };

/**
 * Borrado múltiple (selección de las tablas), en una sola transacción. Cada
 * registro es todo o nada: los que una regla no deja borrar vuelven en
 * `fallos` con su motivo y el resto se guarda.
 */
export async function ejecutarVarios(acciones: unknown): Promise<ResultadoVarios> {
  if (!(await obtenerSesion())) return { ok: false, error: "Tu sesión terminó: volvé a iniciar sesión.", sinSesion: true };
  try {
    const r = await prisma.$transaction(
      async (tx) => {
        const antes = await cargarEstado(tx);
        const { estado: despues, fallos } = aplicarVarios(antes, acciones);
        await guardarCambios(tx, antes, despues);
        return { estado: await cargarEstado(tx), fallos };
      },
      { timeout: 30_000 }
    );
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    console.error("No se pudo guardar el borrado múltiple:", e);
    return { ok: false, error: "No se pudo guardar el cambio en la base de datos. Probá de nuevo." };
  }
}
