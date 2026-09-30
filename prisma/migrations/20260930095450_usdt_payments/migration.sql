-- AlterEnum
ALTER TYPE "TransactionKind" ADD VALUE 'USDT_ORDER';

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UsdtOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "trxHash" TEXT,
    "companyWallet" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "UsdtOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsdtOrder_trxHash_key" ON "UsdtOrder"("trxHash");

-- CreateIndex
CREATE INDEX "UsdtOrder_userId_createdAt_idx" ON "UsdtOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsdtOrder_status_idx" ON "UsdtOrder"("status");

-- AddForeignKey
ALTER TABLE "UsdtOrder" ADD CONSTRAINT "UsdtOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

