-- Vega v2 (V2): trabajos en segundo plano. Solo agrega una tabla nueva; no toca datos existentes.
-- CreateTable
CREATE TABLE "VegaJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "agentId" TEXT,
    "actionId" TEXT,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "steps" JSONB NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "lockedUntil" TIMESTAMP(3),
    "result" TEXT,
    "error" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VegaJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VegaJob_actionId_key" ON "VegaJob"("actionId");

-- CreateIndex
CREATE INDEX "VegaJob_userId_status_idx" ON "VegaJob"("userId", "status");

-- CreateIndex
CREATE INDEX "VegaJob_status_updatedAt_idx" ON "VegaJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "VegaJob_conversationId_createdAt_idx" ON "VegaJob"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "VegaJob" ADD CONSTRAINT "VegaJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VegaJob" ADD CONSTRAINT "VegaJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "VegaConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VegaJob" ADD CONSTRAINT "VegaJob_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "VegaAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

