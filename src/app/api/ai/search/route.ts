import { aiPricing } from "@/config/ai-pricing";
import { aiJson, chargeAiCall, idempotencyKeyFrom, requireAiUser } from "@/lib/ai/guard";
import { providerError, readJson } from "@/lib/ai/providers";
import { readCreditBalance } from "@/lib/credits/ledger";

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await requireAiUser();
  if (!session.user) return session.response;
  const user = session.user;

  const body = (await request.json().catch(() => null)) as { query?: unknown; idempotencyKey?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 300) : "";

  if (query.length < 3) {
    return aiJson({ error: "Escribe una búsqueda de al menos tres caracteres." }, 400, user.credits);
  }

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return aiJson(
      {
        mode: "unconfigured",
        charged: 0,
        results: [],
        message: "Conecta EXA_API_KEY para consultar tendencias y mercado en vivo.",
      },
      200,
      await readCreditBalance(user.id),
    );
  }

  const paid = await chargeAiCall({
    userId: user.id,
    cost: aiPricing.search,
    reason: "ai.search",
    description: `Búsqueda · ${query}`,
    idempotencyKey: idempotencyKeyFrom(request, body?.idempotencyKey),
    metadata: { route: "search" },
    execute: async () => {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          type: "auto",
          numResults: 6,
          contents: { highlights: true },
        }),
      });

      const payload = await readJson(response);
      if (!response.ok) throw new Error(providerError(payload, "Exa no pudo completar la búsqueda."));

      const results = Array.isArray((payload as { results?: unknown } | null)?.results)
        ? (payload as { results: unknown[] }).results.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            const title = typeof record.title === "string" ? record.title : "Resultado";
            const url = typeof record.url === "string" ? record.url : "";
            const highlights = Array.isArray(record.highlights)
              ? record.highlights.filter((highlight): highlight is string => typeof highlight === "string")
              : [];
            if (!url) return [];
            return [{ title, url, highlight: highlights[0] ?? "" }];
          })
        : [];

      return results;
    },
  });

  if (!paid.ok) return aiJson({ error: paid.error }, paid.status, paid.balance);
  return aiJson(
    { mode: "live", charged: paid.charged, transaction: paid.transaction, results: paid.value },
    200,
    paid.balance,
  );
}
