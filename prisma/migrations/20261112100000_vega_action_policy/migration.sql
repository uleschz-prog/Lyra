-- Fase 5: política de confirmación, vencimiento y bitácora de acciones de Vega.
-- Solo agrega columnas opcionales e índices; no borra, no renombra y no modifica datos.

ALTER TABLE "VegaAction"
    ADD COLUMN IF NOT EXISTS "riskClass" TEXT,
    ADD COLUMN IF NOT EXISTS "fingerprint" TEXT,
    ADD COLUMN IF NOT EXISTS "tainted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "executedBy" TEXT;

CREATE INDEX IF NOT EXISTS "VegaAction_userId_createdAt_idx" ON "VegaAction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "VegaAction_userId_fingerprint_idx" ON "VegaAction"("userId", "fingerprint");
