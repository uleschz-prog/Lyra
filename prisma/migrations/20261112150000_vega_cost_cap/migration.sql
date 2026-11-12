-- Fase 7: tope mensual de costo de IA de Vega por socio.
-- Solo agrega: una tabla nueva, sus índices y su llave foránea.

CREATE TABLE IF NOT EXISTS "VegaUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'chat',
    "month" TEXT NOT NULL,
    "models" JSONB,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costSource" TEXT NOT NULL DEFAULT 'table',
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VegaUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VegaUsageLog_userId_month_idx" ON "VegaUsageLog"("userId", "month");
CREATE INDEX IF NOT EXISTS "VegaUsageLog_month_idx" ON "VegaUsageLog"("month");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaUsageLog_userId_fkey') THEN
        ALTER TABLE "VegaUsageLog" ADD CONSTRAINT "VegaUsageLog_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
