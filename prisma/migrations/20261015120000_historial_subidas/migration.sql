-- Fase 5: historial de subidas de planillas en "Importar planilla".

-- CreateTable
CREATE TABLE "SubidaPlanilla" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada" DATETIME NOT NULL,
    "usuario" TEXT NOT NULL,
    "archivo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "agregados" INTEGER NOT NULL DEFAULT 0,
    "existentes" INTEGER NOT NULL DEFAULT 0,
    "conError" INTEGER NOT NULL DEFAULT 0,
    "avisos" INTEGER NOT NULL DEFAULT 0,
    "respaldo" TEXT,
    "error" TEXT,
    "detalle" TEXT NOT NULL DEFAULT '{}'
);

-- CreateIndex
CREATE INDEX "SubidaPlanilla_fecha_idx" ON "SubidaPlanilla"("fecha");
