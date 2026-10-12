"use server";

// Único punto de entrada para cambiar datos desde el navegador. Cada cambio
// corre en una transacción: lee el estado de la base, aplica la acción con la
// lógica del dominio (validaciones + sincronizaciones entre secciones),
// guarda las diferencias y devuelve el estado actualizado.

import { prisma } from "@/lib/prisma";
import { obtenerSesion } from "@/lib/auth/sesion";
import { aplicar, ErrorNegocio, type Accion, type Estado } from "../_dominio/acciones";
import { cargarEstado, guardarCambios } from "./repositorio";

export type Resultado =
  | { ok: true; estado: Estado }
  // sinSesion: la sesión venció o no existe; la pantalla vuelve al login.
  | { ok: false; error: string; sinSesion?: true };

export async function ejecutar(accion: Accion): Promise<Resultado> {
  // Las server actions son públicas: se valida la sesión en cada cambio (y cuenta como uso).
  if (!(await obtenerSesion())) return { ok: false, error: "Tu sesión terminó: volvé a iniciar sesión.", sinSesion: true };
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
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    console.error(`No se pudo guardar (${accion.tipo}):`, e);
    return { ok: false, error: "No se pudo guardar el cambio en la base de datos. Probá de nuevo." };
  }
}
