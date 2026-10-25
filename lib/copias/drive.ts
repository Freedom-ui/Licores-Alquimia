// Copias de seguridad en Google Drive. Solo servidor.
//
// OAuth de "aplicación de escritorio" (PKCE + redirección a la propia app en
// 127.0.0.1) con el permiso `drive.file`: la app solo ve los archivos que ella
// misma creó (su carpeta de copias), nada más del Drive del usuario. Se habla
// con la API v3 por fetch, sin la librería de Google.
//
// La conexión (refresh token, cuenta y carpeta) se guarda en drive.json, fuera
// de la base: restaurar una copia no la pisa y las copias no llevan el token.
// Las credenciales de la app (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) las pone
// el proceso de Electron o el .env; en una app de escritorio no son secretas
// (así lo indica Google), lo que protege es el consentimiento del usuario.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { archivoDrive } from "@/lib/datos/rutas";
import { copiasABorrar, leerNombre, type InfoCopia } from "./nombres";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOCAR = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/drive/v3";
const SUBIDA = "https://www.googleapis.com/upload/drive/v3/files";
const PERMISOS = "openid email https://www.googleapis.com/auth/drive.file";
export const NOMBRE_CARPETA = "Licores Alquimia - Copias de seguridad";
const CARPETA_MIME = "application/vnd.google-apps.folder";

// ── Conexión guardada ────────────────────────────────────────

export type ConexionDrive = {
  refreshToken: string;
  email: string;
  carpetaId?: string;
  conectadoEn: string;
  ultimaSubida?: { nombre: string; fecha: string };
  /** Último problema al subir o al hablar con Drive (se borra al subir bien). */
  error?: { mensaje: string; desde: string };
  /** Google rechazó el permiso (lo revocaron o venció): hay que volver a conectar. */
  desconectada?: boolean;
};

export function leerConexion(): ConexionDrive | null {
  try {
    const archivo = archivoDrive();
    if (!existsSync(archivo)) return null;
    const c = JSON.parse(readFileSync(archivo, "utf8")) as ConexionDrive;
    return typeof c.refreshToken === "string" && typeof c.email === "string" ? c : null;
  } catch {
    return null;
  }
}

function guardarConexion(c: ConexionDrive | null) {
  const archivo = archivoDrive();
  if (!c) {
    if (existsSync(archivo)) writeFileSync(archivo, "{}");
    return;
  }
  mkdirSync(path.dirname(archivo), { recursive: true });
  writeFileSync(`${archivo}.tmp`, JSON.stringify(c, null, 2));
  renameSync(`${archivo}.tmp`, archivo);
}

function actualizarConexion(cambios: Partial<ConexionDrive>) {
  const c = leerConexion();
  if (c) guardarConexion({ ...c, ...cambios });
}

export function credencialesConfiguradas(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function credenciales() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secreto = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secreto) throw new ErrorDrive("Esta versión de la app no tiene configurada la conexión con Google Drive.");
  return { id, secreto };
}

/** Error con mensaje para el usuario. `sinPermiso`: Google rechazó la conexión (hay que volver a conectar). */
export class ErrorDrive extends Error {
  constructor(
    mensaje: string,
    readonly sinPermiso = false
  ) {
    super(mensaje);
  }
}

// ── Conectar (OAuth con PKCE) ────────────────────────────────

type Pendiente = { verificador: string; redireccion: string; vence: number };
const g = globalThis as unknown as { alquimiaOauth?: Map<string, Pendiente> };
const pendientes = (g.alquimiaOauth ??= new Map());

const base64url = (b: Buffer) => b.toString("base64url");

/** URL de Google para dar el permiso. `redireccion`: la ruta de la app que recibe la respuesta. */
export function urlDeConexion(redireccion: string): string {
  const { id } = credenciales();
  const ahora = Date.now();
  for (const [k, p] of pendientes) if (p.vence < ahora) pendientes.delete(k);
  const estado = base64url(randomBytes(32));
  const verificador = base64url(randomBytes(48));
  pendientes.set(estado, { verificador, redireccion, vence: ahora + 15 * 60_000 });
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redireccion,
    response_type: "code",
    scope: PERMISOS,
    state: estado,
    code_challenge: base64url(createHash("sha256").update(verificador).digest()),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent select_account",
  });
  return `${AUTH}?${p}`;
}

/** Email de la cuenta, del id_token que devuelve Google (llega directo de Google por https). */
export function emailDeIdToken(idToken: string | undefined): string {
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : "";
  } catch {
    return "";
  }
}

