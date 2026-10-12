"use server";

// Único punto de entrada para cambiar datos desde el navegador. Cada cambio
// corre en una transacción: lee el estado de la base, aplica la acción con la
// lógica del dominio (validaciones + sincronizaciones entre secciones),
// guarda las diferencias y devuelve el estado actualizado.

import { prisma } from "@/lib/prisma";
import { leerSesion } from "../sesion";
import { aplicar, ErrorNegocio, type Accion, type Estado } from "../_dominio/acciones";
import { cargarEstado, guardarCambios } from "./repositorio";

export type Resultado = { ok: true; estado: Estado } | { ok: false; error: string };

export async function ejecutar(accion: Accion): Promise<Resultado> {
  if (!(await leerSesion())) return { ok: false, error: "Tu sesión terminó: volvé a iniciar sesión." };
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
