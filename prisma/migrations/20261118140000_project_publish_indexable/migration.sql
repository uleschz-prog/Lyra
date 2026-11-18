-- Entrega 2: publicación pública en /s/[slug]. Solo agrega una columna con valor por defecto.
-- AlterTable
ALTER TABLE "ProjectPublish" ADD COLUMN     "indexable" BOOLEAN NOT NULL DEFAULT false;
