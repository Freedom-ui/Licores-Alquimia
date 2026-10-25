import { mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BaseMasNueva, leerMigraciones, migrar } from "./migrar";

const MIGRACIONES = path.join(process.cwd(), "prisma", "migrations");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "alquimia-migrar-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const tablas = (archivo: string) => {
  const db = new Database(archivo, { readonly: true });
  const filas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
  db.close();
  return filas.map((f) => f.name);
};

describe("migrar", () => {
  it("crea una base nueva con todas las migraciones y las anota como Prisma", () => {
    const archivo = path.join(dir, "datos", "alquimia.db");
    const r = migrar(archivo, MIGRACIONES);
    expect(r.baseNueva).toBe(true);
    expect(r.aplicadas).toEqual(leerMigraciones(MIGRACIONES).map((m) => m.nombre));
    expect(tablas(archivo)).toEqual(expect.arrayContaining(["Usuario", "Cliente", "Compra", "_prisma_migrations"]));

    const db = new Database(archivo, { readonly: true });
    const anotadas = db.prepare("SELECT migration_name, checksum, finished_at FROM _prisma_migrations").all() as {
      migration_name: string;
      checksum: string;
      finished_at: number;
    }[];
    db.close();
    const porNombre = new Map(leerMigraciones(MIGRACIONES).map((m) => [m.nombre, m.checksum]));
    expect(anotadas).toHaveLength(porNombre.size);
    for (const a of anotadas) {
      expect(a.checksum).toBe(porNombre.get(a.migration_name));
      expect(a.finished_at).toBeGreaterThan(0);
    }
  });

  it("no vuelve a aplicar nada si la base está al día", () => {
    const archivo = path.join(dir, "alquimia.db");
    migrar(archivo, MIGRACIONES);
    let llamado = false;
    const r = migrar(archivo, MIGRACIONES, { antesDeAplicar: () => (llamado = true) });
    expect(r).toEqual({ aplicadas: [], baseNueva: false });
    expect(llamado).toBe(false);
  });

  it("aplica solo las pendientes de una base vieja, conservando sus datos, y avisa antes", () => {
    const viejas = path.join(dir, "viejas");
    const todas = leerMigraciones(MIGRACIONES);
    const ultima = todas[todas.length - 1].nombre;
    cpSync(MIGRACIONES, viejas, { recursive: true });
    rmSync(path.join(viejas, ultima), { recursive: true });

    const archivo = path.join(dir, "alquimia.db");
    migrar(archivo, viejas);
    const db = new Database(archivo);
    db.prepare("INSERT INTO Cliente (razonSocial) VALUES ('Cliente de antes')").run();
    db.close();

    const avisos: string[][] = [];
    const r = migrar(archivo, MIGRACIONES, { antesDeAplicar: (p) => avisos.push(p) });
    expect(r.aplicadas).toEqual([ultima]);
    expect(avisos).toEqual([[ultima]]);
    const db2 = new Database(archivo, { readonly: true });
    expect(db2.prepare("SELECT razonSocial FROM Cliente").get()).toEqual({ razonSocial: "Cliente de antes" });
    db2.close();
  });

  it("rechaza una base de una versión más nueva sin tocarla", () => {
    const nuevas = path.join(dir, "nuevas");
    cpSync(MIGRACIONES, nuevas, { recursive: true });
    mkdirSync(path.join(nuevas, "29991231000000_futura"));
    writeFileSync(path.join(nuevas, "29991231000000_futura", "migration.sql"), 'CREATE TABLE "Futura" ("id" INTEGER);');
    const archivo = path.join(dir, "alquimia.db");
    migrar(archivo, nuevas);

    expect(() => migrar(archivo, MIGRACIONES)).toThrow(BaseMasNueva);
    expect(tablas(archivo)).toContain("Futura");
  });

  it("si una migración falla, la base queda como estaba", () => {
    const rotas = path.join(dir, "rotas");
    cpSync(MIGRACIONES, rotas, { recursive: true });
    mkdirSync(path.join(rotas, "29991231000000_rota"));
    writeFileSync(path.join(rotas, "29991231000000_rota", "migration.sql"), 'CREATE TABLE "A" ("id" INTEGER);\nESTO NO ES SQL;');
    const archivo = path.join(dir, "alquimia.db");
    migrar(archivo, MIGRACIONES);

    expect(() => migrar(archivo, rotas)).toThrow();
    expect(tablas(archivo)).not.toContain("A");
    expect(migrar(archivo, MIGRACIONES).aplicadas).toEqual([]);
  });
});
