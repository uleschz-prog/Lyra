import { NextResponse } from "next/server";

import { geminiCredentials } from "@/lib/ai/generate";
import { providerError, readJson } from "@/lib/ai/providers";
import { requireMember } from "@/lib/auth/api";
import { creditPrices, withCharge } from "@/lib/credits";

export const maxDuration = 60;

type NotebookMode =
  | "chat"
  | "summary"
  | "brief"
  | "quiz"
  | "slides"
  | "video"
  | "mindmap"
  | "report"
  | "cards"
  | "infographic"
  | "table";

type SourceInput = {
  title: string;
  kind: "pdf" | "link" | "note";
  text: string;
};

const modes = new Set<NotebookMode>([
  "chat",
  "summary",
  "brief",
  "quiz",
  "slides",
  "video",
  "mindmap",
  "report",
  "cards",
  "infographic",
  "table",
]);

const jsonModes = new Set<NotebookMode>(["quiz", "slides", "mindmap", "report", "cards", "infographic", "table"]);

const instructions: Record<NotebookMode, string> = {
  chat: "Responde en español, en párrafos cortos y concretos. Cita el título de la fuente entre corchetes. Si la respuesta no está en las fuentes, dilo en una frase y no inventes cifras, nombres ni fechas. Cierra con el dato más útil para seguir.",
  summary:
    "Redacta en español un resumen ejecutivo de las fuentes. Cuatro viñetas con un hecho verificable cada una y un cierre de dos frases. No agregues datos que no estén en el material.",
  brief:
    "Escribe una narración hablada en español, de 140 a 170 palabras, para un resumen en audio. Tono cercano y preciso, frases que se puedan decir en voz alta. Sin títulos, viñetas ni corchetes. Menciona las ideas por su nombre y cierra con un siguiente paso. Usa solo las fuentes.",
  quiz: 'Devuelve solo JSON: {"title":"nombre del quiz","questions":[{"prompt":"pregunta","choices":["a","b","c","d"],"answer":0,"why":"por qué esa opción, en una frase"}]}. Cinco preguntas. answer es el índice correcto, de 0 a 3. Las cuatro opciones deben ser plausibles. Nada que no esté en las fuentes.',
  slides:
    'Devuelve solo JSON: {"title":"título","slides":[{"kicker":"máximo 4 palabras","title":"una idea","points":["frase corta","frase corta"],"note":"nota del presentador"}]}. Seis diapositivas en español. La primera es portada y la última es el siguiente paso. Cada punto cabe en una línea. Solo hechos de las fuentes.',
  video:
    "Escribe un guion hablado en español, de 80 a 110 palabras, para un video de resumen. Frases cortas, sin títulos ni viñetas. Empieza con la idea principal, desarrolla dos hechos y cierra con un siguiente paso. Solo lo que está en las fuentes.",
  mindmap:
    'Devuelve solo JSON: {"title":"mapa","center":"tema en 3 palabras","branches":[{"label":"rama corta","detail":"una frase","leaves":["detalle","detalle"]}]}. Entre 4 y 6 ramas. Etiquetas breves. Cada hoja es un hecho de las fuentes, no una opinión.',
  report:
    'Devuelve solo JSON: {"title":"informe","dek":"una frase que diga de qué trata","sections":[{"heading":"título de sección","body":"dos o tres frases concretas"}]}. Cuatro secciones. Prosa clara, sin adjetivos vacíos. Si un dato no está en las fuentes, no lo escribas.',
  cards:
    'Devuelve solo JSON: {"title":"tarjetas","cards":[{"front":"pregunta breve","back":"respuesta precisa"}]}. Ocho tarjetas. El reverso responde solo con lo que dicen las fuentes y cabe en dos frases.',
  infographic:
    'Devuelve solo JSON: {"title":"infografía","subtitle":"una frase","stats":[{"value":"cifra o palabra corta","label":"qué mide"}],"points":[{"title":"idea","text":"una frase"}]}. Hasta 4 cifras y 4 ideas. Si el material no trae un número, no lo inventes: usa una palabra corta que sí esté en las fuentes, como un nombre de plan o un plazo.',
  table:
    'Devuelve solo JSON: {"title":"tabla","columns":["columna","columna","columna"],"rows":[["dato","dato","dato"]]}. Entre 4 y 8 filas. Compara lo que las fuentes permiten comparar. Celdas cortas. No rellenes huecos con datos inventados: escribe "—" si falta.',
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
  const lead = sources[0];

  if (mode === "summary" || mode === "brief") {
    const lines = sources.map((source) => `${source.title}. ${clean(source.text, 160)}`).join(" ");
    if (mode === "brief") {
      return `${lines} El siguiente paso es quedarte con una idea de cada fuente y usarla en la conversación.`.slice(0, 900);
    }
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
    return JSON.stringify({
      title: "Cuestionario de las fuentes",
      questions: sources.slice(0, 4).map((source) => ({
        prompt: `¿Qué aporta «${source.title}»?`,
        choices: [clean(source.text, 90), "Un dato que no está en el material", "Una cifra inventada", "Nada relacionado"],
        answer: 0,
        why: `La respuesta sale de ${source.title}.`,
      })),
    });
  }

  if (mode === "mindmap") {
    return JSON.stringify({
      title: "Mapa de las fuentes",
      center: clean(lead?.title ?? "Tema", 48),
      branches: sources.slice(0, 4).map((source) => ({
        label: clean(source.title, 48),
        detail: clean(source.text, 140),
        leaves: [clean(source.text, 70)],
      })),
    });
  }

  if (mode === "report") {
    return JSON.stringify({
      title: "Informe de las fuentes",
      dek: `Síntesis de ${titles}.`,
      sections: sources.slice(0, 4).map((source) => ({
        heading: source.title,
        body: clean(source.text, 420),
      })),
    });
  }

  if (mode === "cards") {
    return JSON.stringify({
      title: "Tarjetas de estudio",
      cards: sources.slice(0, 6).map((source) => ({
        front: `¿Qué dice «${source.title}»?`,
        back: clean(source.text, 220),
      })),
    });
  }

  if (mode === "infographic") {
    return JSON.stringify({
      title: "Lectura de las fuentes",
      subtitle: titles,
      stats: [{ value: String(sources.length), label: "Fuentes" }],
      points: sources.slice(0, 3).map((source) => ({
        title: source.title,
        text: clean(source.text, 160),
      })),
    });
  }

  if (mode === "table") {
    return JSON.stringify({
      title: "Comparación",
      columns: ["Fuente", "Tipo", "Idea"],
      rows: sources.slice(0, 8).map((source) => [source.title, source.kind, clean(source.text, 120)]),
    });
  }

  const excerpts = sources.map((source) => `${source.title}: ${clean(source.text, 280)}`).join("\n");
  const focus = question ? `Sobre «${question}». ` : "";
  return `${focus}Con las fuentes cargadas (${titles}) esto es lo que sí está escrito:\n\n${excerpts}`;
}

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    question?: unknown;
    sources?: unknown;
  } | null;

  const mode = body?.mode;
  if (typeof mode !== "string" || !modes.has(mode as NotebookMode)) {
    return NextResponse.json({ error: "Modo de notebook no válido." }, { status: 400 });
  }

  const notebookMode = mode as NotebookMode;
  const question = typeof body?.question === "string" ? clean(body.question, 4000) : "";
  const sources = Array.isArray(body?.sources) ? body.sources.filter(isSource).slice(0, 12) : [];

  if (sources.length === 0) {
    return NextResponse.json(
      { error: "Agrega al menos una fuente antes de consultar." },
      { status: 400 },
    );
  }

  const prepared = sources.map((source) => ({
    ...source,
    title: clean(source.title, 140),
    text: source.text.trim().slice(0, 12000),
  }));

  const { apiKey, model } = geminiCredentials();
  if (!apiKey) {
    return NextResponse.json({
      mode: "preview",
      model: "gemini-2.5-flash",
      text: previewAnswer(notebookMode, question, prepared),
    });
  }

  const corpus = prepared
    .map((source) => `# ${source.title} (${source.kind})\n${source.text}`)
    .join("\n\n");

  const result = await withCharge(
    { userId: guard.user.id, amount: creditPrices.notebook, description: `Notebook · ${notebookLabels[notebookMode]}` },
    () => askGemini(apiKey, model, notebookMode, corpus, question),
  );
  if (!result.ok) return NextResponse.json({ error: result.error, credits: result.balance }, { status: result.status });

  return NextResponse.json({ mode: "live", model, text: result.value, credits: result.balance });
}

const notebookLabels: Record<NotebookMode, string> = {
  chat: "consulta",
  summary: "resumen",
  brief: "audio",
  quiz: "cuestionario",
  slides: "presentación",
  video: "guion",
  mindmap: "mapa mental",
  report: "informe",
  cards: "tarjetas",
  infographic: "infografía",
  table: "tabla",
};

async function askGemini(apiKey: string, model: string, notebookMode: NotebookMode, corpus: string, question: string) {
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
        generationConfig: {
          temperature: jsonModes.has(notebookMode) ? 0.3 : 0.45,
          maxOutputTokens: jsonModes.has(notebookMode) ? 4096 : 2048,
          ...(jsonModes.has(notebookMode) ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );

  const payload = await readJson(response);
  if (!response.ok) return { ok: false as const, error: providerError(payload, "Gemini no pudo responder.") };

  const text = extractGeminiText(payload);
  if (!text) return { ok: false as const, error: "Gemini devolvió una respuesta vacía." };
  return { ok: true as const, value: text };
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
