-- Fase 1: libro de créditos. Solo agrega; no borra ni renombra nada.
ALTER TYPE "TransactionKind" ADD VALUE IF NOT EXISTS 'CREDIT_REFUND';

ALTER TABLE "Transaction"
    ADD COLUMN IF NOT EXISTS "reason" TEXT,
    ADD COLUMN IF NOT EXISTS "metadata" JSONB;
