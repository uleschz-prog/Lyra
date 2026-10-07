"use server";

import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  creditRechargeUsd,
  founderSignupCodeCredits,
  getPackage,
  isFounderPackage,
  isSignupPlanId,
  rebuyStatus,
  toPackageType,
  type SignupPlanId,
} from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { createMercadoPagoCheckout, mercadoPagoReady, type MpPurpose } from "@/lib/payments/mercadopago";
import { signupCheckout } from "@/lib/payments/signup";
import {
  getCompanyUsdtWallet,
  usdtTrxHashUsed,
  type UsdtPurpose,
} from "@/lib/payments/usdt";
import { upgradeDifferenceUsd } from "@/lib/payments/upgrade";
import { getPrisma } from "@/lib/prisma";

const USDT_TRC20_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export async function saveUsdtWallet(
  address: string,
): Promise<{ ok: true; usdtTrc20: string | null } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para guardar tu wallet." };

  const value = address.trim();
  if (value && !USDT_TRC20_RE.test(value)) {
    return { ok: false, error: "La dirección USDT TRC20 debe empezar con T y tener 34 caracteres." };
  }

  await getPrisma().user.update({ where: { id: user.id }, data: { usdtTrc20: value || null } });
  revalidatePath("/dashboard/wallet");
  return { ok: true, usdtTrc20: value || null };
}

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

export type UsdtOrderResult = {
  ok: true;
  orderId: string;
  companyWallet: string;
  amountUsd: number;
  trxHash: string;
  status: "pending";
} | {
  ok: false;
  error: string;
};

/**
 * Pago por USDT (TRC20). Calcula el monto del propósito, verifica que la empresa
 * tenga wallet configurada y registra la orden pendiente para que el admin la valide.
 */
export async function startUsdtOrder(purpose: UsdtPurpose): Promise<UsdtOrderResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para pagar." };

  const companyWallet = await getCompanyUsdtWallet();
  if (!companyWallet) return { ok: false, error: "Todavía no hay una wallet USDT de LYRA para recibir el pago. Usa Mercado Pago o avísale al equipo." };

  let usd: number;
  if (purpose === "signup") {
    if (user.package !== "NONE" && !user.pendingPackage) {
      return { ok: false, error: "Tu membresía ya está activa." };
    }
    if (!user.pendingPackage) return { ok: false, error: "No hay una membresía pendiente de pago." };
    const plan = getPackage(user.pendingPackage as SignupPlanId);
    usd = plan.price;
  } else if (purpose === "rebuy") {
    if (user.rebuyPaidThisMonth) return { ok: false, error: "Tu recompra de este mes ya está pagada." };
    const status = rebuyStatus(user.package, user.activeDirects);
    if (status.exempt) return { ok: false, error: `${status.label}. No tienes que pagar este mes.` };
    usd = status.amount;
  } else {
    const extra = creditRechargeUsd(user.package);
    if (!extra) return { ok: false, error: "Tu membresía no tiene una recarga definida." };
    usd = extra;
  }

  const prisma = getPrisma();
  const order = await prisma.usdtOrder.create({
    data: {
      userId: user.id,
      purpose,
      amountUsd: usd,
      companyWallet,
      status: "pending",
    },
    select: { id: true },
  });

  return {
    ok: true,
    orderId: order.id,
    companyWallet,
    amountUsd: usd,
    trxHash: "",
    status: "pending",
  };
}

/** Reportar el TXID de una transferencia USDT ya enviada a la wallet de la empresa. */
export async function reportUsdtPayment(orderId: string, trxHash: string): Promise<UsdtOrderResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para reportar tu pago." };

  const prisma = getPrisma();
  const order = await prisma.usdtOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) return { ok: false, error: "Esa orden no existe." };
  if (order.status !== "pending") return { ok: false, error: "Esa orden ya fue procesada." };

  const hash = trxHash.trim();
  if (!hash) return { ok: false, error: "Escribe el hash de la transferencia (TXID)." };
  if (hash.length < 8 || hash.length > 200) return { ok: false, error: "El TXID no parece válido." };
  const used = await usdtTrxHashUsed(hash);
  if (used) return { ok: false, error: "Ese TXID ya fue reportado en otra orden." };

  await prisma.usdtOrder.update({
    where: { id: order.id },
    data: { trxHash: hash },
  });

  return {
    ok: true,
    orderId: order.id,
    companyWallet: order.companyWallet,
    amountUsd: Number(order.amountUsd) || 0,
    trxHash: hash,
    status: "pending",
  };
}

export async function getPendingUsdtOrders(): Promise<
  | { ok: true; orders: { id: string; purpose: string; amountUsd: number; trxHash: string | null; createdAt: string; userName: string }[] }
  | { ok: false; error: string }
> {
  const admin = await getCurrentUser();
  if (admin?.role !== "ADMIN") return { ok: false, error: "Solo la cuenta administradora puede ver las órdenes." };
  const orders = await getPrisma().usdtOrder.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      purpose: true,
      amountUsd: true,
      trxHash: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return {
    ok: true,
    orders: orders.map((order) => ({
      id: order.id,
      purpose: order.purpose,
      amountUsd: Number(order.amountUsd) || 0,
      trxHash: order.trxHash,
      createdAt: order.createdAt.toISOString(),
      userName: order.user.name,
    })),
  };
}

type UpgradeUsdtResult =
  | { ok: true; orderId: string; companyWallet: string; amountUsd: number; trxHash: string; status: "pending" }
  | { ok: false; error: string };

