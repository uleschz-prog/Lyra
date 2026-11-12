ALTER TABLE "MediaPiece"
ADD COLUMN "higgsfieldGenerationId" TEXT,
ADD COLUMN "higgsfieldOutputIndex" INTEGER;

ALTER TABLE "MediaPiece"
ADD CONSTRAINT "MediaPiece_higgsfieldGenerationId_fkey"
FOREIGN KEY ("higgsfieldGenerationId") REFERENCES "HiggsfieldGeneration"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MediaPiece_higgsfieldGenerationId_higgsfieldOutputIndex_key"
ON "MediaPiece"("higgsfieldGenerationId", "higgsfieldOutputIndex");
