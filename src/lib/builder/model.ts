// Llamadas del generador v2 al modelo por la puerta de la Fase 3 (Gemini y respaldo OpenRouter).
import { builderLimits, builderModels } from "@/lib/builder/config";
import type { GenerationOptions } from "@/lib/vega/gemini-stream";
import { openVegaStream } from "@/lib/vega/model-gateway";
import type { ModelUsage } from "@/lib/vega/usage";

export type BuilderCall = { ok: true; text: string; usage: ModelUsage } | { ok: false; error: string; usage: ModelUsage | null };

export type BuilderModel = (input: { system: string; user: string; json?: boolean; maxOutputTokens?: number; timeoutMs?: number; purpose: "plan" | "file" | "repair" }) => Promise<BuilderCall>;

export const gatewayBuilderModel: BuilderModel = async (input) => {
  const generation: GenerationOptions = {
    temperature: input.purpose === "plan" ? 0.8 : 0.5,
    maxOutputTokens: input.maxOutputTokens ?? (input.purpose === "plan" ? 12_000 : 10_000),
    json: input.json,
    thinkingBudget: input.purpose === "plan" ? 1024 : 0,
  };
  const opened = await openVegaStream(input.system, [{ role: "user", parts: [{ text: input.user }] }], [], {
    timeoutMs: input.timeoutMs ?? builderLimits.modelTimeoutMs,
    models: builderModels(),
    generation,
  });
  if (!opened.ok) return { ok: false, error: opened.error, usage: null };
  let text = "";
  try {
    for await (const part of opened.parts) if (part.text && !part.thought) text += part.text;
  } catch {
    return { ok: false, error: "El modelo cortó la respuesta.", usage: opened.usage };
  }
  if (opened.state.truncated) return { ok: false, error: "El modelo tardó demasiado.", usage: opened.usage };
  if (!text.trim()) return { ok: false, error: "El modelo devolvió una respuesta vacía.", usage: opened.usage };
  return { ok: true, text, usage: opened.usage };
};

/** Extrae el primer objeto JSON de un texto (tolera ```json y texto alrededor). */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