/** Respuesta de Google (callback): cambia el código por el permiso y guarda la conexión. */
export async function completarConexion(estado: string, codigo: string): Promise<ConexionDrive> {
  const p = pendientes.get(estado);
  pendientes.delete(estado);
  if (!p || p.vence < Date.now()) throw new ErrorDrive("El pedido de conexión venció o no es de esta app. Volvé a tocar \"Conectar con Google Drive\".");
  const { id, secreto } = credenciales();
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: codigo,
      client_id: id,
      client_secret: secreto,
      redirect_uri: p.redireccion,
      grant_type: "authorization_code",
      code_verifier: p.verificador,
    }),
  });
  const datos = (await r.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; expires_in?: number; id_token?: string; scope?: string };
  if (!r.ok || !datos.refresh_token || !datos.access_token) throw new ErrorDrive("Google no confirmó la conexión. Probá de nuevo.");
  if (!datos.scope?.includes("drive.file")) {
    throw new ErrorDrive("Hace falta tildar el permiso para guardar archivos en Google Drive. Volvé a conectar y aceptalo.");
  }
  const anterior = leerConexion();
  const email = emailDeIdToken(datos.id_token);
  const conexion: ConexionDrive = {
    refreshToken: datos.refresh_token,
    email,
    conectadoEn: new Date().toISOString(),
    // Misma cuenta: se sigue usando la misma carpeta.
    carpetaId: anterior?.email === email ? anterior.carpetaId : undefined,
    ultimaSubida: anterior?.email === email ? anterior.ultimaSubida : undefined,
  };
  guardarConexion(conexion);
  acceso = { token: datos.access_token, vence: Date.now() + (datos.expires_in ?? 3600) * 1000 - 60_000, refresh: datos.refresh_token };
  return conexion;
}

export async function desconectar(): Promise<void> {
  const c = leerConexion();
  guardarConexion(null);
  acceso = null;
  if (c) await fetch(`${REVOCAR}?token=${encodeURIComponent(c.refreshToken)}`, { method: "POST" }).catch(() => undefined);
}

// ── Llamadas a la API ────────────────────────────────────────

let acceso: { token: string; vence: number; refresh: string } | null = null;

async function tokenDeAcceso(): Promise<string> {
  const c = leerConexion();
  if (!c || c.desconectada) throw new ErrorDrive("Google Drive no está conectado.", true);
  if (acceso && acceso.refresh === c.refreshToken && acceso.vence > Date.now()) return acceso.token;
  const { id, secreto } = credenciales();
  let r: Response;
  try {
    r = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secreto, refresh_token: c.refreshToken, grant_type: "refresh_token" }),
    });
  } catch {
    throw new ErrorDrive("No hay conexión a internet.");
  }
  const datos = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (datos.error === "invalid_grant") {
    actualizarConexion({ desconectada: true });
    throw new ErrorDrive("Google Drive se desconectó (se quitó el permiso o venció). Volvé a conectarlo.", true);
  }
  if (!r.ok || !datos.access_token) throw new ErrorDrive("Google Drive no respondió. Se vuelve a intentar más tarde.");
  acceso = { token: datos.access_token, vence: Date.now() + (datos.expires_in ?? 3600) * 1000 - 60_000, refresh: c.refreshToken };
  return acceso.token;
}

async function api(url: string, init: RequestInit = {}, reintento = true): Promise<Response> {
  const token = await tokenDeAcceso();
  let r: Response;
  try {
    r = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch {
    throw new ErrorDrive("No hay conexión a internet.");
  }
  if (r.status === 401) {
    // Permiso de acceso vencido antes de tiempo: se pide otro una vez.
    acceso = null;
    if (reintento) return api(url, init, false);
    throw new ErrorDrive("Google Drive rechazó el pedido. Se vuelve a intentar más tarde.");
  }
  if (r.status === 403 && (await r.clone().text()).includes("storageQuotaExceeded")) {
    throw new ErrorDrive("El Google Drive está lleno: liberá espacio para que se sigan guardando las copias.");
  }
  return r;
}

async function json<T>(r: Response, que: string): Promise<T> {
  if (!r.ok) throw new ErrorDrive(`Google Drive no pudo ${que} (error ${r.status}).`);
  return (await r.json()) as T;
}

const comillasQ = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** Id de la carpeta de copias (la crea si no está o si la mandaron a la papelera). */
async function carpeta(): Promise<string> {
  const c = leerConexion();
  if (c?.carpetaId) {
    const r = await api(`${API}/files/${c.carpetaId}?fields=id,trashed`);
    if (r.ok && !(await r.json()).trashed) return c.carpetaId;
  }
  const q = `name = ${comillasQ(NOMBRE_CARPETA)} and mimeType = '${CARPETA_MIME}' and trashed = false`;
  const lista = await json<{ files: { id: string }[] }>(await api(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)`), "buscar la carpeta");
  let id = lista.files[0]?.id;
  if (!id) {
    const r = await api(`${API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: NOMBRE_CARPETA, mimeType: CARPETA_MIME }),
    });
    id = (await json<{ id: string }>(r, "crear la carpeta")).id;
  }
  actualizarConexion({ carpetaId: id });
  return id;
}

