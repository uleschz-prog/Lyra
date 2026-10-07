import { getPackage, toPackageType, type SignupPlanId } from "@/config/compensation-plan";
import { activateMembership } from "@/lib/payments/activate";
import { checkPromoCode, normalizePromoCode, redeemPromoCode } from "@/lib/payments/promo";
import { getPrisma } from "@/lib/prisma";

export async function activateSignupWithPromo(input: {
  userId: string;
  name: string;
  sponsorId: string | null;
  packageId: SignupPlanId;
  code: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const current = await getPrisma().user.findUnique({
    where: { id: input.userId },
    select: { package: true },
  });
  if (!current) return { ok: false, status: 404, error: "No encontramos la cuenta." };
  if (current.package !== "NONE") return { ok: false, status: 409, error: "Tu membresía ya está activa." };

  const plan = getPackage(input.packageId);
  const preview = await checkPromoCode(input.code);
  if (!preview.ok) return { ok: false, status: 400, error: preview.error ?? "Ese código promocional no es válido." };
  if ((preview.remainingUsd ?? 0) < plan.price) {
    return {
      ok: false,
      status: 400,
      error: `El saldo del código ($${preview.remainingUsd ?? 0} USD) no alcanza para cubrir este pago ($${plan.price} USD).`,
    };
  }

  const code = normalizePromoCode(input.code);
  try {
    await getPrisma().$transaction(async (tx) => {
      const marked = await tx.user.updateMany({
        where: { id: input.userId, package: "NONE" },
        data: { pendingPackage: toPackageType(input.packageId), activatedWithCode: true },
      });
      if (marked.count === 0) {
        throw new Error("Tu membresía ya está activa.");
      }

      const redeemed = await redeemPromoCode({
        rawCode: code,
        userId: input.userId,
        purpose: "signup",
        amountUsd: plan.price,
        db: tx,
      });
      if (!redeemed.ok) throw new Error(redeemed.error);

      const activated = await activateMembership(
        tx,
        { id: input.userId, name: input.name, sponsorId: input.sponsorId },
        input.packageId,
        {
          description: `Membresía ${plan.label} con código promocional`,
          externalRef: `promo:${code}:${input.userId}`,
          skipCommissions: true,
        },
      );
      if (!activated) throw new Error("No se pudo activar la membresía.");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message || message.includes("prisma.") || message.includes("Invalid ")) {
      return { ok: false, status: 400, error: "No se pudo aplicar el código. Intenta de nuevo." };
    }
    const status = message === "Tu membresía ya está activa." ? 409 : 400;
    return { ok: false, status, error: message };
  }

  return { ok: true };
}
