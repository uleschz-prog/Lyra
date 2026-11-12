import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getRuntimeDatabaseUrl(databaseUrl: string, pooledDatabaseUrl = process.env.DATABASE_URL_POOLED) {
  if (pooledDatabaseUrl) return pooledDatabaseUrl;

  const parsedUrl = new URL(databaseUrl);
  if (parsedUrl.hostname !== "db.prisma.io") {
    if (parsedUrl.searchParams.has("connection_limit")) {
      parsedUrl.searchParams.set("connection_limit", "1");
    } else {
      parsedUrl.searchParams.append("connection_limit", "1");
    }
    return parsedUrl.toString();
  }

  parsedUrl.hostname = "pooled.db.prisma.io";
  return parsedUrl.toString();
}

export function getPrisma() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL no está configurada.");
  }

  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({
      connectionString: getRuntimeDatabaseUrl(databaseUrl),
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000,
    });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}
