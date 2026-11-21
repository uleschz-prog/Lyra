-- Datos en vivo de apps publicadas (PR 2). Solo crea tablas nuevas (AppSpace, AppMember, AppSession,
-- AppRecord, AppUsage), sus índices y llaves foráneas. No modifica tablas existentes.
-- CreateTable
CREATE TABLE "AppSpace" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "schema" JSONB NOT NULL,
    "branches" JSONB NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "paidUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppMember" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "branchId" TEXT,
    "pinDigest" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppRecord" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "rid" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "branchId" TEXT,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "seq" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUsage" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "writes" INTEGER NOT NULL DEFAULT 0,
    "logins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AppUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSpace_projectId_key" ON "AppSpace"("projectId");

-- CreateIndex
CREATE INDEX "AppSpace_userId_idx" ON "AppSpace"("userId");

-- CreateIndex
CREATE INDEX "AppMember_spaceId_active_idx" ON "AppMember"("spaceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AppMember_spaceId_pinDigest_key" ON "AppMember"("spaceId", "pinDigest");

-- CreateIndex
CREATE UNIQUE INDEX "AppSession_tokenHash_key" ON "AppSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AppSession_memberId_idx" ON "AppSession"("memberId");

-- CreateIndex
CREATE INDEX "AppSession_spaceId_expiresAt_idx" ON "AppSession"("spaceId", "expiresAt");

-- CreateIndex
CREATE INDEX "AppRecord_spaceId_seq_idx" ON "AppRecord"("spaceId", "seq");

-- CreateIndex
CREATE INDEX "AppRecord_spaceId_collection_deleted_idx" ON "AppRecord"("spaceId", "collection", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "AppRecord_spaceId_rid_key" ON "AppRecord"("spaceId", "rid");

-- CreateIndex
CREATE UNIQUE INDEX "AppUsage_spaceId_day_key" ON "AppUsage"("spaceId", "day");

-- AddForeignKey
ALTER TABLE "AppSpace" ADD CONSTRAINT "AppSpace_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppMember" ADD CONSTRAINT "AppMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "AppSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "AppSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "AppMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRecord" ADD CONSTRAINT "AppRecord_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "AppSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUsage" ADD CONSTRAINT "AppUsage_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "AppSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

