CREATE TABLE "AcademyPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademyPostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyPostComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademyPostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyPostLike_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyPost_createdAt_idx" ON "AcademyPost"("createdAt");
CREATE INDEX "AcademyPost_userId_createdAt_idx" ON "AcademyPost"("userId", "createdAt");
CREATE INDEX "AcademyPostComment_postId_createdAt_idx" ON "AcademyPostComment"("postId", "createdAt");
CREATE INDEX "AcademyPostComment_userId_createdAt_idx" ON "AcademyPostComment"("userId", "createdAt");
CREATE UNIQUE INDEX "AcademyPostLike_postId_userId_key" ON "AcademyPostLike"("postId", "userId");
CREATE INDEX "AcademyPostLike_postId_createdAt_idx" ON "AcademyPostLike"("postId", "createdAt");
CREATE INDEX "AcademyPostLike_userId_createdAt_idx" ON "AcademyPostLike"("userId", "createdAt");

ALTER TABLE "AcademyPost"
ADD CONSTRAINT "AcademyPost_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademyPostComment"
ADD CONSTRAINT "AcademyPostComment_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "AcademyPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademyPostComment"
ADD CONSTRAINT "AcademyPostComment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademyPostLike"
ADD CONSTRAINT "AcademyPostLike_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "AcademyPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademyPostLike"
ADD CONSTRAINT "AcademyPostLike_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
