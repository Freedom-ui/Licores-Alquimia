-- Modelo completo de la app (Fase 2): reemplaza las tablas del boceto inicial
-- (Lote, Venta, MovimientoStock y las versiones viejas de Cliente/Producto, que
-- no se usaban) por las de cada sección. Usuario no cambia. No se copian datos
-- de Cliente/Producto: el modelo viejo no es compatible y solo tenía pruebas.

-- DropIndex
DROP INDEX "Lote_numero_key";

-- DropIndex
DROP INDEX "Venta_numero_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Lote";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MovimientoStock";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Venta";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "razonSocial" TEXT NOT NULL,
    "contacto" TEXT NOT NULL DEFAULT '',
    "producto" TEXT NOT NULL DEFAULT '',
    "cuitCuil" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "telefono" TEXT NOT NULL DEFAULT '',
    "cbu" TEXT,
    "alias" TEXT
);

-- CreateTable
CREATE TABLE "MateriaPrima" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Operacion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fecha" TEXT NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "vendedor" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "canal" TEXT NOT NULL,
    "condicion" TEXT NOT NULL,
    "pu" REAL NOT NULL,
    "subTotal" REAL NOT NULL,
    CONSTRAINT "Operacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Operacion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fecha" TEXT NOT NULL,
    "materiaPrimaId" INTEGER NOT NULL,
    "cantidad" REAL NOT NULL,
    "costoUnitario" REAL NOT NULL,
    "cantidadCascara" REAL,
    "lote" TEXT NOT NULL DEFAULT '',
    "proveedorId" INTEGER NOT NULL,
    "comprobanteForm" TEXT NOT NULL DEFAULT '',
    "comprobanteTipo" TEXT NOT NULL DEFAULT '',
    "comprobanteNumero" TEXT NOT NULL DEFAULT '',
    "medioPago" TEXT NOT NULL,
    CONSTRAINT "Compra_materiaPrimaId_fkey" FOREIGN KEY ("materiaPrimaId") REFERENCES "MateriaPrima" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Compra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdenProduccion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "fechaMaceracion" TEXT NOT NULL,
    "fechaEmbotellado" TEXT,
    "responsable" TEXT NOT NULL,
    "cantidadProducida" REAL NOT NULL,
    "costoTotal" REAL NOT NULL,
    CONSTRAINT "OrdenProduccion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdenInsumo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ordenId" INTEGER NOT NULL,
    "posicion" INTEGER NOT NULL,
    "materiaPrima" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "costoUnitario" REAL NOT NULL,
    "compraId" INTEGER,
    CONSTRAINT "OrdenInsumo_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenProduccion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrdenInsumo_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoteTerminado" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lote" INTEGER NOT NULL,
    "productoId" INTEGER,
    "producto" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "existenciaInicial" REAL NOT NULL,
    "costoUnitario" REAL NOT NULL,
    "fechaVencimiento" TEXT,
    "origenOrdenId" INTEGER,
    CONSTRAINT "LoteTerminado_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimientoLote" (
    "loteId" INTEGER NOT NULL,
    "id" INTEGER NOT NULL,
    "fecha" TEXT,
    "tipo" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "puEntrada" REAL,
    "cantidadSecundaria" REAL,
    "origenOperacionId" INTEGER,
    "origenOrdenId" INTEGER,
    "origenCompraId" INTEGER,

    PRIMARY KEY ("loteId", "id"),
    CONSTRAINT "MovimientoLote_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteTerminado" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventarioMateriaPrima" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materiaPrimaId" INTEGER NOT NULL,
    "existenciaInicial" REAL NOT NULL,
    "costoUnitario" REAL NOT NULL,
    CONSTRAINT "InventarioMateriaPrima_materiaPrimaId_fkey" FOREIGN KEY ("materiaPrimaId") REFERENCES "MateriaPrima" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "inventarioId" INTEGER NOT NULL,
    "id" INTEGER NOT NULL,
    "fecha" TEXT,
    "tipo" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "puEntrada" REAL,
    "cantidadSecundaria" REAL,
    "origenOperacionId" INTEGER,
    "origenOrdenId" INTEGER,
    "origenCompraId" INTEGER,

    PRIMARY KEY ("inventarioId", "id"),
    CONSTRAINT "MovimientoInventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioMateriaPrima" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "razonSocial" TEXT NOT NULL,
    "apellidoNombre" TEXT NOT NULL DEFAULT '',
    "condicionIva" TEXT NOT NULL DEFAULT '',
    "cuit" TEXT NOT NULL DEFAULT '',
    "telefono" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "domicilio" TEXT NOT NULL DEFAULT '',
    "precioTradicional" REAL NOT NULL DEFAULT 0,
    "precioPremium" REAL
);
DROP TABLE "Cliente";
ALTER TABLE "new_Cliente" RENAME TO "Cliente";
CREATE TABLE "new_Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "codigoBarras" TEXT NOT NULL DEFAULT '',
    "precioUnitario" REAL NOT NULL DEFAULT 0
);
DROP TABLE "Producto";
ALTER TABLE "new_Producto" RENAME TO "Producto";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Operacion_fecha_idx" ON "Operacion"("fecha");

-- CreateIndex
CREATE INDEX "Operacion_clienteId_idx" ON "Operacion"("clienteId");

-- CreateIndex
CREATE INDEX "Operacion_productoId_idx" ON "Operacion"("productoId");

-- CreateIndex
CREATE INDEX "Compra_fecha_idx" ON "Compra"("fecha");

-- CreateIndex
CREATE INDEX "Compra_materiaPrimaId_idx" ON "Compra"("materiaPrimaId");

-- CreateIndex
CREATE INDEX "Compra_proveedorId_idx" ON "Compra"("proveedorId");

-- CreateIndex
CREATE INDEX "OrdenProduccion_fechaMaceracion_idx" ON "OrdenProduccion"("fechaMaceracion");

-- CreateIndex
CREATE INDEX "OrdenProduccion_productoId_idx" ON "OrdenProduccion"("productoId");

-- CreateIndex
CREATE INDEX "OrdenInsumo_ordenId_idx" ON "OrdenInsumo"("ordenId");

-- CreateIndex
CREATE INDEX "OrdenInsumo_compraId_idx" ON "OrdenInsumo"("compraId");

-- CreateIndex
CREATE INDEX "LoteTerminado_productoId_idx" ON "LoteTerminado"("productoId");

-- CreateIndex
CREATE INDEX "LoteTerminado_origenOrdenId_idx" ON "LoteTerminado"("origenOrdenId");

-- CreateIndex
CREATE INDEX "MovimientoLote_origenOperacionId_idx" ON "MovimientoLote"("origenOperacionId");

-- CreateIndex
CREATE INDEX "InventarioMateriaPrima_materiaPrimaId_idx" ON "InventarioMateriaPrima"("materiaPrimaId");

-- CreateIndex
CREATE INDEX "MovimientoInventario_origenCompraId_idx" ON "MovimientoInventario"("origenCompraId");

-- CreateIndex
CREATE INDEX "MovimientoInventario_origenOrdenId_idx" ON "MovimientoInventario"("origenOrdenId");

