-- PR C: generador v2 de Vega. Trabajos de construcción reanudables y archivos/vista previa en Blob.
-- Solo agrega: columnas, tabla, índices y llave nuevas con IF NOT EXISTS.

-- AlterTable
ALTER TABLE "ProjectVersion" ADD COLUMN IF NOT EXISTS "buildId" TEXT;
ALTER TABLE "ProjectVersion" ADD COLUMN IF NOT EXISTS "filesUrl" TEXT;
ALTER TABLE "ProjectVersion" ADD COLUMN IF NOT EXISTS "previewUrl" TEXT;
ALTER TABLE "ProjectVersion" ADD COLUMN IF NOT EXISTS "previewHtml" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectBuild" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "actionId" TEXT,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'new',
    "brief" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "step" TEXT NOT NULL DEFAULT 'plan',
    "plan" JSONB,
    "files" JSONB,
    "tasks" JSONB,
    "report" JSONB,
    "repairRound" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "chargeId" TEXT,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "projectId" TEXT,
    "versionNumber" INTEGER,
    "error" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectBuild_actionId_key" ON "ProjectBuild"("actionId");
CREATE INDEX IF NOT EXISTS "ProjectBuild_userId_createdAt_idx" ON "ProjectBuild"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectBuild_status_updatedAt_idx" ON "ProjectBuild"("status", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectVersion_buildId_key" ON "ProjectVersion"("buildId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectBuild_userId_fkey') THEN
    ALTER TABLE "ProjectBuild" ADD CONSTRAINT "ProjectBuild_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
