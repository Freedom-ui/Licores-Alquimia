"use server";

// Acciones del acceso: primer arranque, ingreso, código de recuperación,
// recuperar usuario/contraseña y cerrar sesión. Son endpoints públicos: todo
// lo que llega se revalida acá con las reglas de lib/auth/reglas.ts.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  normalizarCodigo,
  normalizarUsuario,
  validarConfirmacion,
  validarContrasena,
  validarFormatoCodigo,
  validarUsuario,
} from "@/lib/auth/reglas";
import {
  cerrarOtrasSesiones,
  cerrarSesionActual,
  coincide,
  compararRelleno,
  crearSesion,
  hashear,
  intentosRestantes,
  limpiarFallos,
  mensajeBloqueo,
  minutosDeBloqueo,
  nuevoCodigo,
  obtenerSesion,
  registrarFallo,
} from "@/lib/auth/sesion";

export type Campo = "usuario" | "contrasena" | "repetir" | "codigo";

export type EstadoForm = {
  /** Error general (arriba del formulario). */
  error?: string;
  /** Errores por campo (debajo de cada uno). */
  campos?: Partial<Record<Campo, string>>;
};

const texto = (fd: FormData, nombre: string) => String(fd.get(nombre) ?? "");

/** Errores de usuario + contraseña nueva + confirmación (o null si está todo bien). */
function erroresCuenta(usuario: string, contrasena: string, repetir: string): EstadoForm["campos"] | null {
  const campos: EstadoForm["campos"] = {};
  const u = validarUsuario(usuario);
  const c = validarContrasena(contrasena, usuario);
  const r = c ? null : validarConfirmacion(contrasena, repetir);
  if (u) campos.usuario = u;
  if (c) campos.contrasena = c;
  if (r) campos.repetir = r;
  return Object.keys(campos).length ? campos : null;
}

