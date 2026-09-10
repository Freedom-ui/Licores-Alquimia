-- RedefineTables (SQLite no permite DROP COLUMN con FKs entrantes de forma directa
-- en todas las versiones, así que reconstruimos la tabla siguiendo el patrón estándar
-- de Prisma para SQLite)
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "razonSocial" TEXT,
    "apellidoNombre" TEXT,
    "condIva" TEXT,
    "cuit" TEXT,
    "telCel" TEXT,
    "mail" TEXT,
    "domicilio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migramos lo que había (el campo "nombre" viejo pasa a razonSocial para no perder datos de prueba)
INSERT INTO "new_Cliente" ("id", "razonSocial", "createdAt")
SELECT "id", "nombre", CURRENT_TIMESTAMP FROM "Cliente";

DROP TABLE "Cliente";
ALTER TABLE "new_Cliente" RENAME TO "Cliente";

PRAGMA foreign_keys=ON;
