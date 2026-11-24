// Se corre antes de cada archivo de pruebas de integración (vitest.config.mts).
//
// 1. Crea una carpeta temporal con una base SQLite nueva y le aplica las
//    migraciones del proyecto (las mismas que usa la app al arrancar).
// 2. Apunta la app a esa carpeta: DATABASE_URL, ALQUIMIA_DATOS (copias de
//    seguridad y drive.json) y ALQUIMIA_MIGRACIONES. dev.db y respaldos/ no se tocan.
// 3. Reemplaza `next/headers` y `next/navigation` por versiones en memoria
//    (galletas.ts): las server actions corren como en el servidor, sin levantarlo.
// 4. Al terminar el archivo cierra la conexión y borra la carpeta.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, vi } from "vitest";
import { migrar } from "@/lib/datos/migrar";

const carpeta = mkdtempSync(path.join(tmpdir(), "alquimia-integracion-"));
const base = path.join(carpeta, "alquimia.db");
const migraciones = path.join(process.cwd(), "prisma", "migrations");

process.env.DATABASE_URL = `file:${base}`;
process.env.ALQUIMIA_DATOS = carpeta;
process.env.ALQUIMIA_MIGRACIONES = migraciones;
delete process.env.SESION_INACTIVIDAD_MIN;
// Sin credenciales de Google: ninguna prueba sale a internet.
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
// El cliente de Prisma se guarda en globalThis fuera de producción: que no se reuse el de otro archivo.
delete (globalThis as { prisma?: unknown }).prisma;

migrar(base, migraciones);

vi.mock("next/headers", async () => {
  const { almacenCookies, cabeceras } = await import("./galletas");
  return { cookies: async () => almacenCookies, headers: async () => cabeceras };
});

vi.mock("next/navigation", async () => {
  const { Redireccion } = await import("./galletas");
  return {
    redirect: (destino: string) => {
      throw new Redireccion(destino);
    },
  };
});

beforeEach(async () => {
  const { borrarCookies } = await import("./galletas");
  borrarCookies();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  try {
    rmSync(carpeta, { recursive: true, force: true });
  } catch {
    // En Windows el archivo puede seguir tomado unos instantes: queda en la carpeta temporal del sistema.
  }
});