export type CopiaDrive = InfoCopia & { id: string; tamano: number };

export async function listarCopiasDrive(): Promise<CopiaDrive[]> {
  const id = await carpeta();
  const q = `${comillasQ(id)} in parents and trashed = false`;
  const out: CopiaDrive[] = [];
  let pagina: string | undefined;
  do {
    const url = `${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,size)&pageSize=1000${pagina ? `&pageToken=${pagina}` : ""}`;
    const r = await json<{ files: { id: string; name: string; size?: string }[]; nextPageToken?: string }>(await api(url), "listar las copias");
    for (const f of r.files) {
      const info = leerNombre(f.name);
      if (info) out.push({ ...info, id: f.id, tamano: Number(f.size ?? 0) });
    }
    pagina = r.nextPageToken;
  } while (pagina);
  return out.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

/** Sube una copia local comprimida (nombre.db.gz). */
export async function subirCopia(nombre: string, contenido: Buffer): Promise<void> {
  const id = await carpeta();
  const gz = gzipSync(contenido);
  const inicio = await api(`${SUBIDA}?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/gzip", "X-Upload-Content-Length": String(gz.length) },
    body: JSON.stringify({ name: `${nombre}.gz`, parents: [id], mimeType: "application/gzip" }),
  });
  const destino = inicio.headers.get("location");
  if (!inicio.ok || !destino) throw new ErrorDrive(`Google Drive no pudo empezar la subida (error ${inicio.status}).`);
  await json(await api(destino, { method: "PUT", headers: { "Content-Type": "application/gzip" }, body: new Uint8Array(gz) }), "subir la copia");
  actualizarConexion({ ultimaSubida: { nombre, fecha: new Date().toISOString() }, error: undefined });
}

/** Baja una copia y la devuelve descomprimida. */
export async function bajarCopia(id: string): Promise<Buffer> {
  const r = await api(`${API}/files/${encodeURIComponent(id)}?alt=media`);
  if (!r.ok) throw new ErrorDrive(`Google Drive no pudo bajar la copia (error ${r.status}).`);
  const datos = Buffer.from(await r.arrayBuffer());
  try {
    return gunzipSync(datos);
  } catch {
    throw new ErrorDrive("La copia bajada de Google Drive está dañada.");
  }
}

export async function borrarCopiaDrive(id: string): Promise<void> {
  const r = await api(`${API}/files/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new ErrorDrive(`Google Drive no pudo borrar una copia vieja (error ${r.status}).`);
}

/**
 * Sube las copias locales recientes que todavía no están en Drive (de la más
 * nueva a la más vieja, hasta 5 por vez) y borra de Drive las que ya no hace
 * falta conservar. Anota el error en drive.json si algo falla.
 */
export async function sincronizarDrive(locales: { nombre: string; fecha: Date; leer: () => Buffer }[], ahora = new Date()): Promise<void> {
  const c = leerConexion();
  if (!c || c.desconectada || !credencialesConfiguradas()) return;
  try {
    const enDrive = await listarCopiasDrive();
    const subidas = new Set(enDrive.map((d) => d.nombre.replace(/\.gz$/, "")));
    const semana = ahora.getTime() - 7 * 86_400_000;
    const faltan = locales.filter((l) => !subidas.has(l.nombre) && l.fecha.getTime() >= semana).slice(0, 5);
    for (const l of faltan) await subirCopia(l.nombre, l.leer());
    const todas = faltan.length ? await listarCopiasDrive() : enDrive;
    for (const vieja of copiasABorrar(todas, ahora)) await borrarCopiaDrive(vieja.id);
    if (leerConexion()?.error) actualizarConexion({ error: undefined });
  } catch (e) {
    const mensaje = e instanceof ErrorDrive ? e.message : "Google Drive no respondió. Se vuelve a intentar más tarde.";
    const actual = leerConexion();
    actualizarConexion({ error: { mensaje, desde: actual?.error?.desde ?? new Date().toISOString() } });
    throw e;
  }
}
