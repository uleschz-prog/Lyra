import { NextResponse } from "next/server";

import { isSignupPlanId } from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { activateSignupWithPromo } from "@/lib/payments/promo-signup";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para usar un código." }, { status: 401 });
  if (user.package !== "NONE") {
    return NextResponse.json({ error: "Tu membresía ya está activa." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { packageId?: unknown; code?: unknown } | null;
  const packageId = typeof body?.packageId === "string" ? body.packageId : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!isSignupPlanId(packageId)) {
    return NextResponse.json({ error: "Elige Inicio, Negocio o Pro." }, { status: 400 });
  }
  if (code.trim().length < 4) {
    return NextResponse.json({ error: "Escribe el código promocional." }, { status: 400 });
  }

  const result = await activateSignupWithPromo({
    userId: user.id,
    name: user.name,
    sponsorId: user.sponsorId,
    packageId,
    code,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, next: "/dashboard" });
}
