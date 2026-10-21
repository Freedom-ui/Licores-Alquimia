-- Fase 8: materias primas que se compran frescas para cada orden (cítricos y
-- hierbas). No tienen stock de reposición, así que no disparan la alerta de
-- "no alcanza para otra orden".
ALTER TABLE "MateriaPrima" ADD COLUMN "compraPorOrden" BOOLEAN NOT NULL DEFAULT false;

UPDATE "MateriaPrima" SET "compraPorOrden" = true WHERE "nombre" IN ('Limón', 'Naranja', 'Pomelo', 'Menta', 'Jengibre');
