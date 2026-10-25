import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrar } from "@/lib/datos/migrar";
import { aplicarRestauracionPendiente, hacerCopia, hayCambiosSinCopia, listarCopias, prepararRestauracion, rotarCopias, verificarBase } from "./local";

let dir: string;
const env = { ...process.env };
const base = () => path.join(dir, "alquimia.db");
const clientes = (archivo = base()) => {
  const db = new Database(archivo, { readonly: true });
  const r = (db.prepare("SELECT razonSocial FROM Cliente ORDER BY id").all() as { razonSocial: string }[]).map((c) => c.razonSocial);
  db.close();
  return r;
};
const agregarCliente = (nombre: string) => {
  const db = new Database(base());
  db.prepare("INSERT INTO Cliente (razonSocial) VALUES (?)").run(nombre);
  db.close();
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "alquimia-copias-"));
  process.env.ALQUIMIA_DATOS = dir;
  process.env.DATABASE_URL = `file:${base()}`;
  process.env.ALQUIMIA_MIGRACIONES = path.join(process.cwd(), "prisma", "migrations");
  migrar(base(), process.env.ALQUIMIA_MIGRACIONES);
  agregarCliente("Bar Uno");
});
afterEach(() => {
  process.env = { ...env };
  rmSync(dir, { recursive: true, force: true });
});

describe("copias locales", () => {
  it("hace una copia verificada en copias/ con el nombre esperado", () => {
    const c = hacerCopia("manual", new Date(2026, 9, 24, 10, 0, 0));
    expect(c.nombre).toBe("alquimia-2026-10-24-100000-manual.db");
    expect(path.dirname(c.ruta)).toBe(path.join(dir, "copias"));
    expect(c.tamano).toBeGreaterThan(0);
    expect(verificarBase(c.ruta)).toEqual({ ok: true });
    expect(clientes(c.ruta)).toEqual(["Bar Uno"]);
    expect(readdirSync(path.join(dir, "copias"))).toEqual([c.nombre]);
  });

  it("no pisa una copia del mismo segundo", () => {
    const f = new Date(2026, 9, 24, 10, 0, 0);
    hacerCopia("manual", f);
    hacerCopia("manual", f);
    expect(listarCopias().map((c) => c.nombre)).toEqual(["alquimia-2026-10-24-100001-manual.db", "alquimia-2026-10-24-100000-manual.db"]);
  });

  it("rota según la política", () => {
    const ahora = new Date();
    const vieja = new Date(ahora.getTime() - 90 * 86_400_000);
    hacerCopia("antes-de-importar", vieja);
    hacerCopia("automatica", ahora);
    expect(rotarCopias(ahora)).toHaveLength(1);
    expect(listarCopias()).toHaveLength(1);
  });

  it("detecta cambios sin copia", () => {
    expect(hayCambiosSinCopia()).toBe(true);
    hacerCopia("automatica", new Date(Date.now() + 5000));
    expect(hayCambiosSinCopia()).toBe(false);
  });

  it("rechaza archivos que no son copias de la app", () => {
    const otro = path.join(dir, "otro.db");
    const db = new Database(otro);
    db.exec("CREATE TABLE X (id INTEGER)");
    db.close();
    expect(verificarBase(otro)).toMatchObject({ ok: false, motivo: expect.stringContaining("no es una copia") });
    const basura = path.join(dir, "basura.db");
    writeFileSync(basura, "esto no es una base");
    expect(verificarBase(basura).ok).toBe(false);
  });
});

describe("restaurar", () => {
  it("deja la copia pendiente, guarda lo actual y la aplica en el próximo arranque", () => {
    const copia = hacerCopia("manual", new Date(2026, 0, 1));
    agregarCliente("Bar Dos");
    expect(clientes()).toEqual(["Bar Uno", "Bar Dos"]);

    prepararRestauracion(copia.ruta);
    expect(clientes()).toEqual(["Bar Uno", "Bar Dos"]); // todavía no
    const previa = listarCopias().find((c) => c.motivo === "antes-de-restaurar")!;
    expect(clientes(previa.ruta)).toEqual(["Bar Uno", "Bar Dos"]);

    expect(aplicarRestauracionPendiente()).toBe(true);
    expect(clientes()).toEqual(["Bar Uno"]);
    expect(aplicarRestauracionPendiente()).toBe(false);
  });

  it("acepta el contenido de un archivo subido y rechaza uno que no sirve", () => {
    const copia = hacerCopia("manual", new Date(2026, 0, 1));
    agregarCliente("Bar Dos");
    prepararRestauracion(readFileSync(copia.ruta));
    aplicarRestauracionPendiente();
    expect(clientes()).toEqual(["Bar Uno"]);

    expect(() => prepararRestauracion(Buffer.from("cualquier cosa"))).toThrow(/no es una copia/);
    expect(existsSync(path.join(dir, "restaurar-pendiente.db"))).toBe(false);
  });
});
