-- Fase 5: los vendedores pasan de una lista fija en el código a un catálogo en
-- la base (los trae la importación de la planilla). Arranca con "ALQUIMIA" (la
-- venta directa) y con los vendedores que ya figuran en las ventas cargadas.

-- CreateTable
CREATE TABLE "Vendedor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL
);

INSERT INTO "Vendedor" ("nombre") VALUES ('ALQUIMIA');
INSERT INTO "Vendedor" ("nombre")
  SELECT DISTINCT "vendedor" FROM "Operacion"
  WHERE "vendedor" <> '' AND "vendedor" NOT IN (SELECT "nombre" FROM "Vendedor");
