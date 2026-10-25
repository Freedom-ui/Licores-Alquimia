// Sesiones, códigos de recuperación e intentos fallidos. Solo servidor (usa la
// base y las cookies). Las reglas puras están en ./reglas.ts.
//
// La cookie lleva un token al azar de 32 bytes; en la base se guarda su
// SHA-256, así que inventar o modificar la cookie no sirve para entrar y una
// copia de la base tampoco. La sesión vence por inactividad (ultimoUso) o por
// duración máxima (creadaEn), y cerrar sesión la borra de la base.

import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  BLOQUEO_MIN,
  COOKIE_SESION,
  DURACION_MAX_HORAS,
  INACTIVIDAD_MIN,
  LARGO_CODIGO,
  MAX_INTENTOS,
} from "./reglas";

const MINUTO = 60_000;
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Minutos de inactividad permitidos. `SESION_INACTIVIDAD_MIN` en .env lo cambia (solo para pruebas). */
export function minutosInactividad(): number {
  const env = Number(process.env.SESION_INACTIVIDAD_MIN);
  return Number.isFinite(env) && env > 0 ? env : INACTIVIDAD_MIN;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function vencida(s: { creadaEn: Date; ultimoUso: Date }, ahora = Date.now()): boolean {
  return (
    ahora - s.ultimoUso.getTime() > minutosInactividad() * MINUTO ||
    ahora - s.creadaEn.getTime() > DURACION_MAX_HORAS * 60 * MINUTO
  );
}

// ── Contraseñas y códigos ────────────────────────────────────

export const hashear = (texto: string) => bcrypt.hash(texto, 10);
export const coincide = (texto: string, hash: string) => bcrypt.compare(texto, hash);

// Hash de relleno: si el usuario no existe se compara igual, para que la
// respuesta tarde lo mismo y no delate qué usuarios existen.
const HASH_RELLENO = bcrypt.hashSync("relleno-que-nunca-coincide", 10);
export const compararRelleno = (texto: string) => bcrypt.compare(texto, HASH_RELLENO);

/**
 * Código de recuperación al azar: LARGO_CODIGO caracteres que mezclan siempre
 * minúsculas, mayúsculas y números (se sortea de nuevo si falta alguno).
 */
export function generarCodigo(): string {
  for (;;) {
    let codigo = "";
    for (let i = 0; i < LARGO_CODIGO; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
    if (/[a-z]/.test(codigo) && /[A-Z]/.test(codigo) && /[0-9]/.test(codigo)) return codigo;
  }
}

/** Datos para guardar un código nuevo: el anterior deja de servir. */
export async function nuevoCodigo() {
  const codigo = generarCodigo();
  return { codigoRecuperacionHash: await hashear(codigo), codigoPendiente: codigo };
}

// ── Sesiones ─────────────────────────────────────────────────

export type SesionActiva = {
  id: number;
  username: string;
  /** Código de recuperación que todavía no confirmó haber guardado. */
  codigoPendiente: string | null;
  sesionId: string;
};

/**
 * Inicia sesión: guarda la sesión y pone la cookie. Solo desde una server
 * action (las cookies no se pueden escribir al renderizar).
 */
export async function crearSesion(usuarioId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const ahora = Date.now();
  // De paso, limpia sesiones viejas que nadie cerró.
  await prisma.sesion.deleteMany({
    where: {
      OR: [
        { ultimoUso: { lt: new Date(ahora - minutosInactividad() * MINUTO) } },
        { creadaEn: { lt: new Date(ahora - DURACION_MAX_HORAS * 60 * MINUTO) } },
      ],
    },
  });
  await prisma.sesion.create({ data: { id: hashToken(token), usuarioId } });

  // Con maxAge (la duración máxima): sobrevive a cerrar la app, así al volver a
  // abrirla dentro de los minutos de inactividad no hay que entrar de nuevo. Lo
  // que decide si sigue valiendo es la base (ultimoUso / creadaEn), no la
  // cookie. `secure` solo si se entra por https; la app corre en
  // http://localhost y ahí una cookie `secure` no la guardan todos los
  // navegadores (Safari).
  const https = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: https,
    maxAge: DURACION_MAX_HORAS * 3600,
  });
}

/**
 * Sesión válida según la cookie, o null si no hay, no existe en la base o
 * venció (en ese caso se borra). Con `tocar` (por defecto) cuenta como uso.
 * Se puede llamar al renderizar: no escribe cookies.
 */
export async function obtenerSesion({ tocar = true } = {}): Promise<SesionActiva | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const sesion = await prisma.sesion.findUnique({
    where: { id },
    include: { usuario: { select: { id: true, username: true, codigoPendiente: true } } },
  });
  if (!sesion) return null;

  const ahora = Date.now();
  if (vencida(sesion, ahora)) {
    await prisma.sesion.deleteMany({ where: { id } });
    return null;
  }
  // Como mucho una escritura por minuto (o por décimo del límite, si es más corto).
  if (tocar && ahora - sesion.ultimoUso.getTime() > Math.min(MINUTO, (minutosInactividad() * MINUTO) / 10)) {
    await prisma.sesion.update({ where: { id }, data: { ultimoUso: new Date(ahora) } });
  }
  return { ...sesion.usuario, sesionId: id };
}

/** Cierra la sesión de este navegador (base + cookie). Solo desde una server action. */
export async function cerrarSesionActual(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (token) await prisma.sesion.deleteMany({ where: { id: hashToken(token) } });
  almacen.delete(COOKIE_SESION);
}

/** Cierra las sesiones de la cuenta en otros navegadores (todas si no se pasa `salvo`). */
export async function cerrarOtrasSesiones(usuarioId: number, salvo?: string): Promise<void> {
  await prisma.sesion.deleteMany({ where: { usuarioId, ...(salvo ? { id: { not: salvo } } : {}) } });
}

// ── Bloqueo por intentos fallidos ────────────────────────────

/** Minutos que faltan para poder volver a intentar, o null si no hay bloqueo. */
export async function minutosDeBloqueo(): Promise<number | null> {
  const ahora = Date.now();
  const recientes = await prisma.intentoFallido.findMany({
    where: { fecha: { gt: new Date(ahora - BLOQUEO_MIN * MINUTO) } },
    orderBy: { fecha: "desc" },
    take: MAX_INTENTOS,
  });
  if (recientes.length < MAX_INTENTOS) return null;
  // Se desbloquea cuando el más viejo de esos fallos sale de la ventana.
  const libre = recientes[MAX_INTENTOS - 1].fecha.getTime() + BLOQUEO_MIN * MINUTO;
  return Math.max(1, Math.ceil((libre - ahora) / MINUTO));
}

export function mensajeBloqueo(minutos: number): string {
  return `Demasiados intentos fallidos. Por seguridad, esperá ${minutos} minuto${minutos === 1 ? "" : "s"} y probá de nuevo.`;
}

/** Intentos que quedan antes del bloqueo. */
export async function intentosRestantes(): Promise<number> {
  const fallos = await prisma.intentoFallido.count({
    where: { fecha: { gt: new Date(Date.now() - BLOQUEO_MIN * MINUTO) } },
  });
  return Math.max(0, MAX_INTENTOS - fallos);
}

export async function registrarFallo(tipo: "login" | "recuperacion"): Promise<void> {
  await prisma.intentoFallido.create({ data: { tipo } });
  await prisma.intentoFallido.deleteMany({ where: { fecha: { lt: new Date(Date.now() - 24 * 60 * MINUTO) } } });
}

export async function limpiarFallos(): Promise<void> {
  await prisma.intentoFallido.deleteMany();
}
