import { NextResponse } from "next/server";

import { requireAiUser } from "@/lib/ai/guard";
import { canUseVega } from "@/lib/vega/access";
import { BudgetExceededError, LlmAuthError, LlmUnavailableError } from "@/lib/vega/llm-gateway";

export async function requireVegaUser() {
  const session = await requireAiUser();
  if (!session.user) return session;
  if (!canUseVega(session.user.package)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Vega está disponible en Founder y Corporate." }, { status: 403 }),
    };
  }
  return session;
}

export function llmFailure(error: unknown): NextResponse | null {
  if (error instanceof BudgetExceededError) {
    return NextResponse.json(
      { error: "El presupuesto mensual de LLM de tu plan no alcanza para esta consulta.", code: "llm_budget" },
      { status: 429 },
    );
  }
  if (error instanceof LlmAuthError) {
    return NextResponse.json(
      { error: "Vega no pudo autenticarse con el proveedor de modelos.", code: "llm_auth" },
      { status: 503 },
    );
  }
  if (error instanceof LlmUnavailableError) {
    return NextResponse.json({ error: "El modelo no está disponible en este momento.", code: "llm_unavailable" }, { status: 503 });
  }
  return null;
}
