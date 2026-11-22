// Texto simple (sin herramientas) para resúmenes y tareas cortas: nivel «rápido» de la capa de modelos.
import { gatewayMode, geminiCredentials } from "@/lib/ai/models";
import { openRouterConfig, openVegaStream } from "@/lib/vega/model-gateway";
import type { ModelProvider } from "@/lib/vega/usage";

export { geminiCredentials } from "@/lib/ai/models";

type GenerateInput = {
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
};

export type GenerateResult =
  | { mode: "live"; provider: ModelProvider; model: string; text: string }
  | { mode: "unconfigured"; provider: null; model: null; text: "" };

/** ¿Hay algún proveedor configurado (Gateway, Gemini u OpenRouter)? */
export function textModelConfigured(env: Record<string, string | undefined> = process.env) {
  return gatewayMode(env).enabled || Boolean(geminiCredentials(env).apiKey) || Boolean(openRouterConfig(env).apiKey);
}

/** Lanza un Error con texto apto para el socio si ningún modelo responde (el detalle va a los logs). */
export async function generateText(input: GenerateInput): Promise<GenerateResult> {
  if (!textModelConfigured()) return { mode: "unconfigured", provider: null, model: null, text: "" };
  const opened = await openVegaStream(input.system, [{ role: "user", parts: [{ text: input.user }] }], [], {
    timeoutMs: input.timeoutMs ?? 30_000,
    tier: "rapido",
    label: "texto",
    generation: { temperature: input.temperature ?? 0.4, maxOutputTokens: 2048 },
  });
  if (!opened.ok) throw new Error(opened.error);
  let text = "";
  for await (const part of opened.parts) if (part.text && !part.thought) text += part.text;
  if (opened.state.truncated || !text.trim()) throw new Error("El modelo devolvió una respuesta vacía.");
  return { mode: "live", provider: opened.provider, model: opened.usage.model || opened.model, text: text.trim() };
}
