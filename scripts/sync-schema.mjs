import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";

if (!url.startsWith("postgres")) {
  console.log("Sin base de datos en este entorno; se omite la sincronización del esquema.");
  process.exit(0);
}

const prepare = spawnSync(
  "npx",
  ["prisma", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"],
  {
    input: `ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_externalRef_key" ON "Transaction"("externalRef");`,
    stdio: ["pipe", "inherit", "inherit"],
  },
);

if ((prepare.status ?? 1) !== 0) {
  process.exit(prepare.status ?? 1);
}

const result = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
});

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

const rename = spawnSync(
  "npx",
  ["prisma", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"],
  {
    input: `UPDATE "User" SET name = 'LyraMaster' WHERE username = 'lyra-root' OR email = 'admin@lyrahub.ai';
UPDATE "User" SET package = 'CORPORATE', "pendingPackage" = NULL, "activationCredits" = 5000
WHERE (username = 'lyra-root' OR email = 'admin@lyrahub.ai') AND package <> 'CORPORATE';
DO $$
DECLARE root_id TEXT;
BEGIN
  SELECT id INTO root_id FROM "User" WHERE username = 'lyra-root' OR email = 'admin@lyrahub.ai' ORDER BY "createdAt" LIMIT 1;
  IF root_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM "Transaction" WHERE "userId" = root_id AND description = 'Limpieza inicial de registros 2026-09') THEN RETURN; END IF;
  DELETE FROM "User" WHERE id <> root_id;
  DELETE FROM "Transaction" WHERE "userId" = root_id AND kind = 'COMMISSION';
  UPDATE "User" SET "walletBalance" = 0 WHERE id = root_id;
  INSERT INTO "CreditWallet" (id, "userId", balance, "totalEarnedCommissions", "updatedAt")
  SELECT gen_random_uuid()::text, root_id, 0, 0, now()
  WHERE NOT EXISTS (SELECT 1 FROM "CreditWallet" WHERE "userId" = root_id);
  UPDATE "CreditWallet" SET "totalEarnedCommissions" = 0 WHERE "userId" = root_id;
  INSERT INTO "Transaction" (id, "userId", "walletId", amount, "creditDelta", kind, description, "createdAt")
  SELECT gen_random_uuid()::text, root_id, w.id, 0, 0, 'ADJUSTMENT', 'Limpieza inicial de registros 2026-09', now()
  FROM "CreditWallet" w WHERE w."userId" = root_id;
END $$;`,
    stdio: ["pipe", "inherit", "inherit"],
  },
);

process.exit(rename.status ?? 1);
