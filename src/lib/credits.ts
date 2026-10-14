import { debitCredits, readCreditBalance, refundCredits } from "@/lib/credits/ledger";
import { getPrisma } from "@/lib/prisma";

/**
 * Precios del producto que llegó con sync-local. 1 crédito = 1 USD, entero.
 * Notebook, búsqueda y voz reemplazan el precio de 1 de la Fase 0: se conserva
 * el de sync-local, que es el más reciente. El video local no está aquí porque
 * no llama a un proveedor de pago.
 */
export const creditPrices = {
  notebook: 5,
  speech: 3,
  search: 2,
  projectAgent: 2,
  vegaMessage: 1,
  vegaTool: 3,
  telegramReply: 1,
} as const;

export type Charge =
  | { ok: true; chargeId: string | null; balance: number; duplicate: boolean }
  | { ok: false; error: string; balance: number };

export async function currentCredits(userId: string) {
  return readCreditBalance(userId);
}

function reasonFor(key: string | undefined) {
  if (!key) return "credits.charge";
  if (key.endsWith(":tool") || key.startsWith("task:")) return "vega.tool";
  if (key.startsWith("vega:")) return "vega.message";
  if (key.startsWith("tg:") || key.startsWith("tgf:")) return "telegram.reply";
  return "credits.charge";
}

/**
 * Descuenta créditos por el ledger atómico. Con `key`, la misma operación no se cobra dos veces.
 * Un monto negativo se rechaza. Cero no escribe movimiento.
 */
export async function chargeCredits(
  userId: string,
  amount: number,
  description: string,
  key?: string,
): Promise<Charge> {
  if (!Number.isInteger(amount) || amount < 0) {
    return { ok: false, error: "El precio de esta operación no es válido.", balance: await currentCredits(userId) };
  }
  if (amount === 0) return { ok: true, chargeId: null, balance: await currentCredits(userId), duplicate: false };

  const externalRef = key ? `spend:${key}`.slice(0, 180) : null;
  const debit = await debitCredits({
    userId,
    credits: amount,
    externalRef,
    reason: reasonFor(key),
    description,
    metadata: key ? { key } : undefined,
  });

  if (!debit.ok) {
    return {
      ok: false,
      error:
        debit.code === "insufficient"
          ? `Necesitas ${amount} créditos y tienes ${debit.balance}. Recarga en Billetera.`
          : "No se pudo cobrar la operación.",
      balance: debit.balance,
    };
  }

  return { ok: true, chargeId: debit.transactionId, balance: debit.balance, duplicate: debit.already };
}

/** Devuelve un cobro cuando la IA no pudo entregar. Solo se reembolsa una vez, y solo un CREDIT_SPEND. */
export async function refundCharge(chargeId: string | null, reason = "Reembolso: la IA no pudo responder") {
  if (!chargeId) return;
  const charge = await getPrisma().transaction.findUnique({
    where: { id: chargeId },
    select: { userId: true, creditDelta: true, kind: true },
  });
  if (!charge || charge.kind !== "CREDIT_SPEND" || charge.creditDelta >= 0) return;
  await refundCredits({
    userId: charge.userId,
    credits: -charge.creditDelta,
    externalRef: `refund:${chargeId}`,
    reason: "credits.refund",
    description: reason,
    metadata: { reverses: chargeId },
  });
}

/**
 * Cobra, ejecuta y reembolsa si la tarea falla o no entrega.
 * Si la clave ya se cobró, no vuelve a ejecutar el trabajo.
 */
export async function withCharge<T>(
  input: { userId: string; amount: number; description: string; key?: string },
  run: () => Promise<{ ok: true; value: T } | { ok: false; error: string; status?: number }>,
): Promise<
  | { ok: true; value: T; balance: number }
  | { ok: false; error: string; status: number; balance: number }
> {
  const charge = await chargeCredits(input.userId, input.amount, input.description, input.key);
  if (!charge.ok) return { ok: false, error: charge.error, status: 402, balance: charge.balance };
  if (charge.duplicate) {
    return { ok: false, error: "Esa operación ya se procesó.", status: 409, balance: charge.balance };
  }
  try {
    const result = await run();
    if (result.ok) return { ok: true, value: result.value, balance: charge.balance };
    await refundCharge(charge.chargeId);
    return { ok: false, error: result.error, status: result.status ?? 502, balance: await currentCredits(input.userId) };
  } catch (error) {
    await refundCharge(charge.chargeId);
    throw error;
  }
}
