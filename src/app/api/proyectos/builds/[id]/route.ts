import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { builderLimits } from "@/lib/builder/config";
import { advanceBuild, getBuildForUser } from "@/lib/builder/runner";
import { getPrisma } from "@/lib/prisma";

// Cada llamada avanza el trabajo unos 48 s como máximo: cabe en Vercel Hobby (60 s).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

async function owned(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401, headers: noStore }) };
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return { error: NextResponse.json({ error: "No encontrado." }, { status: 404, headers: noStore }) };
  const build = await getBuildForUser(getPrisma(), user.id, id);
  if (!build) return { error: NextResponse.json({ error: "No encontrado." }, { status: 404, headers: noStore }) };
  return { id, build };
}

/** Estado del trabajo (sin avanzarlo). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const found = await owned(context);
  if ("error" in found) return found.error;
  return NextResponse.json({ build: found.build }, { headers: noStore });
}

/** Avanza el trabajo un paso corto (la tarjeta del chat lo llama mientras siga en curso). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const found = await owned(context);
  if ("error" in found) return found.error;
  if (found.build.status === "done" || found.build.status === "failed") return NextResponse.json({ build: found.build }, { headers: noStore });
  const build = await advanceBuild(found.id, { db: getPrisma() }, builderLimits.stepBudgetMs);
  return NextResponse.json({ build: build ?? found.build }, { headers: noStore });
}
