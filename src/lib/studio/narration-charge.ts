import { chargeCredits, creditPrices, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";

/** Intentos por video: un intento fallido se reembolsa y libera el siguiente. */
export const narrationMaxAttempts = 3;

export function narrationKey(generationId: string, attempt: number) {
  return `narration:${generationId}:${attempt}`;
}

export type NarrationAttempt = { attempt: number; chargeId: string; refunded: boolean };

export type NarrationPlan =
  | { ok: true; attempt: number }
  | { ok: false; status: 409 | 429; error: string };

/**
 * Decide si se puede narrar: si un cobro previo sigue en pie, la narración ya se entregó
 * (no se vuelve a llamar a ElevenLabs). Si todos se reembolsaron, toca el siguiente intento.
 */
export function planNarrationAttempt(previous: NarrationAttempt[]): NarrationPlan {
  if (previous.some((item) => !item.refunded)) {
    return { ok: false, status: 409, error: "La narración de este video ya se generó." };
  }
  const used = new Set(previous.map((item) => item.attempt));
  for (let attempt = 1; attempt <= narrationMaxAttempts; attempt += 1) {
    if (!used.has(attempt)) return { ok: true, attempt };
  }
  return { ok: false, status: 429, error: "Se agotaron los intentos de narración de este video." };
}

async function previousAttempts(userId: string, generationId: string): Promise<NarrationAttempt[]> {
  const prisma = getPrisma();
  const refs = Array.from({ length: narrationMaxAttempts }, (_, index) => `spend:${narrationKey(generationId, index + 1)}`);
  const spends = await prisma.transaction.findMany({
    where: { userId, externalRef: { in: refs } },
    select: { id: true, externalRef: true },
  });
  if (!spends.length) return [];
  const refunds = await prisma.transaction.findMany({
    where: { userId, externalRef: { in: spends.map((spend) => `refund:${spend.id}`) } },
    select: { externalRef: true },
  });
  const refunded = new Set(refunds.map((refund) => refund.externalRef));
  return spends.map((spend) => ({
    attempt: Number(spend.externalRef?.split(":").pop() ?? 0),
    chargeId: spend.id,
    refunded: refunded.has(`refund:${spend.id}`),
  }));
}

export type NarrationCharge =
  | { ok: true; chargeId: string | null; balance: number }
  | { ok: false; status: number; error: string; balance?: number };

/** Cobra la narración una sola vez por video (clave idempotente en el libro de créditos). */
export async function chargeNarration(userId: string, generationId: string): Promise<NarrationCharge> {
  const plan = planNarrationAttempt(await previousAttempts(userId, generationId));
  if (!plan.ok) return plan;
  const charge = await chargeCredits(userId, creditPrices.speech, "Video · narración", narrationKey(generationId, plan.attempt));
  if (!charge.ok) return { ok: false, status: 402, error: charge.error, balance: charge.balance };
  // Otra solicitud ganó la misma clave al mismo tiempo: esa es la que narra.
  if (charge.duplicate) return { ok: false, status: 409, error: "La narración de este video ya se está generando." };
  return { ok: true, chargeId: charge.chargeId, balance: charge.balance };
}

export async function refundNarration(chargeId: string | null) {
  await refundCharge(chargeId, "Reembolso: no se pudo crear la narración");
}
