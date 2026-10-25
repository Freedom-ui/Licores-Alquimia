import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completarConexion, emailDeIdToken, leerConexion, sincronizarDrive, urlDeConexion } from "./drive";
import { nombreCopia } from "./nombres";

let dir: string;
const env = { ...process.env };
const REDIR = "http://127.0.0.1:47811/api/drive/callback";
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "alquimia-drive-"));
  process.env.ALQUIMIA_DATOS = dir;
  process.env.GOOGLE_CLIENT_ID = "cliente.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secreto";
});
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

const respuesta = (cuerpo: unknown, init: ResponseInit = {}) =>
  new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

async function conectar(email = "bodega@gmail.com") {
  const url = new URL(urlDeConexion(REDIR));
  const estado = url.searchParams.get("state")!;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => respuesta({ refresh_token: "r1", access_token: "a1", expires_in: 3600, id_token: idToken(email), scope: "openid email https://www.googleapis.com/auth/drive.file" }))
  );
  await completarConexion(estado, "codigo");
  vi.unstubAllGlobals();
}

describe("conexión", () => {
  it("arma la URL de Google con PKCE, permiso drive.file y la redirección a la app", () => {
    const url = new URL(urlDeConexion(REDIR));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIR);
    expect(url.searchParams.get("scope")).toContain("auth/drive.file");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toMatch(/^[\w-]{40,}$/);
  });

  it("lee el email del id_token", () => {
    expect(emailDeIdToken(idToken("a@b.com"))).toBe("a@b.com");
    expect(emailDeIdToken(undefined)).toBe("");
    expect(emailDeIdToken("basura")).toBe("");
  });

  it("guarda la conexión al volver de Google, y el estado se usa una sola vez", async () => {
    const url = new URL(urlDeConexion(REDIR));
    const estado = url.searchParams.get("state")!;
    const f = vi.fn(async () => respuesta({ refresh_token: "r1", access_token: "a1", id_token: idToken("bodega@gmail.com"), scope: "openid email https://www.googleapis.com/auth/drive.file" }));
    vi.stubGlobal("fetch", f);
    const c = await completarConexion(estado, "codigo");
    expect(c).toMatchObject({ refreshToken: "r1", email: "bodega@gmail.com" });
    expect(leerConexion()?.email).toBe("bodega@gmail.com");
    const cuerpo = new URLSearchParams(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(cuerpo.get("code_verifier")).toBeTruthy();
    expect(cuerpo.get("redirect_uri")).toBe(REDIR);
    await expect(completarConexion(estado, "codigo")).rejects.toThrow(/venció/);
  });

  it("si no tildó el permiso de Drive, no conecta", async () => {
    const estado = new URL(urlDeConexion(REDIR)).searchParams.get("state")!;
    vi.stubGlobal("fetch", vi.fn(async () => respuesta({ refresh_token: "r1", access_token: "a1", scope: "openid email" })));
    await expect(completarConexion(estado, "c")).rejects.toThrow(/permiso/);
    expect(leerConexion()).toBeNull();
  });
});

describe("sincronizarDrive", () => {
  it("sube comprimidas las copias que faltan y borra las que sobran", async () => {
    await conectar();
    const ahora = new Date();
    const ayer = new Date(ahora.getTime() - 86_400_000);
    const vieja = new Date(2020, 0, 1);
    const yaSubida = nombreCopia(ayer, "automatica");
    const nueva = nombreCopia(ahora, "automatica");
    const enDrive = [
      { id: "f1", name: `${yaSubida}.gz`, size: "10" },
      { id: "f0", name: `${nombreCopia(vieja, "antes-de-importar")}.gz`, size: "10" },
    ];
    const subidos: { nombre: string; contenido: Buffer }[] = [];
    const borrados: string[] = [];
    let pendiente = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.startsWith("https://oauth2.googleapis.com/token")) return respuesta({ access_token: "a2", expires_in: 3600 });
        if (url.includes("/files?q=") && url.includes("mimeType")) return respuesta({ files: [{ id: "carpeta" }] });
        if (url.includes("/files?q=")) return respuesta({ files: enDrive });
        if (url.includes("uploadType=resumable")) {
          pendiente = JSON.parse(String(init.body)).name;
          return new Response(null, { status: 200, headers: { location: "https://subida/123" } });
        }
        if (url === "https://subida/123") {
          subidos.push({ nombre: pendiente, contenido: gunzipSync(Buffer.from(init.body as Uint8Array)) });
          enDrive.push({ id: "f2", name: pendiente, size: "10" });
          return respuesta({ id: "f2" });
        }
        if (init.method === "DELETE") {
          borrados.push(url.split("/").pop()!);
          return new Response(null, { status: 204 });
        }
        return respuesta({}, { status: 404 });
      })
    );
    await sincronizarDrive(
      [
        { nombre: nueva, fecha: ahora, leer: () => Buffer.from("copia nueva") },
        { nombre: yaSubida, fecha: ayer, leer: () => Buffer.from("no se lee") },
      ],
      ahora
    );
    expect(subidos).toEqual([{ nombre: `${nueva}.gz`, contenido: Buffer.from("copia nueva") }]);
    expect(borrados).toEqual(["f0"]);
    expect(leerConexion()?.ultimaSubida?.nombre).toBe(nueva);
    expect(leerConexion()?.error).toBeUndefined();
  });

  it("si Google quitó el permiso, queda desconectada y con el error anotado", async () => {
    await conectar();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("https://oauth2.googleapis.com/token") ? respuesta({ error: "invalid_grant" }, { status: 400 }) : respuesta({}, { status: 401 })
      )
    );
    await expect(sincronizarDrive([], new Date())).rejects.toThrow(/desconectó/);
    expect(leerConexion()).toMatchObject({ desconectada: true, error: { mensaje: expect.stringContaining("desconectó") } });
    // Ya no intenta más hasta que se vuelva a conectar.
    await expect(sincronizarDrive([], new Date())).resolves.toBeUndefined();
  });
});
