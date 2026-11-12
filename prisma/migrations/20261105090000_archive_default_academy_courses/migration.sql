UPDATE "Course"
SET "status" = 'ARCHIVED',
    "publishedAt" = NULL
WHERE "id" IN (
  'crs_lyra_ia',
  'crs_lyra_agentes',
  'crs_lyra_academia',
  'crs_lyra_contenido',
  'crs_lyra_negocio'
)
AND "creatorId" IS NULL;
