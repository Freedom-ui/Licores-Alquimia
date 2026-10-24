-- Fase 9: línea de cada producto, para sugerir el precio del cliente en una
-- venta mayorista. "Lista" = siempre el precio de lista (el bidón de 5000 cc:
-- el precio tradicional del cliente es por botella de 500 cc).
ALTER TABLE "Producto" ADD COLUMN "linea" TEXT NOT NULL DEFAULT 'Tradicional';

UPDATE "Producto" SET "linea" = 'Premium' WHERE "formato" LIKE '%Premium%' OR "formato" LIKE '750%';
UPDATE "Producto" SET "linea" = 'Lista' WHERE "formato" LIKE '5000%';
