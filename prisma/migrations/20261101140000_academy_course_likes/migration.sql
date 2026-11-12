CREATE TABLE "AcademyCourseLike" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyCourseLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademyCourseLike_courseId_userId_key"
ON "AcademyCourseLike"("courseId", "userId");

CREATE INDEX "AcademyCourseLike_courseId_createdAt_idx"
ON "AcademyCourseLike"("courseId", "createdAt");

CREATE INDEX "AcademyCourseLike_userId_createdAt_idx"
ON "AcademyCourseLike"("userId", "createdAt");

ALTER TABLE "AcademyCourseLike"
ADD CONSTRAINT "AcademyCourseLike_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademyCourseLike"
ADD CONSTRAINT "AcademyCourseLike_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
