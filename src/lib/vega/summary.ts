import { after } from "next/server";

import { generateText } from "@/lib/ai/generate";
import { getPrisma } from "@/lib/prisma";
import { redactSecrets } from "@/lib/vega/secret-filter";

/** Mensajes recientes que el modelo ve completos en cada turno. */
export const HISTORY = 24;
/** Se resume cuando hay más de HISTORY + SUMMARY_SLACK mensajes sin resumir. */
export const SUMMARY_SLACK = 8;
const SUMMARY_MAX_CHARS = 4_000;
const SUMMARY_BATCH = 200;

/** ¿Hace falta resumir? Devuelve cuántos mensajes viejos entran en el resumen. */
export function planSummary(unsummarized: number) {
  if (unsummarized <= HISTORY + SUMMARY_SLACK) return { due: false as const, take: 0 };
  return { due: true as const, take: Math.min(unsummarized - HISTORY, SUMMARY_BATCH) };
}

export function summaryPrompt(previous: string | null, messages: { role: string; content: string }[]) {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "Socio" : "Vega"}: ${message.content.replace(/\s+/g, " ").trim().slice(0, 1_500)}`)
    .join("\n");
  return {
    system: [
      "Resumes conversaciones entre un socio de LYRA y su asistente Vega para que Vega recuerde el contexto.",
      "Escribe en español, en viñetas breves: decisiones, datos del socio, pendientes, compromisos, nombres, fechas y cifras importantes.",
      "Conserva lo que sigue vigente y descarta saludos y relleno. Máximo 250 palabras.",
      "Nunca incluyas contraseñas, números de tarjeta, llaves de API ni datos bancarios.",
    ].join("\n"),
    user: [previous ? `Resumen anterior:\n${previous}` : "", `Mensajes nuevos para integrar:\n${transcript}`].filter(Boolean).join("\n\n"),
  };
}

type Generate = typeof generateText;

/** Resume los mensajes viejos de una conversación si ya es larga. Nunca lanza. */
export async function maybeSummarizeConversation(conversationId: string, generate: Generate = generateText) {
  try {
    const prisma = getPrisma();
    const conversation = await prisma.vegaConversation.findUnique({
      where: { id: conversationId },
      select: { summary: true, summaryThrough: true },
    });
    if (!conversation) return { summarized: false as const };
    const after_ = conversation.summaryThrough ? { createdAt: { gt: conversation.summaryThrough } } : {};
    const unsummarized = await prisma.vegaMessage.count({ where: { conversationId, ...after_ } });
    const plan = planSummary(unsummarized);
    if (!plan.due) return { summarized: false as const };

    const older = await prisma.vegaMessage.findMany({
      where: { conversationId, ...after_ },
      orderBy: { createdAt: "asc" },
      take: plan.take,
      select: { role: true, content: true, createdAt: true },
    });
    if (older.length === 0) return { summarized: false as const };
    const prompt = summaryPrompt(conversation.summary, older);
    const result = await generate({ ...prompt, temperature: 0.2 });
    if (result.mode !== "live" || !result.text.trim()) return { summarized: false as const };

    const summary = redactSecrets(result.text.trim()).slice(0, SUMMARY_MAX_CHARS);
    await prisma.vegaConversation.update({
      where: { id: conversationId },
      data: { summary, summaryThrough: older[older.length - 1].createdAt },
    });
    return { summarized: true as const, messages: older.length };
  } catch (error) {
    console.error("[Vega summary] failed", error instanceof Error ? error.name : typeof error);
    return { summarized: false as const };
  }
}

/** Programa el resumen para después de responder; fuera de una petición, lo corre en segundo plano. */
export function scheduleSummary(conversationId: string) {
  const run = () => maybeSummarizeConversation(conversationId).then(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

export function summaryContext(summary: string | null | undefined) {
  if (!summary) return "";
  return `Resumen de la parte anterior de esta conversación (mensajes que ya no ves completos):\n${summary}`;
}
