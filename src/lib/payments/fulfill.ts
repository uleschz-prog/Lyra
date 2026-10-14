import { Prisma } from "@prisma/client";

import { getPackage, isFounderPackage, isSignupPlanId, rebuyCredits } from "@/config/compensation-plan";
import { rebuyPaidFilter } from "@/lib/compensation/activity";
import { payCommissions } from "@/lib/compensation/payout";
import { creditCredits } from "@/lib/credits/ledger";
import { activateMembership } from "@/lib/payments/activate";
import { getMercadoPagoPayment, type MpPurpose } from "@/lib/payments/mercadopago";
import { getPrisma } from "@/lib/prisma";

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
  if ((purpose !== "rebuy" && purpose !== "credits" && purpose !== "signup") || !userId || !(usd > 0)) {
    return { ok: false, status: "invalid", error: "Ese pago no corresponde a LYRA." };
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
    select: { id: true, name: true, sponsorId: true, package: true, pendingPackage: true },
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

    const founder = isFounderPackage(user.package);
    const rawCredits = purpose === "rebuy" ? rebuyCredits(user.package, usd) : usd;
    const credits = Number.isInteger(rawCredits) ? rawCredits : Math.round(rawCredits);
    if (!Number.isInteger(credits) || credits <= 0) {
      return { ok: false, status: "invalid", error: "El monto de créditos no es válido." };
    }
    const description =
      purpose === "rebuy"
        ? `${founder ? `Mensualidad Founder · $${usd} · ${credits} créditos` : `Recompra de ${credits} créditos`} · Mercado Pago`
        : `Recarga de ${usd} créditos · Mercado Pago`;

    await prisma.$transaction(async (tx) => {
      const firstRebuy =
        purpose === "rebuy" && (await tx.transaction.count({ where: { userId: user.id, ...rebuyPaidFilter() } })) === 0;
      const credited = await creditCredits(
        {
          userId: user.id,
          credits,
          amountUsd: usd,
          externalRef,
          kind: purpose === "rebuy" ? "REBUY" : "CREDIT_PURCHASE",
          reason: purpose === "rebuy" ? "mercadopago.rebuy" : "mercadopago.credits",
          description,
        },
        tx,
      );
      if (!credited.ok) throw new Error("No se pudieron acreditar los créditos.");
      if (credited.already) return;
      if (firstRebuy) await payCommissions(tx, user, usd, "rebuy");
    });
    return { ok: true, purpose, credits, already: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: true, purpose, credits: 0, already: true };
    }
    throw error;
  }
}
