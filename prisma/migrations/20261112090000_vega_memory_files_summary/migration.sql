-- Fase 4: memoria estructurada, archivos persistentes y resumen de conversaciones.
-- Solo agrega; no borra, no renombra y no modifica datos existentes.

-- Memoria: tipo de recuerdo y fecha de actualización (los recuerdos actuales quedan como "fact").
ALTER TABLE "VegaMemory"
    ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'fact',
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "VegaMemory_userId_kind_idx" ON "VegaMemory"("userId", "kind");

-- Conversaciones: resumen de los mensajes viejos.
ALTER TABLE "VegaConversation"
    ADD COLUMN IF NOT EXISTS "summary" TEXT,
    ADD COLUMN IF NOT EXISTS "summaryThrough" TIMESTAMP(3);

-- Archivos del espacio de trabajo de Vega.
CREATE TABLE IF NOT EXISTS "VegaFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VegaFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VegaFile_userId_updatedAt_idx" ON "VegaFile"("userId", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "VegaFile_userId_path_key" ON "VegaFile"("userId", "path");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaFile_userId_fkey') THEN
        ALTER TABLE "VegaFile"
            ADD CONSTRAINT "VegaFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