async function mensajeFallo(base: string): Promise<string> {
  const bloqueo = await minutosDeBloqueo();
  if (bloqueo) return mensajeBloqueo(bloqueo);
  const quedan = await intentosRestantes();
  return quedan <= 2 ? `${base} Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`} antes de un bloqueo temporal.` : base;
}

// ── Primer arranque ──────────────────────────────────────────

export async function crearCuentaInicial(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const usuario = normalizarUsuario(texto(fd, "usuario"));
  const contrasena = texto(fd, "contrasena");
  const campos = erroresCuenta(usuario, contrasena, texto(fd, "repetir"));
  if (campos) return { campos };

  const passwordHash = await hashear(contrasena);
  const codigo = await nuevoCodigo();
  // Solo si todavía no hay ninguna cuenta (por si se abrió en dos pestañas).
  const creado = await prisma.$transaction(async (tx) => {
    if ((await tx.usuario.count()) > 0) return null;
    return tx.usuario.create({ data: { username: usuario, passwordHash, ...codigo } });
  });
  if (!creado) redirect("/login");

  await crearSesion(creado.id);
  redirect("/codigo-recuperacion");
}

// ── Ingreso ──────────────────────────────────────────────────

export async function iniciarSesion(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const username = normalizarUsuario(texto(fd, "usuario"));
  const contrasena = texto(fd, "contrasena");
  if (!username || !contrasena) return { error: "Ingresá tu usuario y tu contraseña." };

  const bloqueo = await minutosDeBloqueo();
  if (bloqueo) return { error: mensajeBloqueo(bloqueo) };

  const usuario = await prisma.usuario.findUnique({ where: { username } });
  const valida = usuario ? await coincide(contrasena, usuario.passwordHash) : await compararRelleno(contrasena);
  if (!usuario || !valida) {
    await registrarFallo("login");
    return { error: await mensajeFallo("Usuario o contraseña incorrectos.") };
  }

  await limpiarFallos();
  // Cuentas creadas antes de que existiera el código: se genera al entrar.
  let pendiente = usuario.codigoPendiente;
  if (!usuario.codigoRecuperacionHash) {
    const codigo = await nuevoCodigo();
    await prisma.usuario.update({ where: { id: usuario.id }, data: codigo });
    pendiente = codigo.codigoPendiente;
  }
  await crearSesion(usuario.id);
  redirect(pendiente ? "/codigo-recuperacion" : "/");
}

// ── Código de recuperación ───────────────────────────────────

/** Confirma que guardó el código: se borra el texto plano y sigue al panel. */
export async function confirmarCodigoGuardado(): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  await prisma.usuario.update({ where: { id: sesion.id }, data: { codigoPendiente: null } });
  redirect("/");
}

// ── Recuperar usuario / contraseña ───────────────────────────

/** Cuenta a la que pertenece el código (o null). Cuenta como intento si no coincide. */
async function usuarioPorCodigo(codigoBruto: string) {
  const codigo = normalizarCodigo(codigoBruto);
  const usuarios = await prisma.usuario.findMany({ where: { codigoRecuperacionHash: { not: null } } });
  for (const u of usuarios) {
    if (await coincide(codigo, u.codigoRecuperacionHash!)) return u;
  }
  if (usuarios.length === 0) await compararRelleno(codigo);
  await registrarFallo("recuperacion");
  return null;
}

export type EstadoRecuperar = EstadoForm & {
  /** Paso 2: el código fue válido; se muestra el usuario y se pide el nuevo acceso. */
  verificado?: { codigo: string; usuario: string };
};

/**
 * Un mismo formulario para los dos pasos: sin `paso=2` verifica el código;
 * con `paso=2` vuelve a verificarlo y guarda el usuario y la contraseña nuevos.
 */
export async function recuperarAcceso(_prev: EstadoRecuperar, fd: FormData): Promise<EstadoRecuperar> {
  const codigo = normalizarCodigo(texto(fd, "codigo"));
  const formato = validarFormatoCodigo(codigo);
  if (formato) return { campos: { codigo: formato } };

  const bloqueo = await minutosDeBloqueo();
  if (bloqueo) return { error: mensajeBloqueo(bloqueo) };

  const cuenta = await usuarioPorCodigo(codigo);
  if (!cuenta) {
    return { error: await mensajeFallo("El código no es correcto. Revisá mayúsculas, minúsculas y números.") };
  }
  if (texto(fd, "paso") !== "2") return { verificado: { codigo, usuario: cuenta.username } };

  // Paso 2: nuevo usuario y contraseña.
  const verificado = { codigo, usuario: cuenta.username };
  const usuario = normalizarUsuario(texto(fd, "usuario"));
  const contrasena = texto(fd, "contrasena");
  const campos = erroresCuenta(usuario, contrasena, texto(fd, "repetir"));
  if (campos) return { verificado, campos };
  const otro = await prisma.usuario.findUnique({ where: { username: usuario } });
  if (otro && otro.id !== cuenta.id) return { verificado, campos: { usuario: "Ese nombre de usuario ya está en uso." } };

  // El código usado deja de servir: se genera uno nuevo y se muestra.
  await prisma.usuario.update({
    where: { id: cuenta.id },
    data: { username: usuario, passwordHash: await hashear(contrasena), ...(await nuevoCodigo()) },
  });
  await cerrarOtrasSesiones(cuenta.id);
  await limpiarFallos();
  await crearSesion(cuenta.id);
  redirect("/codigo-recuperacion?motivo=recuperado");
}

// ── Sesión ───────────────────────────────────────────────────

/**
 * Cierra la sesión de este navegador. No redirige: quien la llama hace una
 * navegación completa al login para que no quede nada en memoria.
 */
export async function cerrarSesion(): Promise<void> {
  await cerrarSesionActual();
}

/** Mantiene viva la sesión mientras hay actividad en pantalla. */
export async function mantenerSesion(): Promise<{ activa: boolean }> {
  return { activa: (await obtenerSesion()) !== null };
}
