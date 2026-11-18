-- Entrega 3: contactos de sitios publicados. Solo crea una tabla nueva, sus índices y su llave foránea.
-- CreateTable
CREATE TABLE "ProjectLead" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "versionNumber" INTEGER,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "fields" JSONB NOT NULL,
    "page" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectLead_projectId_createdAt_idx" ON "ProjectLead"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectLead_userId_read_createdAt_idx" ON "ProjectLead"("userId", "read", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectLead" ADD CONSTRAINT "ProjectLead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
