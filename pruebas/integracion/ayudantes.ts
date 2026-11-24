// Ayudas para preparar la base temporal de cada prueba de integración.
// Las credenciales que se crean acá son de prueba y solo existen en esa base.

import { prisma } from "@/lib/prisma";
import { crearSesion, hashear } from "@/lib/auth/sesion";
import { ESTADO_VACIO, type Estado } from "@/app/(dashboard)/_dominio/acciones";
import { estadoDemo } from "@/app/(dashboard)/_dominio/demo";
import { saldoLote } from "@/app/(dashboard)/_dominio/sync";
import { borrarDatosNegocio, cargarEstado, guardarCambios } from "@/app/(dashboard)/_datos/repositorio";

export const CLAVE_DE_PRUEBA = "prueba1234";

/** Deja la base sin ningún dato (usuarios, sesiones e intentos incluidos). */
export async function vaciarBase() {
  await prisma.$transaction(async (tx) => {
    await borrarDatosNegocio(tx);
    await tx.sesion.deleteMany();
    await tx.intentoFallido.deleteMany();
    await tx.usuario.deleteMany();
    await tx.empresa.deleteMany();
  });
}

/** Carga los datos de ejemplo de la app (los mismos del seed --demo) con el repositorio real. */
export async function cargarDemo(): Promise<Estado> {
  const demo = estadoDemo();
  await prisma.$transaction(async (tx) => {
    await borrarDatosNegocio(tx);
    await guardarCambios(tx, ESTADO_VACIO, demo);
  });
  return demo;
}

export async function crearUsuario(username = "qa.tester", clave = CLAVE_DE_PRUEBA) {
  return prisma.usuario.create({ data: { username, passwordHash: await hashear(clave) } });
}

/** Crea la cuenta (si hace falta) e inicia sesión: la cookie queda en `galletas`. */
export async function entrar(username = "qa.tester") {
  const usuario = (await prisma.usuario.findUnique({ where: { username } })) ?? (await crearUsuario(username));
  await crearSesion(usuario.id);
  return usuario;
}

/** Lo que hay guardado en la base ahora, leído con el mismo repositorio que usa la app. */
export const estadoEnBase = () => cargarEstado(prisma);

/** Botellas disponibles de un producto: la suma de los saldos de sus lotes. */
export function stockDe(estado: Estado, productoId: number): number {
  return estado.productosTerminados.filter((l) => l.productoId === productoId).reduce((s, l) => s + saldoLote(l), 0);
}

/** FormData como la que manda un formulario del navegador. */
export function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}
