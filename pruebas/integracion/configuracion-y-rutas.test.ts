// Integración: acciones de Configuración (app/(dashboard)/configuracion/acciones.ts)
// y las dos rutas HTTP propias de la app, llamadas como las llama Next:
//   GET /api/copias/[nombre]   → descarga de una copia de seguridad (con sesión)
//   GET /api/drive/callback    → vuelta de Google al conectar Drive (pública)
// Las copias se escriben en la carpeta temporal de la prueba (ALQUIMIA_DATOS).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hacerCopia } from "@/lib/copias/local";
import { GET as descargarCopia } from "@/app/api/copias/[nombre]/route";
import { GET as volverDeGoogle } from "@/app/api/drive/callback/route";
import {
  consultarCopias,
  copiarAhora,
  guardarEmpresa,
  restaurarArchivo,
  restaurarDrive,
  restaurarLocal,
} from "@/app/(dashboard)/configuracion/acciones";
import { galletas } from "./galletas";
import { entrar, vaciarBase } from "./ayudantes";

const carpetaCopias = () => path.join(process.env.ALQUIMIA_DATOS!, "copias");
const pedirCopia = (nombre: string) =>
  descargarCopia(new Request(`http://127.0.0.1/api/copias/${encodeURIComponent(nombre)}`), { params: Promise.resolve({ nombre }) });
const callback = (query: string) => volverDeGoogle(new Request(`http://127.0.0.1/api/drive/callback${query}`));

const empresaOk = { nombre: "Licores Alquimia", razonSocial: "Alquimia SRL", cuit: "30-71234567-1", domicilio: "Colón 1234", registroPupaa: "123", reba: "456" };

beforeEach(() => vaciarBase());

describe("GET /api/copias/[nombre] — descarga de copias", () => {
  it("IT-R01 sin sesión responde 401 y no entrega el archivo", async () => {
    const copia = hacerCopia("manual");

    const r = await pedirCopia(copia.nombre);

    expect(r.status).toBe(401);
    expect(await r.text()).toContain("sesión terminó");
  });

  it("IT-R02 con sesión entrega la copia como descarga (200, adjunto, sin caché)", async () => {
    await entrar();
    const copia = hacerCopia("manual");

    const r = await pedirCopia(copia.nombre);

    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toBe(`attachment; filename="${copia.nombre}"`);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.subarray(0, 15).toString()).toBe("SQLite format 3");
    expect(bytes.length).toBe(readFileSync(copia.ruta).length);
  });

  it.each([
    ["una copia que no existe", "alquimia-2020-01-01-000000-manual.db"],
    ["un nombre con ../ (salir de la carpeta)", "../alquimia.db"],
    ["la base misma", "alquimia.db"],
    ["una ruta absoluta", "C:\\Windows\\win.ini"],
  ])("IT-R03 %s → 404", async (_n, nombre) => {
    await entrar();
    hacerCopia("manual");

    const r = await pedirCopia(nombre);

    expect(r.status).toBe(404);
  });

  it("IT-R04 una cookie inventada cuenta como sin sesión (401)", async () => {
    galletas.set("alquimia_sesion", "inventada123");
    const copia = hacerCopia("manual");

    expect((await pedirCopia(copia.nombre)).status).toBe(401);
  });
});

describe("GET /api/drive/callback — vuelta de Google", () => {
  it("IT-R05 si el usuario cancela el permiso: 400 y un mensaje claro", async () => {
    const r = await callback("?error=access_denied");

    expect(r.status).toBe(400);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(await r.text()).toContain("Cancelaste el permiso");
  });

  it("IT-R06 sin código de Google: 400", async () => {
    const r = await callback("");

    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Google no confirmó la conexión");
  });

  it("IT-R07 con un `state` que la app no generó (pedido falso o vencido): 400 y no conecta nada", async () => {
    const r = await callback("?code=abc&state=inventado");

    expect(r.status).toBe(400);
    expect(await r.text()).toContain("venció o no es de esta app");
    expect(existsSync(path.join(process.env.ALQUIMIA_DATOS!, "drive.json"))).toBe(false);
  });
});

