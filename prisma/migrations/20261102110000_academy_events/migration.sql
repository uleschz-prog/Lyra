CREATE TABLE "AcademyEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "meetingUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademyEventRsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyEventRsvp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyEvent_startsAt_idx" ON "AcademyEvent"("startsAt");
CREATE INDEX "AcademyEvent_createdById_startsAt_idx" ON "AcademyEvent"("createdById", "startsAt");
CREATE UNIQUE INDEX "AcademyEventRsvp_eventId_userId_key" ON "AcademyEventRsvp"("eventId", "userId");
CREATE INDEX "AcademyEventRsvp_userId_createdAt_idx" ON "AcademyEventRsvp"("userId", "createdAt");

ALTER TABLE "AcademyEvent"
ADD CONSTRAINT "AcademyEvent_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademyEventRsvp"
ADD CONSTRAINT "AcademyEventRsvp_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "AcademyEvent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademyEventRsvp"
ADD CONSTRAINT "AcademyEventRsvp_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
