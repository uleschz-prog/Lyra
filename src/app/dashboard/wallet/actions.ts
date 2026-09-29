"use server";

import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  creditRechargeUsd,
  getPackage,
  isFounderPackage,
  rebuyStatus,
  type SignupPlanId,
} from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { createMercadoPagoCheckout, mercadoPagoReady, type MpPurpose } from "@/lib/payments/mercadopago";
import { signupCheckout } from "@/lib/payments/signup";
import { getPrisma } from "@/lib/prisma";

export async function startCheckout(purpose: MpPurpose) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Inicia sesión para pagar." };
  if (!mercadoPagoReady()) return { ok: false as const, error: "Los pagos con Mercado Pago aún no están configurados." };

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  if (purpose === "signup") {
    const url = await signupCheckout(user.id, origin);
    return url ? { ok: true as const, url } : { ok: false as const, error: "No hay una membresía pendiente de pago." };
  }

  let usd: number;
  let title: string;
  if (purpose === "rebuy") {
    if (user.rebuyPaidThisMonth) return { ok: false as const, error: "Tu recompra de este mes ya está pagada." };
    const status = rebuyStatus(user.package, user.activeDirects);
    if (status.exempt) return { ok: false as const, error: `${status.label}. No tienes que pagar este mes.` };
    usd = status.amount;
    title = isFounderPackage(user.package) ? "LYRA · Mensualidad Founder" : `LYRA · Recompra de ${usd} créditos`;
  } else {
    const extra = creditRechargeUsd(user.package);
    if (!extra) return { ok: false as const, error: "Tu membresía no tiene una recarga definida." };
    usd = extra;
    title = `LYRA · ${extra} créditos extra`;
  }

  const checkout = await createMercadoPagoCheckout({
    purpose,
    userId: user.id,
    email: user.email,
    title,
    usd,
    origin,
  });
  if (!checkout) return { ok: false as const, error: "Mercado Pago no respondió. Intenta de nuevo en un momento." };
  return { ok: true as const, url: checkout.url };
}

const activationPackages: SignupPlanId[] = ["STARTED", "PRO", "FOUNDER"];

function newCode() {
  return `LYRA-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createActivationCode(packageId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Inicia sesión para activar cuentas." };
  if (!activationPackages.includes(packageId as SignupPlanId)) {
    return { ok: false as const, error: "Puedes activar Started, Pro o Founder." };
  }

  const price = getPackage(packageId as SignupPlanId).price;
  const prisma = getPrisma();

  const code = await prisma.$transaction(async (tx) => {
    const spent = await tx.user.updateMany({
      where: { id: user.id, activationCredits: { gte: price } },
      data: { activationCredits: { decrement: price } },
    });
    if (spent.count === 0) return null;
    return tx.activationCode.create({
      data: { code: newCode(), packageId: packageId as SignupPlanId, price, ownerId: user.id },
      select: { code: true },
    });
  });

  if (!code) return { ok: false as const, error: "No tienes créditos de activación suficientes." };
  revalidatePath("/dashboard/wallet");
  return { ok: true as const, code: code.code, price };
}
