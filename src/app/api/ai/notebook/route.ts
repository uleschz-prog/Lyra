import { aiPricing } from "@/config/ai-pricing";
import { aiJson, chargeAiCall, idempotencyKeyFrom, requireAiUser } from "@/lib/ai/guard";
import { geminiCredentials } from "@/lib/ai/generate";
import { providerError, readJson } from "@/lib/ai/providers";
import { readCreditBalance } from "@/lib/credits/ledger";

export const maxDuration = 60;

type NotebookMode = "chat" | "summary" | "quiz" | "slides" | "video";

type SourceInput = {
  title: string;
  kind: "pdf" | "link" | "note";
  text: string;
};

const modes = new Set<NotebookMode>(["chat", "summary", "quiz", "slides", "video"]);

const instructions: Record<NotebookMode, string> = {
  chat: "Responde en español y cita el título de la fuente entre corchetes. Si la respuesta no está en las fuentes, dilo en una frase y no inventes datos.",
  summary:
    "Redacta en español un resumen ejecutivo de las fuentes: cuatro viñetas concretas y un cierre de dos frases. No agregues hechos que no estén en el material.",
  quiz: "Redacta en español cuatro preguntas de estudio basadas solo en las fuentes. Después de cada pregunta, escribe la respuesta breve en la línea siguiente, empezando por «Respuesta:».",
  slides:
    "Devuelve solo JSON válido, sin markdown. Forma: {\"title\":\"título de la presentación\",\"slides\":[{\"kicker\":\"máximo 4 palabras\",\"title\":\"una idea\",\"points\":[\"frase corta\",\"frase corta\"],\"note\":\"nota del presentador en una frase\"}]}. Entre 5 y 6 diapositivas, en español, tono sobrio. La primera es portada y la última es un cierre con el siguiente paso. Usa solo hechos de las fuentes.",
  video:
    "Escribe un guion hablado en español, de 70 a 90 palabras, para un video de resumen. Frases cortas, sin títulos ni viñetas. Usa solo lo que está en las fuentes y cierra con un siguiente paso.",
};

function isSource(value: unknown): value is SourceInput {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.title === "string" &&
    (source.kind === "pdf" || source.kind === "link" || source.kind === "note") &&
    typeof source.text === "string"
  );
}

function clean(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function previewAnswer(mode: NotebookMode, question: string, sources: SourceInput[]) {
  const titles = sources.map((source) => source.title).join(", ");
  const excerpts = sources
    .map((source) => `${source.title}: ${clean(source.text, 280)}`)
    .join("\n");

  if (mode === "summary") {
    return `Resumen de trabajo sobre ${titles}.\n\n${sources
      .map((source) => `• ${source.title}. ${clean(source.text, 180)}`)
      .join("\n")}\n\nCierre: el material ya permite preparar la siguiente conversación sin salir de estas fuentes.`;
  }

  if (mode === "slides") {
    const slides = sources.slice(0, 4).map((source, index) => ({
      kicker: index === 0 ? "Portada" : `Fuente ${index + 1}`,
      title: source.title,
      points: [clean(source.text, 110)],
      note: "Desarrolla esta idea con lo que ya está escrito en la fuente.",
    }));
    return JSON.stringify({
      title: "Presentación de las fuentes",
      slides: [
        ...slides,
        {
          kicker: "Cierre",
          title: "El siguiente paso",
          points: ["Quédate con una idea de cada fuente.", "Úsala en la siguiente conversación."],
          note: "Cierra sin agregar datos que no estén en el material.",
        },
      ],
    });
  }

  if (mode === "video") {
    const lines = sources
      .slice(0, 3)
      .map((source) => `${source.title}. ${clean(source.text, 140)}`)
      .join(" ");
    return `${lines} El siguiente paso es usar solo este material en la conversación.`.slice(0, 700);
  }

  if (mode === "quiz") {
    return sources
      .slice(0, 4)
      .map((source, index) => {
        return `${index + 1}. ¿Qué aporta «${source.title}» a la investigación?\nRespuesta: ${clean(source.text, 180)}`;
      })
      .join("\n\n");
  }

  const focus = question ? `Sobre «${question}». ` : "";
  return `${focus}Con las fuentes cargadas (${titles}) esto es lo que sí está escrito:\n\n${excerpts}\n\nConecta GEMINI_API_KEY para que Gemini razone encima de este material.`;
}

export async function POST(request: Request) {
  const session = await requireAiUser();
  if (!session.user) return session.response;
  const user = session.user;

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    question?: unknown;
    sources?: unknown;
    idempotencyKey?: unknown;
  } | null;

  const mode = body?.mode;
  if (typeof mode !== "string" || !modes.has(mode as NotebookMode)) {
    return aiJson({ error: "Modo de notebook no válido." }, 400, user.credits);
  }

  const notebookMode = mode as NotebookMode;
  const question = typeof body?.question === "string" ? clean(body.question, 4000) : "";
  const sources = Array.isArray(body?.sources) ? body.sources.filter(isSource).slice(0, 12) : [];

  if (sources.length === 0) {
    return aiJson({ error: "Agrega al menos una fuente antes de consultar." }, 400, user.credits);
  }

  const prepared = sources.map((source) => ({
    ...source,
    title: clean(source.title, 140),
    text: source.text.trim().slice(0, 12000),
  }));

  const { apiKey, model } = geminiCredentials();
  if (!apiKey) {
    return aiJson(
      {
        mode: "preview",
        model: "gemini-2.5-flash",
        charged: 0,
        text: previewAnswer(notebookMode, question, prepared),
      },
      200,
      await readCreditBalance(user.id),
    );
  }

  const corpus = prepared
    .map((source) => `# ${source.title} (${source.kind})\n${source.text}`)
    .join("\n\n");

  const paid = await chargeAiCall({
    userId: user.id,
    cost: aiPricing.notebook,
    reason: "ai.notebook",
    description: `Notebook · ${notebookMode}`,
    idempotencyKey: idempotencyKeyFrom(request, body?.idempotencyKey),
    metadata: { mode: notebookMode },
    execute: async () => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions[notebookMode] }] },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${corpus}\n\nConsulta:\n${question || "Trabaja con todas las fuentes cargadas."}`,
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0.4 },
          }),
        },
      );

      const payload = await readJson(response);
      if (!response.ok) throw new Error(providerError(payload, "Gemini no pudo responder."));
      const text = extractGeminiText(payload);
      if (!text) throw new Error("Gemini devolvió una respuesta vacía.");
      return text;
    },
  });

  if (!paid.ok) return aiJson({ error: paid.error }, paid.status, paid.balance);

  return aiJson(
    {
      mode: "live",
      model,
      charged: paid.charged,
      transaction: paid.transaction,
      text: paid.value,
    },
    200,
    paid.balance,
  );
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
      return typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "";
    })
    .join("")
    .trim();
}
