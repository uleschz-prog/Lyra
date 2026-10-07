import { NextResponse } from "next/server";

import { isSignupPlanId, toPackageType } from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para elegir un paquete." }, { status: 401 });
  if (user.package !== "NONE") {
    return NextResponse.json({ error: "Tu membresía ya está activa." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { packageId?: unknown } | null;
  const packageId = typeof body?.packageId === "string" ? body.packageId : "";
  if (!isSignupPlanId(packageId)) {
    return NextResponse.json({ error: "Elige Inicio, Negocio o Pro." }, { status: 400 });
  }

  await getPrisma().user.update({
    where: { id: user.id },
    data: { pendingPackage: toPackageType(packageId) },
  });
  return NextResponse.json({ ok: true });
}
