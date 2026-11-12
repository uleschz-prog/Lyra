CREATE TABLE "AcademyNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyNotification_userId_readAt_createdAt_idx"
ON "AcademyNotification"("userId", "readAt", "createdAt");

CREATE INDEX "AcademyNotification_actorId_createdAt_idx"
ON "AcademyNotification"("actorId", "createdAt");

ALTER TABLE "AcademyNotification"
ADD CONSTRAINT "AcademyNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademyNotification"
ADD CONSTRAINT "AcademyNotification_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
