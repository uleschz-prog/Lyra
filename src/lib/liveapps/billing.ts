// Cuota mensual por app con datos en vivo. Está implementada pero apagada: con
// LIVE_APP_MONTHLY_FEE = 0 no toca la base ni cobra nada. Si Ule la enciende, el cron diario
// cobra a cada app activa cuyo periodo venció; si no hay créditos, la app se pausa (los datos
// se conservan) hasta que el dueño la reactive.
import { LIVE_APP_MONTHLY_FEE } from "@/lib/liveapps/config";
import type { LiveDb } from "@/lib/liveapps/core";

type Charge = { ok: true; chargeId: string | null } | { ok: false; error: string };
type ChargeFn = (userId: string, amount: number, description: string, key: string) => Promise<Charge>;

export function addOneMonth(date: Date) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function chargeLiveAppFees(input: { db?: LiveDb; now?: Date; fee?: number; charge?: ChargeFn; limit?: number } = {}) {
  const fee = input.fee ?? LIVE_APP_MONTHLY_FEE;
  if (!Number.isInteger(fee) || fee <= 0) return { skipped: true as const, charged: 0, paused: 0 };
  const now = input.now ?? new Date();
  const db = input.db ?? (await import("@/lib/prisma")).getPrisma();
  const charge: ChargeFn =
    input.charge ??
    (async (userId, amount, description, key) => {
      const { chargeCredits } = await import("@/lib/credits");
      return chargeCredits(userId, amount, description, key);
    });
  const due = await db.appSpace.findMany({
    where: { status: "active", OR: [{ paidUntil: null }, { paidUntil: { lte: now } }] },
    select: { id: true, userId: true, paidUntil: true, project: { select: { title: true } } },
    take: input.limit ?? 200,
  });
  let charged = 0;
  let paused = 0;
  for (const space of due) {
    const period = (space.paidUntil ?? now).toISOString().slice(0, 7);
    const result = await charge(space.userId, fee, `Datos en vivo · ${space.project.title} (${period})`, `liveapp:${space.id}:${period}`);
    if (result.ok) {
      await db.appSpace.update({ where: { id: space.id }, data: { paidUntil: addOneMonth(space.paidUntil && space.paidUntil > now ? space.paidUntil : now) } });
      charged += 1;
    } else {
      await db.appSpace.update({ where: { id: space.id }, data: { status: "paused" } });
      await db.appSession.deleteMany({ where: { spaceId: space.id } });
      paused += 1;
    }
  }
  return { skipped: false as const, charged, paused };
}
