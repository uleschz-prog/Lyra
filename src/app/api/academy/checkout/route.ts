import { NextResponse } from "next/server";

import { beginAcademyCheckout } from "@/lib/academy/checkout";
import { getCurrentUser } from "@/lib/auth/profile";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para inscribirte." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { courseId?: unknown } | null;
  const courseId = typeof body?.courseId === "string" ? body.courseId.trim() : "";
  if (!courseId || courseId.length > 128) {
    return NextResponse.json({ error: "Selecciona un curso válido." }, { status: 400 });
  }

  const result = await beginAcademyCheckout(user.id, courseId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.free) return NextResponse.json({ ok: true, enrolled: true });
  return NextResponse.json({ ok: true, checkoutUrl: result.url });
}
