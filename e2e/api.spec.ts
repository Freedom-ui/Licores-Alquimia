import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

// Pruebas de API por HTTP, contra el servidor de producción de las pruebas
// (puerto 3005, sobre la copia de la base: ver playwright.config.ts).
//
// La app tiene dos clases de "endpoints":
//  1. Rutas HTTP propias (app/api/…): GET /api/copias/[nombre] y GET /api/drive/callback.
//  2. Server actions de Next: un POST a cualquier página con el encabezado
//     `Next-Action: <id>` y los argumentos en JSON. Es lo que usa la pantalla
//     para guardar. El id lo genera el build; se lee del manifiesto de .next.
// Además, proxy.ts manda al login (307) todo pedido sin cookie de sesión.
//
// Son las mismas pruebas que la colección de Postman de la entrega, más casos
// de métodos, encabezados y cuerpos malformados, automatizadas.

const COOKIE = "alquimia_sesion";
const CARPETA_COPIAS = "e2e/.datos/copias";
const COPIA = "alquimia-2026-01-01-000000-manual.db";

/** Token de la sesión que guardó auth.setup.ts. */
function tokenDeSesion(): string {
  const estado = JSON.parse(readFileSync("e2e/.auth/sesion.json", "utf8")) as { cookies: { name: string; value: string }[] };
  const c = estado.cookies.find((x) => x.name === COOKIE);
  if (!c) throw new Error("No hay sesión guardada: falta correr el proyecto «login».");
  return c.value;
}

/** Id de una server action en este build (.next/server/server-reference-manifest.json). */
function idDeAccion(archivo: string, exportada: string): string {
  const manifiesto = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
    node: Record<string, { exportedName?: string; filename?: string }>;
  };
  const sufijo = archivo.replace(/\\/g, "/");
  for (const [id, info] of Object.entries(manifiesto.node)) {
    if (info.exportedName === exportada && info.filename?.replace(/\\/g, "/").endsWith(sufijo)) return id;
  }
  throw new Error(`No encontré la server action ${exportada} de ${archivo} en el manifiesto del build.`);
}

/**
 * La respuesta de una server action viene en el formato de React (líneas
 * `n:<json>`). Devuelve el primer objeto con la forma de un Resultado de la app.
 */
async function resultado(r: APIResponse): Promise<{ ok: boolean; error?: string; campo?: string; sinSesion?: boolean; estado?: { operaciones: { id: number; cantidad: number; pu: number; subTotal: number }[] } }> {
  const texto = await r.text();
  for (const linea of texto.split("\n")) {
    const m = /^[0-9a-f]+:(\{.*\})$/.exec(linea.trim());
    if (!m) continue;
    try {
      const obj = JSON.parse(m[1]);
      if (typeof obj === "object" && obj && "ok" in obj) return obj;
    } catch {
      // otra línea del formato
    }
  }
  throw new Error(`La respuesta no trae un resultado de la app:\n${texto.slice(0, 500)}`);
}

const ventaValida = (extra: Record<string, unknown> = {}) => ({
  tipo: "addOperacion",
  v: { fecha: "2026-11-02", clienteId: 1, vendedor: "ALQUIMIA", productoId: 2, cantidad: 3, canal: "Menor", condicion: "Contado", pu: 10000, ...extra },
});

let ejecutar: string;
let token: string;

test.beforeAll(() => {
  ejecutar = idDeAccion("app/(dashboard)/_datos/acciones.ts", "ejecutar");
  token = tokenDeSesion();
  // Una copia de seguridad para las descargas: la base de prueba misma, con un nombre de copia.
  mkdirSync(CARPETA_COPIAS, { recursive: true });
  copyFileSync("e2e/.datos/e2e.db", path.join(CARPETA_COPIAS, COPIA));
});

