import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { canUseVega } from "@/lib/vega/access";
import { advanceJobForUser, cancelJobForUser, getJobForUser } from "@/lib/vega/jobs";
import { jobLimits } from "@/lib/vega/jobs-core";

// Cada POST avanza el trabajo un paso (≤ 50 s): cabe en Vercel Hobby (60 s).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

async function context(params: Promise<{ id: string }>) {
  const user = await getCurrentUser();
  if (!user || !canUseVega(user)) return { error: NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401, headers: noStore }) };
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return { error: NextResponse.json({ error: "No encontrado." }, { status: 404, headers: noStore }) };
  return { user, id };
}

/** Estado del trabajo (sin avanzarlo). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await context(params);
  if ("error" in found) return found.error;
  const job = await getJobForUser(found.user.id, found.id);
  if (!job) return NextResponse.json({ error: "No encontrado." }, { status: 404, headers: noStore });
  return NextResponse.json({ job }, { headers: noStore });
}

/** Avanza un paso (la tarjeta lo llama mientras el trabajo siga activo). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const found = await context(params);
  if ("error" in found) return found.error;
  const result = await advanceJobForUser(found.user.id, found.id, jobLimits.stepBudgetMs - (Date.now() - started));
  if (!result) return NextResponse.json({ error: "No encontrado." }, { status: 404, headers: noStore });
  return NextResponse.json(result, { headers: noStore });
}

/** Cancela el trabajo (el paso en curso termina y ya no se hacen más). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await context(params);
  if ("error" in found) return found.error;
  const job = await cancelJobForUser(found.user.id, found.id);
  if (!job) return NextResponse.json({ error: "No encontrado." }, { status: 404, headers: noStore });
  return NextResponse.json({ job }, { headers: noStore });
}
