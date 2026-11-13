-- Límite de intentos de acceso (login, registro, OAuth). Solo agrega.
CREATE TABLE IF NOT EXISTS "AuthAttempt" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuthAttempt_keyHash_createdAt_idx" ON "AuthAttempt"("keyHash", "createdAt");

CREATE INDEX IF NOT EXISTS "AuthAttempt_createdAt_idx" ON "AuthAttempt"("createdAt");
