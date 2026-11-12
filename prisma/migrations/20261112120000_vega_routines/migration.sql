-- Fase 6: rutinas de Vega a hora exacta y en segundo plano.
-- Solo agrega: columnas nuevas con default, una tabla nueva, índices y llaves foráneas.

ALTER TABLE "VegaTask" ADD COLUMN IF NOT EXISTS "schedule" TEXT;
ALTER TABLE "VegaTask" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City';
ALTER TABLE "VegaTask" ADD COLUMN IF NOT EXISTS "runCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VegaTask" ADD COLUMN IF NOT EXISTS "failCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "VegaRoutineRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "conversationId" TEXT,
    "result" TEXT,
    "actionIds" JSONB,
    "usage" JSONB,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VegaRoutineRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VegaRoutineRun_taskId_scheduledFor_key" ON "VegaRoutineRun"("taskId", "scheduledFor");
CREATE INDEX IF NOT EXISTS "VegaRoutineRun_status_scheduledFor_idx" ON "VegaRoutineRun"("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "VegaRoutineRun_userId_createdAt_idx" ON "VegaRoutineRun"("userId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaRoutineRun_taskId_fkey') THEN
        ALTER TABLE "VegaRoutineRun" ADD CONSTRAINT "VegaRoutineRun_taskId_fkey"
            FOREIGN KEY ("taskId") REFERENCES "VegaTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaRoutineRun_userId_fkey') THEN
        ALTER TABLE "VegaRoutineRun" ADD CONSTRAINT "VegaRoutineRun_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
