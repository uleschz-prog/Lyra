-- Imágenes de Vega (2026-11-25): tabla nueva. Aditiva: no borra ni cambia tablas o columnas existentes.
CREATE TABLE "VegaImageGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "actionId" TEXT,
    "prompt" TEXT NOT NULL,
    "exactText" TEXT,
    "aspectRatio" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "servedModel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorKind" TEXT,
    "error" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "chargeId" TEXT,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "blobUrl" TEXT,
    "mediaType" TEXT,
    "bytes" INTEGER,
    "referenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textCheck" JSONB,
    "lockedUntil" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VegaImageGeneration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VegaImageGeneration_actionId_key" ON "VegaImageGeneration"("actionId");
CREATE INDEX "VegaImageGeneration_userId_createdAt_idx" ON "VegaImageGeneration"("userId", "createdAt");
CREATE INDEX "VegaImageGeneration_status_updatedAt_idx" ON "VegaImageGeneration"("status", "updatedAt");
CREATE INDEX "VegaImageGeneration_createdAt_idx" ON "VegaImageGeneration"("createdAt");

ALTER TABLE "VegaImageGeneration" ADD CONSTRAINT "VegaImageGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
