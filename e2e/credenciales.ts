import { existsSync, readFileSync } from "node:fs";

// Cuenta de prueba de los recorridos automáticos: E2E_USUARIO / E2E_CLAVE o,
// si no están, `.claude/qa-usuario.local` (ignorado por git).
export function credenciales(): { usuario: string; clave: string } {
  if (process.env.E2E_USUARIO && process.env.E2E_CLAVE) {
    return { usuario: process.env.E2E_USUARIO, clave: process.env.E2E_CLAVE };
  }
  const archivo = ".claude/qa-usuario.local";
  if (!existsSync(archivo)) throw new Error(`Falta ${archivo} o las variables E2E_USUARIO y E2E_CLAVE`);
  const texto = readFileSync(archivo, "utf8");
  const usuario = texto.match(/^usuario=(.+)$/m)?.[1].trim();
  const clave = texto.match(/^contrase\S*?=(.+)$/m)?.[1].trim();
  if (!usuario || !clave) throw new Error(`${archivo} no tiene usuario y contraseña`);
  return { usuario, clave };
}
