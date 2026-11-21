-- Datos en vivo (PR 5): marca las construcciones de apps con datos en vivo. Aditiva.
ALTER TABLE "ProjectBuild" ADD COLUMN "live" BOOLEAN NOT NULL DEFAULT false;
