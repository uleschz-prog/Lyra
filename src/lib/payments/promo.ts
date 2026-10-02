import { getPrisma } from "@/lib/prisma";

export type PromoPurpose = "signup" | "rebuy" | "credits" | "upgrade";

export const PROMO_PREFIX = "LYRA-PROMO";

/** Longitud máxima del código tal como lo escribe el usuario. */
export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

export type PromoCheck = {
  ok: boolean;
  error?: string;
  code?: string;
  budgetUsd?: number;
  usedUsd?: number;
  remainingUsd?: number;
};

/**
 * Valida un código promocional activo y con saldo disponible.
 * No lo consume; solo comprueba que exista y que tenga presupuesto.
 */
export async function checkPromoCode(rawCode: string): Promise<PromoCheck> {
  const code = normalizePromoCode(rawCode);
  if (!code.startsWith(PROMO_PREFIX)) {
    return { ok: false, error: "Ese no es un código promocional LYRA." };
  }

  const prisma = getPrisma();
  const promo = await prisma.promoCode.findUnique({
    where: { code },
    select: { id: true, code: true, budgetUsd: true, usedUsd: true, active: true, expiresAt: true },
  });

  if (!promo) return { ok: false, error: "Ese código promocional no existe." };
  if (!promo.active) return { ok: false, error: "Ese código promocional está desactivado." };
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return { ok: false, error: "Ese código promocional ya expiró." };
  }

  const remainingUsd = promo.budgetUsd - promo.usedUsd;
  if (remainingUsd <= 0) return { ok: false, error: "Ese código promocional ya agotó su saldo." };

  return {
    ok: true,
    code: promo.code,
    budgetUsd: promo.budgetUsd,
    usedUsd: promo.usedUsd,
    remainingUsd,
  };
}

export type RedeemResult =
  | { ok: true; usedUsd: number; remainingUsd: number }
  | { ok: false; error: string };

/**
 * Aplica un código promocional a un pago de un propósito concreto.
 *
 * Reglas:
 * - Solo descuenta el saldo del código (el pago queda cubierto sin costo).
 * - Registra cada uso en `PromoCodeUse` para auditoría.
 * - La operación es atómica: si dos pagos intentan gastar el mismo saldo,
 *   Prisma solo permite el que quepa.
 */
export async function redeemPromoCode(params: {
  rawCode: string;
  userId: string;
  purpose: PromoPurpose;
  amountUsd: number;
}): Promise<RedeemResult> {
  const { rawCode, userId, purpose, amountUsd } = params;
  const code = normalizePromoCode(rawCode);
  if (!code.startsWith(PROMO_PREFIX)) {
    return { ok: false, error: "Ese no es un código promocional LYRA." };
  }
  if (amountUsd <= 0) return { ok: false, error: "El monto a cubrir no es válido." };

  const prisma = getPrisma();
  const amount = Math.round(amountUsd);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Bloquea la fila del código para evitar dobles usos concurrentes.
      const promo = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "PromoCode" WHERE code = ${code} FOR UPDATE
      `;
      if (!promo?.length) throw new Error("Ese código promocional no existe.");

      const fresh = await tx.promoCode.findUnique({
        where: { code },
        select: { id: true, active: true, expiresAt: true, budgetUsd: true, usedUsd: true },
      });
      if (!fresh || !fresh.active) throw new Error("Ese código promocional está desactivado.");
      if (fresh.expiresAt && fresh.expiresAt < new Date()) {
        throw new Error("Ese código promocional ya expiró.");
      }
      const remainingUsd = fresh.budgetUsd - fresh.usedUsd;
      if (amount > remainingUsd) {
        throw new Error(
          `El saldo del código ($${remainingUsd} USD) no alcanza para cubrir este pago ($${amount} USD).`,
        );
      }

      await tx.promoCode.update({
        where: { id: fresh.id },
        data: { usedUsd: fresh.usedUsd + amount },
      });

      await tx.promoCodeUse.create({
        data: { promoId: fresh.id, code, userId, purpose, amountUsd: amount },
      });

      return { usedUsd: fresh.usedUsd + amount, remainingUsd: remainingUsd - amount };
    });

    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo aplicar el código promocional.";
    return { ok: false, error: message };
  }
}

/** Etiqueta humana de cada propósito, para registros y auditoría. */
export const promoPurposeLabel: Record<PromoPurpose, string> = {
  signup: "Activación de membresía",
  rebuy: "Recompra mensual",
  credits: "Recarga de créditos",
  upgrade: "Mejora de plan",
};