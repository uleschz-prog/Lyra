-- Fase 8: inteligencia de mercado en X para Vega.
-- Solo agrega: tres tablas nuevas, sus índices y llaves foráneas (todo idempotente).
CREATE TABLE IF NOT EXISTS "VegaXMonitor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "handles" JSONB NOT NULL,
    "lang" TEXT,
    "sinceId" TEXT,
    "baseline" DOUBLE PRECISION,
    "lastNegativity" DOUBLE PRECISION,
    "lastAlertAt" TIMESTAMP(3),
    "lastAlertNegativity" DOUBLE PRECISION,
    "polls" INTEGER NOT NULL DEFAULT 0,
    "alerts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VegaXMonitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VegaXCache" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VegaXCache_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "VegaXCall" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "posts" INTEGER NOT NULL DEFAULT 0,
    "users" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 1,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VegaXCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VegaXMonitor_taskId_key" ON "VegaXMonitor"("taskId");

CREATE INDEX IF NOT EXISTS "VegaXMonitor_userId_idx" ON "VegaXMonitor"("userId");

CREATE INDEX IF NOT EXISTS "VegaXCache_expiresAt_idx" ON "VegaXCache"("expiresAt");

CREATE INDEX IF NOT EXISTS "VegaXCall_userId_day_idx" ON "VegaXCall"("userId", "day");

CREATE INDEX IF NOT EXISTS "VegaXCall_day_idx" ON "VegaXCall"("day");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaXMonitor_userId_fkey') THEN
        ALTER TABLE "VegaXMonitor" ADD CONSTRAINT "VegaXMonitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaXMonitor_taskId_fkey') THEN
        ALTER TABLE "VegaXMonitor" ADD CONSTRAINT "VegaXMonitor_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "VegaTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaXCall_userId_fkey') THEN
        ALTER TABLE "VegaXCall" ADD CONSTRAINT "VegaXCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
