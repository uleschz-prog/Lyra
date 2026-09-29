import { generateText } from "@/lib/ai/generate";

export type AgentDocument = {
  name: string;
  instruction: string;
  greeting: string;
  prompts: string[];
};

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function draftAgent(idea: string, title: string): AgentDocument {
  const name = title.length > 42 ? `${title.slice(0, 39).trimEnd()}…` : title;
  return {
    name: name || "Asistente",
    instruction: `Ayuda con esta tarea: ${idea}. Responde en español, con un siguiente paso concreto. No prometas resultados que no puedas cumplir.`,
    greeting: "Cuéntame qué necesitas y te dejo el siguiente paso.",
    prompts: ["¿Qué puedes hacer?", "Ayúdame con el primer mensaje", "Resume cómo debes atender"],
  };
}

export function parseAgent(raw: unknown): AgentDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const name = clip(record.name, 60);
  const instruction = clip(record.instruction, 500);
  const greeting = clip(record.greeting, 180);
  const prompts = Array.isArray(record.prompts)
    ? record.prompts.map((item) => clip(item, 80)).filter((item) => item.length > 0).slice(0, 3)
    : [];
  if (!name || !instruction) return null;
  return {
    name,
    instruction,
    greeting: greeting || "¿En qué te ayudo?",
    prompts: prompts.length > 0 ? prompts : ["¿Qué puedes hacer?"],
  };
}

function parseModelAgent(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return parseAgent(JSON.parse(candidate.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export async function generateAgent(idea: string, title: string) {
  try {
    const result = await generateText({
      temperature: 0.4,
      system: `Define un agente de LYRA. Responde solo JSON válido, en español, sin markdown.
{"name":"","instruction":"","greeting":"","prompts":["",""]}
La instrucción dice cómo atiende, en qué tono y cuál es el siguiente paso. Tres preguntas cortas para empezar la conversación. Sin promesas de ingreso.`,
      user: idea,
    });
    if (result.mode === "live") {
      const agent = parseModelAgent(result.text);
      if (agent) return agent;
    }
  } catch {
    return draftAgent(idea, title);
  }
  return draftAgent(idea, title);
}
