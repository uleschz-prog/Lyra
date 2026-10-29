ALTER TABLE "WhatsappConnection"
    ADD COLUMN IF NOT EXISTS "wabaId" TEXT,
    ADD COLUMN IF NOT EXISTS "businessId" TEXT,
    ADD COLUMN IF NOT EXISTS "displayPhoneNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "accessTokenEncrypted" TEXT,
    ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMP(3);

ALTER TABLE "WhatsappMessage"
    ADD COLUMN IF NOT EXISTS "scheduledMessageId" TEXT;

ALTER TABLE "WhatsappChat"
    ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "consentSource" TEXT;

CREATE TABLE IF NOT EXISTS "WhatsappScheduledMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "chatRowId" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "templateName" TEXT,
    "language" TEXT,
    "variables" JSONB,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "error" TEXT,
    "waMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsappScheduledMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappMessage_scheduledMessageId_key"
    ON "WhatsappMessage"("scheduledMessageId");
CREATE INDEX IF NOT EXISTS "WhatsappScheduledMessage_status_runAt_idx"
    ON "WhatsappScheduledMessage"("status", "runAt");
CREATE INDEX IF NOT EXISTS "WhatsappScheduledMessage_userId_status_runAt_idx"
    ON "WhatsappScheduledMessage"("userId", "status", "runAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsappScheduledMessage_userId_fkey') THEN
        ALTER TABLE "WhatsappScheduledMessage" ADD CONSTRAINT "WhatsappScheduledMessage_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsappScheduledMessage_connectionId_fkey') THEN
        ALTER TABLE "WhatsappScheduledMessage" ADD CONSTRAINT "WhatsappScheduledMessage_connectionId_fkey"
            FOREIGN KEY ("connectionId") REFERENCES "WhatsappConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsappScheduledMessage_chatRowId_fkey') THEN
        ALTER TABLE "WhatsappScheduledMessage" ADD CONSTRAINT "WhatsappScheduledMessage_chatRowId_fkey"
            FOREIGN KEY ("chatRowId") REFERENCES "WhatsappChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WhatsappMessage_scheduledMessageId_fkey') THEN
        ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_scheduledMessageId_fkey"
            FOREIGN KEY ("scheduledMessageId") REFERENCES "WhatsappScheduledMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