/** POST de la server action `ejecutar`, como lo hace la pantalla. */
function llamar(request: APIRequestContext, cuerpo: string, { cookie = `${COOKIE}=${token}`, accion = ejecutar } = {}) {
  return request.post("/operaciones", {
    headers: {
      "Next-Action": accion,
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    data: cuerpo,
    maxRedirects: 0,
  });
}
const accionJson = (request: APIRequestContext, accion: unknown, opciones?: Parameters<typeof llamar>[2]) =>
  llamar(request, JSON.stringify([accion]), opciones);

test.describe("Server action ejecutar (POST con Next-Action)", () => {
  test("API-01 alta de venta válida: 200, ok y la venta aparece en el estado devuelto", async ({ request }) => {
    const inicio = Date.now();
    const r = await accionJson(request, ventaValida());
    const ms = Date.now() - inicio;

    expect(r.status()).toBe(200);
    const res = await resultado(r);
    expect(res.ok).toBe(true);
    const ultima = res.estado!.operaciones.at(-1)!;
    expect(ultima).toMatchObject({ cantidad: 3, pu: 10000, subTotal: 30000 });
    expect(ms).toBeLessThan(3000);
  });

  test("API-02 el subtotal lo calcula el servidor: un subTotal manipulado en el pedido se ignora", async ({ request }) => {
    const r = await accionJson(request, { ...ventaValida(), v: { ...ventaValida().v, subTotal: 1 } });

    const res = await resultado(r);
    expect(res.ok).toBe(true);
    expect(res.estado!.operaciones.at(-1)!.subTotal).toBe(30000);
  });

  for (const [nombre, cambio, campo] of [
    ["cantidad -5", { cantidad: -5 }, "cantidad"],
    ["cantidad como texto", { cantidad: "muchas" }, "cantidad"],
    ["fecha «20/10»", { fecha: "20/10" }, "fecha"],
    ["cliente inexistente", { clienteId: 99999 }, "clienteId"],
    ["sin producto", { productoId: null }, "productoId"],
    ["precio unitario negativo", { pu: -100 }, "pu"],
  ] as const) {
    test(`API-03 dato inválido (${nombre}): 200 con ok:false y el campo del error`, async ({ request }) => {
      const r = await accionJson(request, ventaValida(cambio));

      expect(r.status()).toBe(200);
      expect(await resultado(r)).toMatchObject({ ok: false, campo });
    });
  }

  test("API-04 sin cookie de sesión: el proxy redirige al login (307) antes de llegar a la acción", async ({ request }) => {
    const r = await accionJson(request, ventaValida(), { cookie: "" });

    expect(r.status()).toBe(307);
    expect(r.headers()["location"]).toMatch(/\/login$/);
  });

  test("API-05 con una cookie inventada: 200 con ok:false y sinSesion (no guarda)", async ({ request }) => {
    const r = await accionJson(request, ventaValida(), { cookie: `${COOKIE}=inventada123` });

    expect(r.status()).toBe(200);
    expect(await resultado(r)).toMatchObject({ ok: false, sinSesion: true });
  });

  for (const [nombre, accion] of [
    ["un tipo que no existe", { tipo: "borrarTodo" }],
    ["sin tipo", { v: {} }],
    ["null", null],
  ] as const) {
    test(`API-06 acción inválida (${nombre}): «Acción desconocida.»`, async ({ request }) => {
      const r = await accionJson(request, accion);

      expect(r.status()).toBe(200);
      expect(await resultado(r)).toEqual({ ok: false, error: "Acción desconocida." });
    });
  }

  test("API-07 cuerpo que no es JSON: el servidor lo rechaza con un error, sin guardar nada", async ({ request }) => {
    const r = await llamar(request, "esto no es json");

    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test("API-08 un id de server action que no existe: 404", async ({ request }) => {
    const r = await accionJson(request, ventaValida(), { accion: "0".repeat(42) });

    expect(r.status()).toBe(404);
  });
});

test.describe("GET /api/copias/[nombre]", () => {
  const copia = (request: APIRequestContext, nombre: string, cookie: string | null = `${COOKIE}=${token}`) =>
    request.get(`/api/copias/${nombre}`, { headers: cookie ? { Cookie: cookie } : {}, maxRedirects: 0 });

  test("API-09 con sesión: 200, descarga adjunta, sin caché y el archivo es una base SQLite", async ({ request }) => {
    const r = await copia(request, COPIA);

    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toBe("application/octet-stream");
    expect(r.headers()["content-disposition"]).toBe(`attachment; filename="${COPIA}"`);
    expect(r.headers()["cache-control"]).toBe("no-store");
    expect((await r.body()).subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  test("API-10 sin cookie: 307 al login", async ({ request }) => {
    const r = await copia(request, COPIA, null);

    expect(r.status()).toBe(307);
    expect(r.headers()["location"]).toMatch(/\/login$/);
  });

  test("API-11 con cookie inventada: 401", async ({ request }) => {
    expect((await copia(request, COPIA, `${COOKIE}=inventada123`)).status()).toBe(401);
  });

  for (const [nombre, ruta] of [
    ["una copia que no existe", "alquimia-2020-01-01-000000-manual.db"],
    ["../ codificado (salir de la carpeta)", "..%2Fe2e.db"],
    ["un nombre cualquiera", "cualquiera.txt"],
  ] as const) {
    test(`API-12 ${nombre}: 404`, async ({ request }) => {
      expect((await copia(request, ruta)).status()).toBe(404);
    });
  }

  test("API-13 un método que la ruta no tiene (POST, DELETE): 405", async ({ request }) => {
    const headers = { Cookie: `${COOKIE}=${token}` };
    expect((await request.post(`/api/copias/${COPIA}`, { headers })).status()).toBe(405);
    expect((await request.delete(`/api/copias/${COPIA}`, { headers })).status()).toBe(405);
  });
});

test.describe("GET /api/drive/callback (pública)", () => {
  test("API-14 permiso cancelado: 400 con página HTML y mensaje claro, sin pedir sesión", async ({ request }) => {
    const r = await request.get("/api/drive/callback?error=access_denied", { maxRedirects: 0 });

    expect(r.status()).toBe(400);
    expect(r.headers()["content-type"]).toContain("text/html");
    expect(await r.text()).toContain("Cancelaste el permiso");
  });

  test("API-15 sin código: 400", async ({ request }) => {
    const r = await request.get("/api/drive/callback", { maxRedirects: 0 });

    expect(r.status()).toBe(400);
  });

  test("API-16 con un state falso: 400 y no conecta nada", async ({ request }) => {
    const r = await request.get("/api/drive/callback?code=abc&state=falso", { maxRedirects: 0 });

    expect(r.status()).toBe(400);
    expect(await r.text()).toContain("venció o no es de esta app");
  });
});

test.describe("Páginas y proxy", () => {
  test("API-17 una página del panel sin cookie: 307 al login; el login es público (200)", async ({ request }) => {
    const panel = await request.get("/operaciones", { maxRedirects: 0 });
    const login = await request.get("/login", { maxRedirects: 0 });

    expect(panel.status()).toBe(307);
    expect(panel.headers()["location"]).toMatch(/\/login$/);
    expect(login.status()).toBe(200);
  });

  test("API-18 una ruta que no existe, con sesión: 404", async ({ request }) => {
    const r = await request.get("/no-existe", { headers: { Cookie: `${COOKIE}=${token}` }, maxRedirects: 0 });

    expect(r.status()).toBe(404);
  });
});
