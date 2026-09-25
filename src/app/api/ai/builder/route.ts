import { NextResponse } from "next/server";

import { generateText } from "@/lib/ai/generate";

export const maxDuration = 60;

const system = `Eres el arquitecto de producto de LYRA. El usuario describe una app, un sitio, un agente o una herramienta.
Responde solo con JSON válido, en español, sin markdown.
Forma exacta:
{"title":"","summary":"","screens":["","",""],"data":["",""],"agents":[""],"next":""}
Reglas: title corto; summary de dos frases; entre 3 y 5 pantallas concretas; data son tablas o entidades; agents son automatizaciones útiles para esa idea; next es el primer paso de construcción. No inventes precios ni integraciones que el usuario no pidió.`;

export type BuilderPlan = {
  title: string;
  summary: string;
  screens: string[];
  data: string[];
  agents: string[];
  next: string;
};

function asStrings(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 180))
    .slice(0, max);
}

export function parsePlan(raw: string): BuilderPlan | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim().slice(0, 80) : "";
  const summary = typeof record.summary === "string" ? record.summary.trim().slice(0, 400) : "";
  const next = typeof record.next === "string" ? record.next.trim().slice(0, 240) : "";
  const screens = asStrings(record.screens, 5);
  const data = asStrings(record.data, 5);
  const agents = asStrings(record.agents, 4);

  if (!title || !summary || screens.length === 0) return null;
  return { title, summary, screens, data, agents, next };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 500) : "";

  if (prompt.length < 8) {
    return NextResponse.json(
      { error: "Describe la idea con al menos una frase." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await generateText({
      system,
      user: prompt,
      temperature: 0.5,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "El modelo no pudo armar el plan.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (result.mode === "unconfigured") {
    return NextResponse.json({
      mode: "unconfigured",
      message: "Conecta GOOGLE_GENERATIVE_AI_API_KEY u OPENROUTER_API_KEY para que el modo discusión arme el plan.",
    });
  }

  const plan = parsePlan(result.text);
  if (!plan) {
    return NextResponse.json({ error: "El modelo no devolvió un plan utilizable." }, { status: 502 });
  }

  return NextResponse.json({
    mode: "discussion",
    provider: result.provider,
    model: result.model,
    credits: 0,
    plan,
  });
}
