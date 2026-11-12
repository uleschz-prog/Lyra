-- PR H: Marketplace de plantillas. Solo agrega (IF NOT EXISTS); no toca tablas existentes.
-- Las 6 plantillas oficiales se siembran de forma idempotente desde la app (INSERT ... ON CONFLICT DO NOTHING por slug).

-- CreateTable
CREATE TABLE IF NOT EXISTS "MarketplaceTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "authorId" TEXT,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectReason" TEXT,
    "generator" TEXT NOT NULL DEFAULT 'vega-v2',
    "files" JSONB NOT NULL,
    "previewHtml" TEXT,
    "agentConfig" JSONB,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "sourceProjectId" TEXT,
    "sourceVersionNumber" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MarketplacePurchase" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT,
    "price" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL,
    "sellerAmount" INTEGER NOT NULL,
    "chargeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplacePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MarketplaceEarning" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MarketplaceUse" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceTemplate_slug_key" ON "MarketplaceTemplate"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceTemplate_status_kind_createdAt_idx" ON "MarketplaceTemplate"("status", "kind", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceTemplate_authorId_createdAt_idx" ON "MarketplaceTemplate"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplacePurchase_buyerId_createdAt_idx" ON "MarketplacePurchase"("buyerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplacePurchase_templateId_buyerId_key" ON "MarketplacePurchase"("templateId", "buyerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceEarning_purchaseId_key" ON "MarketplaceEarning"("purchaseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceEarning_sellerId_status_releaseAt_idx" ON "MarketplaceEarning"("sellerId", "status", "releaseAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceEarning_status_releaseAt_idx" ON "MarketplaceEarning"("status", "releaseAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceUse_requestKey_key" ON "MarketplaceUse"("requestKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceUse_templateId_createdAt_idx" ON "MarketplaceUse"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceUse_userId_createdAt_idx" ON "MarketplaceUse"("userId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceTemplate_authorId_fkey') THEN
    ALTER TABLE "MarketplaceTemplate" ADD CONSTRAINT "MarketplaceTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketplacePurchase_templateId_fkey') THEN
    ALTER TABLE "MarketplacePurchase" ADD CONSTRAINT "MarketplacePurchase_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketplaceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketplacePurchase_buyerId_fkey') THEN
    ALTER TABLE "MarketplacePurchase" ADD CONSTRAINT "MarketplacePurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceEarning_purchaseId_fkey') THEN
    ALTER TABLE "MarketplaceEarning" ADD CONSTRAINT "MarketplaceEarning_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "MarketplacePurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceUse_templateId_fkey') THEN
    ALTER TABLE "MarketplaceUse" ADD CONSTRAINT "MarketplaceUse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketplaceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
