// Reglas del acceso (cuenta única). Puro: lo usan los formularios para avisar
// antes de mandar y el servidor (lib/auth/sesion.ts, app/(acceso)/acciones.ts)
// para revalidar todo lo que llega.

/** Cookie de la sesión (la lee también proxy.ts, sin tocar la base). */
export const COOKIE_SESION = "alquimia_sesion";

/** Minutos sin uso hasta que la sesión vence y la pantalla vuelve al login. */
export const INACTIVIDAD_MIN = 15;
/** Duración máxima de una sesión aunque se siga usando. */
export const DURACION_MAX_HORAS = 12;
/** Fallos (login + recuperación) permitidos dentro de la ventana de bloqueo. */
export const MAX_INTENTOS = 5;
/** Ventana y duración del bloqueo por intentos fallidos. */
export const BLOQUEO_MIN = 15;
/** Largo del código de recuperación (letras mayúsculas, minúsculas y números). */
export const LARGO_CODIGO = 7;

export const USUARIO_MIN = 3;
export const USUARIO_MAX = 30;
export const CONTRASENA_MIN = 8;
export const CONTRASENA_MAX = 72; // bcrypt ignora lo que pase de 72 bytes

/** Texto de error o null si está bien. */
export type Validacion = string | null;

export function normalizarUsuario(usuario: string): string {
  return usuario.trim();
}

export function validarUsuario(usuario: string): Validacion {
  const u = normalizarUsuario(usuario);
  if (!u) return "Ingresá un nombre de usuario.";
  if (u.length < USUARIO_MIN) return `El usuario tiene que tener al menos ${USUARIO_MIN} caracteres.`;
  if (u.length > USUARIO_MAX) return `El usuario puede tener hasta ${USUARIO_MAX} caracteres.`;
  if (!/^[A-Za-z0-9._-]+$/.test(u))
    return "Usá solo letras sin tilde, números, punto, guion o guion bajo (sin espacios), por ejemplo maria.lopez";
  return null;
}

export function validarContrasena(contrasena: string, usuario = ""): Validacion {
  if (!contrasena) return "Ingresá una contraseña.";
  if (contrasena.length < CONTRASENA_MIN)
    return `La contraseña tiene que tener al menos ${CONTRASENA_MIN} caracteres.`;
  if (new TextEncoder().encode(contrasena).length > CONTRASENA_MAX) return "La contraseña es demasiado larga.";
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(contrasena) || !/[0-9]/.test(contrasena))
    return "La contraseña tiene que tener al menos una letra y un número.";
  if (usuario && contrasena.toLowerCase() === normalizarUsuario(usuario).toLowerCase())
    return "La contraseña no puede ser igual al usuario.";
  return null;
}

export function validarConfirmacion(contrasena: string, repetida: string): Validacion {
  if (!repetida) return "Repetí la contraseña.";
  return contrasena === repetida ? null : "Las contraseñas no coinciden.";
}

export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/\s+/g, "");
}

export function validarFormatoCodigo(codigo: string): Validacion {
  const c = normalizarCodigo(codigo);
  if (!c) return "Ingresá tu código de recuperación.";
  if (!new RegExp(`^[A-Za-z0-9]{${LARGO_CODIGO}}$`).test(c))
    return `El código tiene ${LARGO_CODIGO} caracteres entre letras y números (respetá mayúsculas y minúsculas).`;
  return null;
}
