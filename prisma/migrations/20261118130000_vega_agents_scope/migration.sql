-- Vega v2 (V3): agentes con memoria y rutinas propias. Solo agrega columnas nullable, índices y llaves foráneas.
-- Sin relleno de datos: agentId = NULL significa «agente principal» (así se leen los datos de antes de v2).
-- AlterTable
ALTER TABLE "VegaAgent" ADD COLUMN     "persona" JSONB,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateVersion" INTEGER;

-- AlterTable
ALTER TABLE "VegaMemory" ADD COLUMN     "agentId" TEXT;

-- AlterTable
ALTER TABLE "VegaFile" ADD COLUMN     "agentId" TEXT;

-- AlterTable
ALTER TABLE "VegaTask" ADD COLUMN     "agentId" TEXT;

-- CreateIndex
CREATE INDEX "VegaMemory_userId_agentId_idx" ON "VegaMemory"("userId", "agentId");

-- CreateIndex
CREATE INDEX "VegaTask_userId_agentId_idx" ON "VegaTask"("userId", "agentId");

-- AddForeignKey
ALTER TABLE "VegaMemory" ADD CONSTRAINT "VegaMemory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "VegaAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VegaFile" ADD CONSTRAINT "VegaFile_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "VegaAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VegaTask" ADD CONSTRAINT "VegaTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "VegaAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

