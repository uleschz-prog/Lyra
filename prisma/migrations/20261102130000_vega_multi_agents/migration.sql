CREATE TABLE "VegaAgent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultKey" TEXT,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '✦',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VegaAgent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VegaAgent_userId_createdAt_idx" ON "VegaAgent"("userId", "createdAt");

ALTER TABLE "VegaConversation" ADD COLUMN "agentId" TEXT;

INSERT INTO "VegaAgent" ("id", "userId", "defaultKey", "name", "specialty", "instructions", "avatar", "isDefault", "updatedAt")
SELECT
    'legacy-vega-' || md5("userId" || clock_timestamp()::text || random()::text),
    "userId",
    "userId",
    'Vega',
    'Asistente general',
    '',
    '✦',
    true,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "userId" FROM "VegaConversation") AS owners;

CREATE UNIQUE INDEX "VegaAgent_defaultKey_key" ON "VegaAgent"("defaultKey");

UPDATE "VegaConversation" AS conversation
SET "agentId" = agent."id"
FROM "VegaAgent" AS agent
WHERE agent."userId" = conversation."userId"
  AND agent."isDefault" = true;

ALTER TABLE "VegaConversation" ALTER COLUMN "agentId" SET NOT NULL;
CREATE INDEX "VegaConversation_agentId_updatedAt_idx" ON "VegaConversation"("agentId", "updatedAt");

ALTER TABLE "VegaAgent"
ADD CONSTRAINT "VegaAgent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VegaConversation"
ADD CONSTRAINT "VegaConversation_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "VegaAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
