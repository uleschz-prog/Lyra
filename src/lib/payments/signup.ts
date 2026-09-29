import { getPackage, isSignupPlanId } from "@/config/compensation-plan";
import { createMercadoPagoCheckout, mercadoPagoReady } from "@/lib/payments/mercadopago";
import { getPrisma } from "@/lib/prisma";

export function requestOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function signupCheckout(userId: string, origin: string) {
  if (!mercadoPagoReady()) return null;
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, pendingPackage: true },
  });
  if (!user?.pendingPackage || !isSignupPlanId(user.pendingPackage)) return null;
  const plan = getPackage(user.pendingPackage);
  const checkout = await createMercadoPagoCheckout({
    purpose: "signup",
    userId: user.id,
    email: user.email,
    title: `LYRA · Membresía ${plan.label}`,
    usd: plan.price,
    origin,
    packageId: plan.id,
  });
  return checkout?.url ?? null;
}
