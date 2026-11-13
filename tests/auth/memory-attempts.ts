import type { AuthAttemptDb } from "@/lib/auth/rate-limit";

type Row = { action: string; keyHash: string; createdAt: Date };

/** Tabla AuthAttempt en memoria con las mismas consultas que usa el limitador. */
export function memoryAttempts() {
  const rows: Row[] = [];
  const db: AuthAttemptDb = {
    authAttempt: {
      async count({ where }) {
        return rows.filter((row) => row.keyHash === where.keyHash && row.createdAt >= where.createdAt.gte).length;
      },
      async findFirst({ where }) {
        const found = rows
          .filter((row) => row.keyHash === where.keyHash && row.createdAt >= where.createdAt.gte)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
        return found ? { createdAt: found.createdAt } : null;
      },
      async createMany({ data }) {
        rows.push(...data.map((row) => ({ ...row })));
        return { count: data.length };
      },
      async deleteMany({ where }) {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i];
          const byKey = where.keyHash ? where.keyHash.in.includes(row.keyHash) : true;
          const byDate = where.createdAt ? row.createdAt < where.createdAt.lt : true;
          if (byKey && byDate) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      },
    },
  };
  return { db, rows };
}
