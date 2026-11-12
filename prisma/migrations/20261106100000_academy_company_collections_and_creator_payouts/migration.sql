CREATE TYPE "AcademyCreatorPayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

ALTER TABLE "AcademyTransaction"
    ALTER COLUMN "creatorAccountId" DROP NOT NULL,
    ADD COLUMN "creatorPayoutStatus" "AcademyCreatorPayoutStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "creatorPaidAt" TIMESTAMP(3),
    ADD COLUMN "creatorPayoutReference" TEXT;

ALTER TABLE "AcademyTransaction"
    DROP CONSTRAINT "AcademyTransaction_creatorAccountId_fkey";

ALTER TABLE "AcademyTransaction"
    ADD CONSTRAINT "AcademyTransaction_creatorAccountId_fkey"
    FOREIGN KEY ("creatorAccountId") REFERENCES "CreatorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "AcademyTransaction"
SET "creatorPayoutStatus" = 'PAID',
    "creatorPaidAt" = "paidAt"
WHERE "creatorAccountId" IS NOT NULL
  AND "paymentGatewayStatus" = 'APPROVED';

CREATE INDEX "AcademyTransaction_paymentGatewayStatus_creatorPayoutStatus_paidAt_idx"
    ON "AcademyTransaction"("paymentGatewayStatus", "creatorPayoutStatus", "paidAt");
