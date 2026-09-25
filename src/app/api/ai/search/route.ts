import { NextResponse } from "next/server";

import { providerError, readJson } from "@/lib/ai/providers";

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 300) : "";

  if (query.length < 3) {
    return NextResponse.json({ error: "Escribe una búsqueda de al menos tres caracteres." }, { status: 400 });
  }

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      mode: "unconfigured",
      results: [],
      message: "Conecta EXA_API_KEY para consultar tendencias y mercado en vivo.",
    });
  }

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
  if (!response.ok) {
    return NextResponse.json(
      { error: providerError(payload, "Exa no pudo completar la búsqueda.") },
      { status: 502 },
    );
  }

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

  return NextResponse.json({ mode: "live", results });
}
