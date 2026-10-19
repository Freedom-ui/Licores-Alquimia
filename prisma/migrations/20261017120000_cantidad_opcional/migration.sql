-- Fase 6: una orden que todavía macera puede no tener la cantidad de botellas
-- (se sabe al embotellar). La regla la exige solo con fecha de embotellado.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrdenProduccion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "fechaMaceracion" TEXT NOT NULL,
    "fechaEmbotellado" TEXT,
    "responsable" TEXT NOT NULL,
    "cantidadProducida" REAL,
    "costoTotal" REAL NOT NULL,
    CONSTRAINT "OrdenProduccion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrdenProduccion" ("costoTotal", "cantidadProducida", "fechaEmbotellado", "fechaMaceracion", "id", "productoId", "responsable") SELECT "costoTotal", "cantidadProducida", "fechaEmbotellado", "fechaMaceracion", "id", "productoId", "responsable" FROM "OrdenProduccion";
DROP TABLE "OrdenProduccion";
ALTER TABLE "new_OrdenProduccion" RENAME TO "OrdenProduccion";
CREATE INDEX "OrdenProduccion_fechaMaceracion_idx" ON "OrdenProduccion"("fechaMaceracion");
CREATE INDEX "OrdenProduccion_productoId_idx" ON "OrdenProduccion"("productoId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
