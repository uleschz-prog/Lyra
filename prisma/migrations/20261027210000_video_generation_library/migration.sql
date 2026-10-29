CREATE TABLE IF NOT EXISTS "MediaPiece" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeUserId" TEXT,
    "area" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "media" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaPiece_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MediaPiece" ADD COLUMN IF NOT EXISTS "videoGenerationId" TEXT;
CREATE INDEX IF NOT EXISTS "MediaPiece_userId_area_createdAt_idx" ON "MediaPiece"("userId", "area", "createdAt");

CREATE TABLE IF NOT EXISTS "VideoGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "segmentCount" INTEGER NOT NULL,
    "completedSegments" INTEGER NOT NULL DEFAULT 0,
    "segmentJobIds" JSONB NOT NULL DEFAULT '[]',
    "currentJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'starting',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VideoGeneration_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VideoGeneration" ADD COLUMN IF NOT EXISTS "activeUserId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "MediaPiece_videoGenerationId_key" ON "MediaPiece"("videoGenerationId");
CREATE UNIQUE INDEX IF NOT EXISTS "VideoGeneration_chargeId_key" ON "VideoGeneration"("chargeId");
CREATE UNIQUE INDEX IF NOT EXISTS "VideoGeneration_userId_requestKey_key" ON "VideoGeneration"("userId", "requestKey");
CREATE UNIQUE INDEX IF NOT EXISTS "VideoGeneration_activeUserId_key" ON "VideoGeneration"("activeUserId");
CREATE INDEX IF NOT EXISTS "VideoGeneration_userId_status_createdAt_idx" ON "VideoGeneration"("userId", "status", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MediaPiece_userId_fkey') THEN
        ALTER TABLE "MediaPiece" ADD CONSTRAINT "MediaPiece_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VideoGeneration_userId_fkey') THEN
        ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MediaPiece_videoGenerationId_fkey') THEN
        ALTER TABLE "MediaPiece" ADD CONSTRAINT "MediaPiece_videoGenerationId_fkey"
            FOREIGN KEY ("videoGenerationId") REFERENCES "VideoGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
