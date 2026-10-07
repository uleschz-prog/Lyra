import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { confirmUsdcSignup } from "@/lib/payments/usdc-signup";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para confirmar el pago." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { hash?: unknown } | null;
  const hash = typeof body?.hash === "string" ? body.hash : "";
  const result = await confirmUsdcSignup({ userId: user.id, hash });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, already: result.already });
}
