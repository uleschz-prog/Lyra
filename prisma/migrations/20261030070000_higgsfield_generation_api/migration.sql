CREATE TABLE "HiggsfieldGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeUserId" TEXT,
    "requestKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestId" TEXT,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "videoParameters" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'submitting',
    "statusUrl" TEXT,
    "webhookToken" TEXT NOT NULL,
    "sourceUrls" JSONB NOT NULL DEFAULT '[]',
    "storedUrls" JSONB NOT NULL DEFAULT '[]',
    "chargeId" TEXT,
    "quotaCycleId" TEXT,
    "quotaReservedSeconds" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HiggsfieldGeneration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HiggsfieldGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HiggsfieldGeneration_activeUserId_key" ON "HiggsfieldGeneration"("activeUserId");
CREATE UNIQUE INDEX "HiggsfieldGeneration_requestId_key" ON "HiggsfieldGeneration"("requestId");
CREATE UNIQUE INDEX "HiggsfieldGeneration_userId_requestKey_key" ON "HiggsfieldGeneration"("userId", "requestKey");
CREATE INDEX "HiggsfieldGeneration_userId_status_createdAt_idx" ON "HiggsfieldGeneration"("userId", "status", "createdAt");
