import { aiPricing } from "@/config/ai-pricing";
import { aiJson, chargeAiCall, idempotencyKeyFrom } from "@/lib/ai/guard";
import { searchWeb } from "@/lib/ai/search";
import { requireMember } from "@/lib/auth/api";
import { readCreditBalance } from "@/lib/credits/ledger";

export const maxDuration = 30;

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;
  const user = guard.user;

  const body = (await request.json().catch(() => null)) as { query?: unknown; idempotencyKey?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 300) : "";

  if (query.length < 3) {
    return aiJson({ error: "Escribe una búsqueda de al menos tres caracteres." }, 400, user.credits);
  }

  if (!process.env.EXA_API_KEY) {
    const balance = await readCreditBalance(user.id);
    return aiJson(
      {
        mode: "unconfigured",
        charged: 0,
        credits: balance,
        results: [],
        message: "Conecta EXA_API_KEY para consultar tendencias y mercado en vivo.",
      },
      200,
      balance,
    );
  }

  const paid = await chargeAiCall({
    userId: user.id,
    cost: aiPricing.search,
    reason: "ai.search",
    description: `Búsqueda · ${query.slice(0, 60)}`,
    idempotencyKey: idempotencyKeyFrom(request, body?.idempotencyKey),
    metadata: { route: "search" },
    execute: async () => {
      const found = await searchWeb(query);
      if (!found.ok) throw new Error(found.error);
      return found.value;
    },
  });

  if (!paid.ok) return aiJson({ error: paid.error, credits: paid.balance }, paid.status, paid.balance);
  return aiJson(
    { mode: "live", charged: paid.charged, transaction: paid.transaction, results: paid.value, credits: paid.balance },
    200,
    paid.balance,
  );
}
