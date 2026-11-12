import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/api";
import { canUseVega } from "@/lib/vega/access";
import { runXTool } from "@/lib/vega/x/tools";

export const maxDuration = 30;

/**
 * Análisis de competidor en X sin modelo (Fase 8): perfil, interacción, temas y sentimiento
 * de los posts de los últimos 7 días. Mismos topes diarios y caché que la herramienta de Vega.
 * POST { "cuenta": "@usuario", "cantidad"?: 10-50 }
 */
export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;
  if (!canUseVega(guard.user)) {
    return NextResponse.json({ error: "Vega está incluida en cualquier membresía activa." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { cuenta?: unknown; cantidad?: unknown } | null;
  if (typeof body?.cuenta !== "string" || !body.cuenta.trim()) {
    return NextResponse.json({ error: "Falta la cuenta de X (@usuario)." }, { status: 400 });
  }
  const outcome = await runXTool(guard.user.id, "analizar_competidor", { cuenta: body.cuenta, cantidad: body.cantidad });
  if (outcome.kind === "invalid") return NextResponse.json(outcome.response, { status: 422 });
  return NextResponse.json(outcome.response);
}
