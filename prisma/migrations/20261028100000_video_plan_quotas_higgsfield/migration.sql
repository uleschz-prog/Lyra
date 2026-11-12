ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "videoQuotaSeconds" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "videoQuotaExpiresAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "videoQuotaCycleId" TEXT;

UPDATE "User"
SET
    "videoQuotaSeconds" = CASE
        WHEN "package" IN ('STARTED', 'FREE', 'VEGA', 'VEGA_PARTNER') THEN 40
        WHEN "package" IN ('PRO', 'POLARIS') THEN 140
        WHEN "package" IN ('FOUNDER', 'LYRA_MASTER', 'CORPORATE') THEN 360
        ELSE 0
    END,
    "videoQuotaExpiresAt" = CASE
        WHEN "package" = 'NONE' THEN NULL
        ELSE CURRENT_TIMESTAMP + INTERVAL '30 days'
    END,
    "videoQuotaCycleId" = CASE
        WHEN "package" = 'NONE' THEN NULL
        ELSE md5("id" || random()::text || clock_timestamp()::text)
    END
WHERE "videoQuotaCycleId" IS NULL;

ALTER TABLE "VideoGeneration"
    ALTER COLUMN "chargeId" DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'openrouter',
    ADD COLUMN IF NOT EXISTS "model" TEXT NOT NULL DEFAULT 'x-ai/grok-imagine-video-1.5-lite',
    ADD COLUMN IF NOT EXISTS "quotaReservedSeconds" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "segmentDurations" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS "segmentStatusUrls" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS "segmentVideoUrls" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS "currentStatusUrl" TEXT,
    ADD COLUMN IF NOT EXISTS "quotaCycleId" TEXT;