/** Pago del upgrade por USDT: se cobra solo la diferencia entre paquetes. */
export async function startUpgradeUsdt(targetPackageId: string): Promise<UpgradeUsdtResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para pagar." };
  if (!isSignupPlanId(targetPackageId)) return { ok: false, error: "Ese paquete no es válido." };
  if (user.package === targetPackageId) return { ok: false, error: "Ya tienes ese paquete." };

  const companyWallet = await getCompanyUsdtWallet();
  if (!companyWallet) {
    return { ok: false, error: "Todavía no hay una wallet USDT de LYRA para recibir el pago. Usa Mercado Pago o avísale al equipo." };
  }

  const usd = upgradeDifferenceUsd(user.package, targetPackageId);
  if (usd === null || usd <= 0) return { ok: false, error: "Este paquete no requiere pago de diferencia." };

  const prisma = getPrisma();
  const order = await prisma.usdtOrder.create({
    data: {
      userId: user.id,
      purpose: "upgrade",
      amountUsd: usd,
      companyWallet,
      status: "pending",
      note: `Upgrade a ${targetPackageId}`,
    },
    select: { id: true },
  });

  return {
    ok: true,
    orderId: order.id,
    companyWallet,
    amountUsd: usd,
    trxHash: "",
    status: "pending",
  };
}

export type UpgradeCheckoutResult = { ok: true; url: string } | { ok: false; error: string };

/** Pago del upgrade por Mercado Pago: se cobra solo la diferencia entre paquetes. */
export async function startUpgradeCheckout(targetPackageId: string): Promise<UpgradeCheckoutResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para pagar." };
  if (!mercadoPagoReady()) return { ok: false as const, error: "Los pagos con Mercado Pago aún no están configurados." };
  if (!isSignupPlanId(targetPackageId)) return { ok: false, error: "Ese paquete no es válido." };
  if (user.package === targetPackageId) return { ok: false, error: "Ya tienes ese paquete." };

  const usd = upgradeDifferenceUsd(user.package, targetPackageId);
  if (usd === null || usd <= 0) return { ok: false, error: "Este paquete no requiere pago de diferencia." };

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const targetLabel = getPackage(targetPackageId).label;

  const checkout = await createMercadoPagoCheckout({
    purpose: "upgrade",
    userId: user.id,
    email: user.email,
    title: `LYRA · Upgrade a ${targetLabel}`,
    usd,
    origin,
    packageId: targetPackageId,
  });
  if (!checkout) return { ok: false as const, error: "Mercado Pago no respondió. Intenta de nuevo en un momento." };
  return { ok: true as const, url: checkout.url };
}

const activationPackages: SignupPlanId[] = ["STARTED", "PRO", "FOUNDER"];

/** Tope: 500 de los 1,000 créditos iniciales de un Pro. */

function newCode() {
  return `LYRA-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createActivationCode(packageId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Inicia sesión para activar cuentas." };
  if (!isSignupPlanId(packageId) || !activationPackages.includes(packageId)) {
    return { ok: false as const, error: "Puedes activar Inicio, Negocio o Pro." };
  }

  const price = getPackage(packageId).price;
  const prisma = getPrisma();

  if (user.activationCredits < price) {
    if (!isFounderPackage(user.package)) {
      return { ok: false as const, error: "No tienes créditos suficientes para generar ese código." };
    }
    const used = await prisma.activationCode.aggregate({
      where: { ownerId: user.id },
      _sum: { price: true },
    });
    if ((used._sum.price ?? 0) + price > founderSignupCodeCredits) {
      return { ok: false as const, error: "Puedes usar hasta 500 créditos de los 1,000 iniciales para crear códigos." };
    }
    if (user.credits < price) {
      return { ok: false as const, error: "No tienes créditos suficientes para generar ese código." };
    }
  }

  const code = await prisma.$transaction(async (tx) => {
    // 1) Pool dedicado de créditos de activación (Pro).
    const spent = await tx.user.updateMany({
      where: { id: user.id, activationCredits: { gte: price } },
      data: { activationCredits: { decrement: price } },
    });
    if (spent.count > 0) {
      return tx.activationCode.create({
        data: { code: newCode(), packageId: toPackageType(packageId), price, ownerId: user.id },
        select: { code: true },
      });
    }

    // 2) Pro: paga desde sus créditos normales, hasta 500 de los 1,000 iniciales.
    if (user.package !== "FOUNDER") return null;
    const used = await tx.activationCode.aggregate({
      where: { ownerId: user.id },
      _sum: { price: true },
    });
    if ((used._sum.price ?? 0) + price > founderSignupCodeCredits) return null;
    const debited = await tx.user.updateMany({
      where: { id: user.id, credits: { gte: price } },
      data: { credits: { decrement: price } },
    });
    if (debited.count === 0) return null;
    const wallet = await tx.creditWallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, balance: -price },
      update: { balance: { decrement: price } },
    });
    await tx.transaction.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        amount: 0,
        creditDelta: -price,
        kind: "CREDIT_SPEND",
        description: `Código de activación ${packageId} · ${price} créditos`,
      },
    });
    return tx.activationCode.create({
      data: { code: newCode(), packageId: toPackageType(packageId), price, ownerId: user.id },
      select: { code: true },
    });
  });

  if (!code) return { ok: false as const, error: "No tienes créditos suficientes para generar ese código." };
  revalidatePath("/dashboard/wallet");
  return { ok: true as const, code: code.code, price };
}
