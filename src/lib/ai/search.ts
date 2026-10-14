import { providerError, readJson } from "@/lib/ai/providers";

export type WebResult = { title: string; url: string; highlight: string };

export async function searchWeb(query: string, numResults = 6) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return { ok: false as const, error: "La búsqueda web no está configurada." };

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults,
      contents: { highlights: true },
    }),
  });

  const payload = await readJson(response);
  if (!response.ok) return { ok: false as const, error: providerError(payload, "Exa no pudo completar la búsqueda.") };

  const results: WebResult[] = Array.isArray((payload as { results?: unknown } | null)?.results)
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

  return { ok: true as const, value: results };
}
