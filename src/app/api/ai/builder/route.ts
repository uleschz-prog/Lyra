import { aiPricing } from "@/config/ai-pricing";
import { aiJson, chargeAiCall, idempotencyKeyFrom, requireAiUser } from "@/lib/ai/guard";
import { generateText, geminiCredentials } from "@/lib/ai/generate";
import { readCreditBalance } from "@/lib/credits/ledger";

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
  const session = await requireAiUser();
  if (!session.user) return session.response;
  const user = session.user;

  const body = (await request.json().catch(() => null)) as { prompt?: unknown; idempotencyKey?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 500) : "";

  if (prompt.length < 8) {
    return aiJson({ error: "Describe la idea con al menos una frase." }, 400, user.credits);
  }

  const configured = Boolean(geminiCredentials().apiKey || process.env.OPENROUTER_API_KEY?.trim());
  if (!configured) {
    return aiJson(
      {
        mode: "unconfigured",
        charged: 0,
        message: "Conecta GOOGLE_GENERATIVE_AI_API_KEY u OPENROUTER_API_KEY para que el modo discusión arme el plan.",
      },
      200,
      await readCreditBalance(user.id),
    );
  }

  const paid = await chargeAiCall({
    userId: user.id,
    cost: aiPricing.builder,
    reason: "ai.builder",
    description: "Plan del estudio",
    idempotencyKey: idempotencyKeyFrom(request, body?.idempotencyKey),
    metadata: { route: "builder" },
    execute: async () => {
      const result = await generateText({ system, user: prompt, temperature: 0.5 });
      if (result.mode !== "live") {
        throw new Error("El modelo no está configurado.");
      }
      const plan = parsePlan(result.text);
      if (!plan) throw new Error("El modelo no devolvió un plan utilizable.");
      return { provider: result.provider, model: result.model, plan };
    },
  });

  if (!paid.ok) return aiJson({ error: paid.error }, paid.status, paid.balance);

  return aiJson(
    {
      mode: "discussion",
      provider: paid.value.provider,
      model: paid.value.model,
      charged: paid.charged,
      transaction: paid.transaction,
      plan: paid.value.plan,
    },
    200,
    paid.balance,
  );
}