describe("Datos del establecimiento (guardarEmpresa)", () => {
  it("IT-C01 sin sesión no guarda", async () => {
    const r = await guardarEmpresa(empresaOk);

    expect(r).toMatchObject({ ok: false, sinSesion: true });
    expect(await prisma.empresa.count()).toBe(0);
  });

  it("IT-C02 con datos válidos los guarda (y una segunda vez los actualiza, sin duplicar)", async () => {
    await entrar();

    await guardarEmpresa(empresaOk);
    const r = await guardarEmpresa({ ...empresaOk, domicilio: "Belgrano 50" });

    expect(r.ok).toBe(true);
    expect(await prisma.empresa.findMany()).toEqual([expect.objectContaining({ id: 1, domicilio: "Belgrano 50", cuit: "30-71234567-1" })]);
  });

  it.each([
    ["sin nombre", { nombre: "" }, "nombre"],
    ["CUIT con dígito verificador mal", { cuit: "30-71234567-2" }, "cuit"],
    ["domicilio larguísimo", { domicilio: "x".repeat(500) }, "domicilio"],
  ])("IT-C03 %s → error en «%s» y no se guarda", async (_n, cambio, campo) => {
    await entrar();

    const r = await guardarEmpresa({ ...empresaOk, ...cambio });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores?.[campo]).toBeTruthy();
    expect(await prisma.empresa.count()).toBe(0);
  });
});

describe("Copias de seguridad y restauración", () => {
  it("IT-C04 sin sesión no consulta ni hace copias", async () => {
    const copias = () => (existsSync(carpetaCopias()) ? readdirSync(carpetaCopias()).length : 0);
    const antes = copias();

    expect(await consultarCopias()).toMatchObject({ ok: false, sinSesion: true });
    expect(await copiarAhora()).toMatchObject({ ok: false, sinSesion: true });
    expect(copias()).toBe(antes);
  });

  it("IT-C05 «Hacer copia ahora» deja una copia manual en la carpeta de copias", async () => {
    await entrar();

    const r = await copiarAhora();

    expect(r.ok).toBe(true);
    expect(readdirSync(carpetaCopias()).some((n) => /^alquimia-.*-manual\.db$/.test(n))).toBe(true);
  });

  it("IT-C06 restaurar una copia local que no existe, o con un nombre manipulado, se rechaza", async () => {
    await entrar();

    expect(await restaurarLocal("alquimia-2020-01-01-000000-manual.db")).toEqual({ ok: false, error: "Esa copia ya no está en la PC." });
    expect(await restaurarLocal("../alquimia.db")).toEqual({ ok: false, error: "Esa copia ya no está en la PC." });
    expect(await restaurarLocal(123)).toEqual({ ok: false, error: "Esa copia ya no está en la PC." });
  });

  it("IT-C07 restaurar desde Drive con un id con caracteres raros se rechaza antes de ir a internet", async () => {
    await entrar();

    expect(await restaurarDrive("../../etc")).toEqual({ ok: false, error: "Copia desconocida." });
  });

  it("IT-C08 subir un archivo vacío o que no es una base de la app se rechaza y no queda nada pendiente", async () => {
    await entrar();
    const vacio = new FormData();
    const basura = new FormData();
    basura.set("archivo", new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "copia.db"));

    const a = await restaurarArchivo(vacio);
    const b = await restaurarArchivo(basura);

    expect(a).toEqual({ ok: false, error: "Elegí el archivo de la copia (.db o .db.gz)." });
    expect(b.ok).toBe(false);
    expect(existsSync(path.join(process.env.ALQUIMIA_DATOS!, "restaurar-pendiente.db"))).toBe(false);
  });

  it("IT-C09 subir una copia válida la deja lista para el próximo arranque y guarda antes una copia de lo actual", async () => {
    await entrar();
    const copia = hacerCopia("manual");
    const fd = new FormData();
    fd.set("archivo", new File([new Uint8Array(readFileSync(copia.ruta))], copia.nombre));

    const r = await restaurarArchivo(fd);

    expect(r).toEqual({ ok: true, reinicio: false }); // fuera de la app de escritorio no hay quién reinicie
    expect(existsSync(path.join(process.env.ALQUIMIA_DATOS!, "restaurar-pendiente.db"))).toBe(true);
    expect(readdirSync(carpetaCopias()).some((n) => n.endsWith("-antes-de-restaurar.db"))).toBe(true);
  });
});
