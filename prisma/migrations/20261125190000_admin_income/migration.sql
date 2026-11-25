-- Ingresos de la empresa (2026-11-25): dos tablas nuevas. Aditiva: no borra ni cambia tablas o columnas existentes.
-- CreateTable
CREATE TABLE "AdminIncomeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amount" DECIMAL(12,2) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminIncomeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminIncomeEdit" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "transactionId" TEXT,
    "entryId" TEXT,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "previousAmount" DECIMAL(12,2) NOT NULL,
    "newAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedByName" TEXT NOT NULL,
    "editedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminIncomeEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminIncomeEntry_receivedAt_idx" ON "AdminIncomeEntry"("receivedAt");

-- CreateIndex
CREATE INDEX "AdminIncomeEntry_userId_receivedAt_idx" ON "AdminIncomeEntry"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "AdminIncomeEdit_transactionId_createdAt_idx" ON "AdminIncomeEdit"("transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminIncomeEdit_entryId_createdAt_idx" ON "AdminIncomeEdit"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminIncomeEdit_createdAt_idx" ON "AdminIncomeEdit"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminIncomeEntry" ADD CONSTRAINT "AdminIncomeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

