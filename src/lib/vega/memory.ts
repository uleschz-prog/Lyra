import { getPrisma } from "@/lib/prisma";

export const MEMORY_LIMIT = 100;
export const MEMORY_MAX_LENGTH = 300;

export type VegaMemoryView = { id: string; content: string; createdAt: string };

function normalize(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, MEMORY_MAX_LENGTH);
}

export async function listMemories(userId: string): Promise<VegaMemoryView[]> {
  const rows = await getPrisma().vegaMemory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: MEMORY_LIMIT,
    select: { id: true, content: true, createdAt: true },
  });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function saveMemory(userId: string, raw: string) {
  const content = normalize(raw);
  if (content.length < 3) return { ok: false as const, error: "El dato está vacío." };
  const prisma = getPrisma();
  const existing = await prisma.vegaMemory.findFirst({
    where: { userId, content: { equals: content, mode: "insensitive" } },
    select: { id: true, content: true, createdAt: true },
  });
  if (existing) return { ok: true as const, memory: { ...existing, createdAt: existing.createdAt.toISOString() }, duplicate: true };

  const count = await prisma.vegaMemory.count({ where: { userId } });
  if (count >= MEMORY_LIMIT) {
    return { ok: false as const, error: `La memoria está llena (${MEMORY_LIMIT} datos). Borra algunos desde el panel Memoria.` };
  }
  const memory = await prisma.vegaMemory.create({ data: { userId, content }, select: { id: true, content: true, createdAt: true } });
  return { ok: true as const, memory: { ...memory, createdAt: memory.createdAt.toISOString() }, duplicate: false };
}

export async function forgetMemory(userId: string, id: string) {
  const deleted = await getPrisma().vegaMemory.deleteMany({ where: { id, userId } });
  return deleted.count > 0;
}

export async function forgetAllMemories(userId: string) {
  const deleted = await getPrisma().vegaMemory.deleteMany({ where: { userId } });
  return deleted.count;
}

export function memoryPrompt(memories: VegaMemoryView[]) {
  if (memories.length === 0) {
    return "Todavía no recuerdas nada del socio. Cuando comparta un dato duradero, guárdalo con recordar.";
  }
  const lines = [...memories].reverse().map((memory) => `- [${memory.id}] ${memory.content}`);
  return [
    "Lo que recuerdas del socio (de conversaciones anteriores). Úsalo con naturalidad, sin recitarlo:",
    ...lines,
  ].join("\n");
}
