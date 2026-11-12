import { Client } from "pg";
import { spawnSync } from "node:child_process";

const baseline = "20260901000000_existing_production_baseline";
const priorMigrations = ["20260930095450_usdt_payments", "20261007143000_polygon_wallet"];

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping production database baseline outside a production build.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to prepare the production migration baseline.");
}

function resolveMigration(name) {
  const result = spawnSync("npx", ["prisma", "migrate", "resolve", "--applied", name], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not record migration ${name} as applied.`);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const { rows: tables } = await client.query(`
    SELECT
      to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_migration_table,
      to_regclass('public."User"') IS NOT NULL AS has_users,
      to_regclass('public."AppSetting"') IS NOT NULL AS has_app_settings,
      to_regclass('public."UsdtOrder"') IS NOT NULL AS has_usdt_orders
  `);
  const existing = tables[0];
  if (!existing.has_users && !existing.has_app_settings && !existing.has_usdt_orders) {
    throw new Error("Production database is empty; refusing to baseline an unexpected database.");
  }
  if (!existing.has_users || !existing.has_app_settings || !existing.has_usdt_orders) {
    throw new Error("Production schema does not match the expected existing LYRA tables; refusing to baseline.");
  }

  const { rows: enumRows } = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'TransactionKind' AND e.enumlabel = 'USDT_ORDER'
    ) AS has_usdt_order_kind
  `);
  if (!enumRows[0].has_usdt_order_kind) {
    throw new Error("Production schema is missing the USDT_ORDER transaction kind; refusing to baseline.");
  }

  let appliedNames = new Set();
  if (existing.has_migration_table) {
    const { rows } = await client.query(`
      SELECT migration_name
      FROM public."_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `);
    appliedNames = new Set(rows.map((row) => row.migration_name));
  }

  if (!appliedNames.has(baseline)) {
    if (appliedNames.size > 0) {
      throw new Error("Production has a partial Prisma migration history; refusing to create a new baseline.");
    }
    resolveMigration(baseline);
    appliedNames.add(baseline);
    console.log("Recorded the existing production schema baseline.");
  }

  for (const migration of priorMigrations) {
    if (appliedNames.has(migration)) continue;
    resolveMigration(migration);
    console.log(`Recorded existing schema migration ${migration}.`);
  }
} finally {
  await client.end();
}
