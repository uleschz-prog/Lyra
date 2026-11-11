import { describe, expect, it } from "vitest";

import { getRuntimeDatabaseUrl } from "@/lib/prisma";

describe("getRuntimeDatabaseUrl", () => {
  it("uses the pooled Prisma Postgres host for runtime queries", () => {
    expect(
      getRuntimeDatabaseUrl("postgresql://prisma_migration:secret@db.prisma.io:5432/postgres?sslmode=require", ""),
    ).toBe("postgresql://prisma_migration:secret@pooled.db.prisma.io:5432/postgres?sslmode=require");
  });

  it("prefers an explicitly configured pooled URL", () => {
    expect(
      getRuntimeDatabaseUrl(
        "postgresql://migration:secret@db.prisma.io:5432/postgres",
        "postgresql://runtime:secret@pooled.db.prisma.io:5432/postgres",
      ),
    ).toBe("postgresql://runtime:secret@pooled.db.prisma.io:5432/postgres");
  });

  it("leaves non-Prisma Postgres hosts unchanged", () => {
    const databaseUrl = "postgresql://app:secret@db.example.com:5432/app";
    expect(getRuntimeDatabaseUrl(databaseUrl, "")).toBe(
      "postgresql://app:secret@db.example.com:5432/app?connection_limit=1",
    );
  });

  it("limits the fallback non-pooled Prisma host to one connection", () => {
    expect(
      getRuntimeDatabaseUrl(
        "postgresql://app:secret@db.example.com:5432/app?sslmode=require&connection_limit=20",
        "",
      ),
    ).toBe("postgresql://app:secret@db.example.com:5432/app?sslmode=require&connection_limit=1");
  });
});
