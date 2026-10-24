-- Fase 9: pagos a proveedores, un pago por compra (null = pendiente). Las
-- compras que ya estaban cargadas quedan pagadas en su fecha.
ALTER TABLE "Compra" ADD COLUMN "fechaPago" TEXT;

UPDATE "Compra" SET "fechaPago" = "fecha";
