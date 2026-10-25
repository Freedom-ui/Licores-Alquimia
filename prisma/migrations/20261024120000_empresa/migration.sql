-- Fase 10: datos del establecimiento para los PDF, editables desde
-- Configuración (antes estaban fijos en app/empresa.ts). Una sola fila (id 1).
CREATE TABLE "Empresa" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "nombre" TEXT NOT NULL DEFAULT 'Licores Alquimia',
    "razonSocial" TEXT NOT NULL DEFAULT '',
    "cuit" TEXT NOT NULL DEFAULT '',
    "domicilio" TEXT NOT NULL DEFAULT '',
    "registroPupaa" TEXT NOT NULL DEFAULT '',
    "reba" TEXT NOT NULL DEFAULT ''
);

INSERT INTO "Empresa" ("id") VALUES (1);
