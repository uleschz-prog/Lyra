"use server";

import { randomBytes } from "node:crypto";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import { PROMO_PREFIX } from "@/lib/payments/promo";

function newPromoCode() {
  return `${PROMO_PREFIX}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export type CreatePromoResult =
  | { ok: true; id: string; code: string; budgetUsd: number }
  | { ok: false; error: string };

/** Genera un código promocional universal. Solo la cuenta administradora. */
export async function createPromoCode(budgetUsd: number): Promise<CreatePromoResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") return { ok: false, error: "Solo la cuenta administradora puede crear códigos promocionales." };

  const budget = Math.round(budgetUsd);
  if (!Number.isFinite(budget) || budget <= 0) return { ok: false, error: "El presupuesto debe ser un monto positivo en USD." };
  if (budget > 1_000_000) return { ok: false, error: "El presupuesto máximo por código es de 1,000,000 USD." };

  const prisma = getPrisma();
  const code = newPromoCode();

  const created = await prisma.promoCode.create({
    data: { code, ownerId: admin.id, budgetUsd: budget },
    select: { id: true, code: true, budgetUsd: true },
  });

  return { ok: true, ...created };
}

export type PromoStats = {
  id: string;
  code: string;
  budgetUsd: number;
  usedUsd: number;
  remainingUsd: number;
  active: boolean;
  uses: number;
  createdAt: string;
};

/** Lista los códigos promocionales (incluido saldo y usos). Solo la cuenta administradora. */
export async function listPromoCodes(): Promise<{ ok: true; codes: PromoStats[] } | { ok: false; error: string }> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") return { ok: false, error: "Solo la cuenta administradora puede ver los códigos." };

  const prisma = getPrisma();
  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { uses: true } } },
  });

  return {
    ok: true,
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      budgetUsd: c.budgetUsd,
      usedUsd: c.usedUsd,
      remainingUsd: c.budgetUsd - c.usedUsd,
      active: c.active,
      uses: c._count.uses,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export type TogglePromoResult = { ok: true } | { ok: false; error: string };

/** Activa o desactiva un código promocional. Solo la cuenta administradora. */
export async function togglePromoCode(promoId: string, active: boolean): Promise<TogglePromoResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") return { ok: false, error: "Solo la cuenta administradora puede gestionar códigos." };

  const prisma = getPrisma();
  const updated = await prisma.promoCode.updateMany({
    where: { id: promoId },
    data: { active },
  });
  if (updated.count === 0) return { ok: false, error: "Ese código no existe." };

  return { ok: true };
}

/** Consulta el saldo disponible de un código (para mostrarlo antes de aplicarlo). */
export async function checkPromoBalance(rawCode: string): Promise<
  { ok: true; remainingUsd: number; budgetUsd: number; usedUsd: number } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión." };

  const prisma = getPrisma();
  const code = rawCode.trim().toUpperCase();
  const promo = await prisma.promoCode.findUnique({
    where: { code },
    select: { budgetUsd: true, usedUsd: true, active: true, expiresAt: true },
  });
  if (!promo) return { ok: false, error: "Ese código promocional no existe." };
  if (!promo.active) return { ok: false, error: "Ese código está desactivado." };
  if (promo.expiresAt && promo.expiresAt < new Date()) return { ok: false, error: "Ese código ya expiró." };

  return { ok: true, remainingUsd: promo.budgetUsd - promo.usedUsd, budgetUsd: promo.budgetUsd, usedUsd: promo.usedUsd };
}