import type { Prisma, PrismaClient } from "@prisma/client";

import { compensationPlan } from "@/config/compensation-plan";

type Db = Prisma.TransactionClient | PrismaClient;

export function sponsorMoveBlock(input: {
  userId: string;
  currentSponsorId: string | null;
  nextSponsorId: string;
  downlineIds: ReadonlySet<string>;
}) {
  if (input.nextSponsorId === input.userId) return "Una cuenta no puede patrocinarse a sí misma.";
  if (input.nextSponsorId === input.currentSponsorId) return "Esa cuenta ya está bajo ese patrocinador.";
  if (input.downlineIds.has(input.nextSponsorId)) return "No puedes poner a alguien debajo de su propio equipo.";
  return null;
}

export async function collectDownline(db: Db, rootId: string) {
  const ids: string[] = [];
  const seen = new Set([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await db.user.findMany({
      where: { sponsorId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      ids.push(child.id);
      frontier.push(child.id);
    }
  }
  return ids;
}

export async function rebuildUpline(tx: Prisma.TransactionClient, userId: string) {
  const links: { userId: string; ancestorId: string; depth: number }[] = [];
  const seen = new Set([userId]);
  let cursor = (await tx.user.findUnique({ where: { id: userId }, select: { sponsorId: true } }))?.sponsorId ?? null;
  while (cursor && links.length < compensationPlan.unilevel.length && !seen.has(cursor)) {
    seen.add(cursor);
    links.push({ userId, ancestorId: cursor, depth: links.length + 1 });
    cursor = (await tx.user.findUnique({ where: { id: cursor }, select: { sponsorId: true } }))?.sponsorId ?? null;
  }
  await tx.networkRelation.deleteMany({ where: { userId } });
  if (links.length > 0) await tx.networkRelation.createMany({ data: links });
}

/** Cambia el patrocinador y reconstruye la línea de esta cuenta y de su equipo. Devuelve un error en español, o null. */
export async function applySponsorChange(tx: Prisma.TransactionClient, userId: string, nextSponsorId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, sponsorId: true } });
  if (!user) return "Esa cuenta ya no existe.";
  const sponsor = await tx.user.findUnique({ where: { id: nextSponsorId }, select: { id: true } });
  if (!sponsor) return "No encontramos esa cuenta.";
  const downline = await collectDownline(tx, user.id);
  const block = sponsorMoveBlock({
    userId: user.id,
    currentSponsorId: user.sponsorId,
    nextSponsorId: sponsor.id,
    downlineIds: new Set(downline),
  });
  if (block) return block;
  await tx.user.update({ where: { id: user.id }, data: { sponsorId: sponsor.id } });
  await rebuildUpline(tx, user.id);
  for (const memberId of downline) await rebuildUpline(tx, memberId);
  return null;
}
