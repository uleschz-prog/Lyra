-- PR B: proyectos de Vega (sitios, apps y agentes) con versiones y un stub de publicación.
-- Solo agrega: tablas, índices y llaves nuevas con IF NOT EXISTS.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "conversationId" TEXT,
    "versionCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "suggestions" JSONB,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "generator" TEXT NOT NULL DEFAULT 'vega-v1',
    "sourceActionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectPublish" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "versionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPublish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_userId_deletedAt_updatedAt_idx" ON "Project"("userId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_userId_groupKey_idx" ON "Project"("userId", "groupKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectVersion_sourceActionId_key" ON "ProjectVersion"("sourceActionId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectVersion_projectId_number_key" ON "ProjectVersion"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectPublish_projectId_key" ON "ProjectPublish"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectPublish_slug_key" ON "ProjectPublish"("slug");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_userId_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectVersion_projectId_fkey') THEN
    ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectPublish_projectId_fkey') THEN
    ALTER TABLE "ProjectPublish" ADD CONSTRAINT "ProjectPublish_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
