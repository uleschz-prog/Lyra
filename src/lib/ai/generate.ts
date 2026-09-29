import { providerError, readJson } from "@/lib/ai/providers";

type GenerateInput = {
  system: string;
  user: string;
  temperature?: number;
};

export type GenerateResult =
  | { mode: "live"; provider: "gemini" | "openrouter"; model: string; text: string }
  | { mode: "unconfigured"; provider: null; model: null; text: "" };

export function geminiCredentials() {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  return { apiKey, model };
}

export async function generateText(input: GenerateInput): Promise<GenerateResult> {
  const { apiKey, model } = geminiCredentials();
  if (apiKey) return generateWithGemini(apiKey, model, input);

  const openrouter = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouter) return generateWithOpenRouter(openrouter, input);

  return { mode: "unconfigured", provider: null, model: null, text: "" };
}

async function generateWithGemini(apiKey: string, model: string, input: GenerateInput): Promise<GenerateResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.user }] }],
        generationConfig: { temperature: input.temperature ?? 0.4 },
      }),
    },
  );

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(providerError(payload, "Gemini no pudo responder."));
  }

  const text = extractGeminiText(payload);
  if (!text) throw new Error("Gemini devolvió una respuesta vacía.");
  return { mode: "live", provider: "gemini", model, text };
}

async function generateWithOpenRouter(apiKey: string, input: GenerateInput): Promise<GenerateResult> {
  const model = "google/gemini-2.5-flash";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0.4,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(providerError(payload, "OpenRouter no pudo responder."));
  }

  const text = extractOpenRouterText(payload);
  if (!text) throw new Error("OpenRouter devolvió una respuesta vacía.");
  return { mode: "live", provider: "openrouter", model, text };
}

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  const content = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content;
  if (!content || !Array.isArray(content.parts)) return "";
  return content.parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      return typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "";
    })
    .join("")
    .trim();
}

function extractOpenRouterText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  return typeof message?.content === "string" ? message.content.trim() : "";
}
