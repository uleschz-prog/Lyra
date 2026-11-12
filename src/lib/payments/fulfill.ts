import { Prisma } from "@/generated/prisma/client";

import {
  bonusCreditsForRecharge,
  creditedRechargeCredits,
  creditRechargeUsdForCredits,
  creditUsd,
  getPackage,
  isFounderPackage,
  isSignupPlanId,
  isValidCreditRecharge,
  minimumCreditRecharge,
  rebuyCredits,
  toPackageType,
} from "@/config/compensation-plan";
import { rebuyPaidFilter } from "@/lib/compensation/activity";
import { payCommissions } from "@/lib/compensation/payout";
import { creditCredits } from "@/lib/credits/ledger";
import { activateMembership } from "@/lib/payments/activate";
import { getMercadoPagoPayment, type MpPurpose } from "@/lib/payments/mercadopago";
import { getPrisma } from "@/lib/prisma";
import { upgradeDifferenceUsd } from "@/lib/payments/upgrade";
import { grantVideoQuota } from "@/lib/studio/video-quotas";

export type FulfillResult =
  | { ok: true; purpose: MpPurpose; credits: number; already: boolean; packageLabel?: string }
  | { ok: false; status: string; error: string };

export async function fulfillMercadoPago(paymentId: string): Promise<FulfillResult> {
  const payment = await getMercadoPagoPayment(paymentId);
  if (!payment) return { ok: false, status: "unknown", error: "No pudimos consultar el pago en Mercado Pago." };
  if (payment.status !== "approved") {
    return {
      ok: false,
      status: payment.status,
      error:
        payment.status === "pending" || payment.status === "in_process"
          ? "Tu pago está en proceso. Se activa en cuanto Mercado Pago lo acredite."
          : "Mercado Pago no aprobó el pago.",
    };
  }

  const purpose = payment.metadata?.lyra_purpose;
  const userId = payment.metadata?.lyra_user;
  const usd = Number(payment.metadata?.lyra_usd);
  const total = Number(payment.metadata?.lyra_total);
  if (
    (purpose !== "rebuy" && purpose !== "credits" && purpose !== "signup" && purpose !== "upgrade") ||
    !userId ||
    !Number.isFinite(usd) ||
    usd <= 0 ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return { ok: false, status: "invalid", error: "Ese pago no corresponde a LYRA." };
  }
  if (purpose === "credits") {
    const purchasedCredits = usd / creditUsd;
    if (!isValidCreditRecharge(purchasedCredits) || creditRechargeUsdForCredits(purchasedCredits) !== usd) {
      return {
        ok: false,
        status: "invalid",
        error: `La recarga debe ser de al menos ${minimumCreditRecharge} créditos enteros.`,
      };
    }
  }
  if (payment.transaction_amount + 0.01 < total) {
    return { ok: false, status: "invalid", error: "El monto pagado no coincide." };
  }

  const prisma = getPrisma();
  const externalRef = `mp:${payment.id}`;
  if (await prisma.transaction.findUnique({ where: { externalRef }, select: { id: true } })) {
    return { ok: true, purpose, credits: 0, already: true };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, sponsorId: true, package: true, pendingPackage: true, credits: true },
  });
  if (!user) return { ok: false, status: "invalid", error: "La cuenta de ese pago ya no existe." };

  try {
    if (purpose === "signup") {
      const packageId = payment.metadata?.lyra_package ?? "";
      if (!isSignupPlanId(packageId) || user.pendingPackage !== packageId) {
        return { ok: true, purpose, credits: 0, already: true };
      }
      const plan = getPackage(packageId);
      if (usd < plan.price) return { ok: false, status: "invalid", error: "El monto pagado no coincide." };
      await prisma.$transaction((tx) =>
        activateMembership(tx, user, packageId, { description: `Inscripción ${plan.label} · Mercado Pago`, externalRef }),
      );
      return { ok: true, purpose, credits: plan.credits, already: false, packageLabel: plan.label };
    }

    if (purpose === "upgrade") {
      const packageId = payment.metadata?.lyra_package ?? "";
      const difference = isSignupPlanId(packageId) ? upgradeDifferenceUsd(user.package, packageId) : null;
      if (!difference || difference <= 0 || Math.abs(usd - difference) > 0.01) {
        return { ok: false, status: "invalid", error: "El monto del upgrade no coincide con el paquete de destino." };
      }
      const plan = getPackage(packageId);
      await prisma.$transaction(async (tx) => {
        const wallet = await tx.creditWallet.upsert({
          where: { userId: user.id },
          create: { userId: user.id, balance: user.credits },
          update: {},
        });
        await tx.user.update({
          where: { id: user.id },
          data: { package: toPackageType(packageId), pendingPackage: null },
        });
        await tx.transaction.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            amount: usd,
            creditDelta: 0,
            kind: "CREDIT_PURCHASE",
            description: `Upgrade a ${plan.label} · Mercado Pago`,
            externalRef,
          },
        });
        await grantVideoQuota(tx, user.id, packageId);
        await payCommissions(tx, user, usd, "purchase");
      });
      return { ok: true, purpose, credits: 0, already: false, packageLabel: plan.label };
    }

    const founder = isFounderPackage(user.package);
    const purchasedCredits = purpose === "credits" ? usd / creditUsd : 0;
    const credits =
      purpose === "rebuy"
        ? rebuyCredits(user.package, usd)
        : creditedRechargeCredits(purchasedCredits);
    const promo = purpose === "credits" ? bonusCreditsForRecharge(purchasedCredits) : 0;
    const description =
      purpose === "rebuy"
        ? `${founder ? `Mensualidad Pro · $${usd} · ${credits} créditos` : `Recarga de ${credits} créditos`} · Mercado Pago`
        : `Recarga de ${purchasedCredits} créditos${promo ? ` + ${promo} de promoción` : ""} · Mercado Pago`;

    const outcome = await prisma.$transaction(async (tx) => {
      // Se conserva la regla de producción: toda recarga pagada cuenta como REBUY para la actividad del mes.
      const firstRebuy = (await tx.transaction.count({ where: { userId: user.id, ...rebuyPaidFilter() } })) === 0;
      const reason = purpose === "rebuy" ? "payments.rebuy" : "payments.credits";
      if (credits > 0) {
        const credited = await creditCredits(
          { userId: user.id, credits, amountUsd: usd, externalRef, kind: "REBUY", reason, description },
          tx,
        );
        if (!credited.ok) throw new Error("No se pudieron acreditar los créditos del pago.");
        // Otro webhook ya registró este pago: no se repiten cuota ni comisiones.
        if (credited.already) return "already" as const;
      } else {
        // Pago sin créditos (delta 0): se conserva el asiento para la idempotencia y las comisiones.
        const wallet = await tx.creditWallet.upsert({
          where: { userId: user.id },
          create: { userId: user.id, balance: user.credits },
          update: {},
        });
        await tx.transaction.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            amount: usd,
            creditDelta: 0,
            kind: "REBUY",
            description,
            reason,
            externalRef,
          },
        });
      }
      if (firstRebuy) await grantVideoQuota(tx, user.id, user.package);
      if (firstRebuy || purpose === "credits") await payCommissions(tx, user, usd, "rebuy");
      return "applied" as const;
    });
    if (outcome === "already") return { ok: true, purpose, credits: 0, already: true };
    return { ok: true, purpose, credits, already: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: true, purpose, credits: 0, already: true };
    }
    throw error;
  }
}
