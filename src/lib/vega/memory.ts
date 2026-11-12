import { getPrisma } from "@/lib/prisma";
import {
  duplicateOf,
  MEMORY_MAX_LENGTH,
  memoryPrompt as renderMemoryPrompt,
  normalizeContent,
  parseKind,
  searchMemoryList,
  type MemoryItem,
  type MemoryKind,
} from "@/lib/vega/memory-logic";
import { findSecret, secretError } from "@/lib/vega/secret-filter";

export { MEMORY_MAX_LENGTH };
export const MEMORY_LIMIT = 200;

export type VegaMemoryView = { id: string; content: string; kind: MemoryKind; createdAt: string; updatedAt: string };

const select = { id: true, content: true, kind: true, createdAt: true, updatedAt: true } as const;

type Row = { id: string; content: string; kind: string; createdAt: Date; updatedAt: Date };

function view(row: Row): VegaMemoryView {
  return { id: row.id, content: row.content, kind: parseKind(row.kind), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export function asItems(memories: VegaMemoryView[]): MemoryItem[] {
  return memories.map(({ id, content, kind, updatedAt }) => ({ id, content, kind, updatedAt }));
}

export async function listMemories(userId: string): Promise<VegaMemoryView[]> {
  const rows = await getPrisma().vegaMemory.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: MEMORY_LIMIT,
    select,
  });
  return rows.map(view);
}

export type SaveMemoryResult =
  | { ok: true; memory: VegaMemoryView; duplicate: boolean; updated: boolean }
  | { ok: false; error: string };

/**
 * Guarda un recuerdo. Rechaza datos sensibles, no duplica y, si el dato es casi
 * igual a uno existente, lo actualiza en lugar de crear otro.
 */
export async function saveMemory(userId: string, raw: string, kindInput: unknown = "fact"): Promise<SaveMemoryResult> {
  const content = normalizeContent(raw);
  if (content.length < 3) return { ok: false, error: "El dato está vacío." };
  const secret = findSecret(raw);
  if (secret) return { ok: false, error: secretError(secret) };
  const kind = parseKind(kindInput);

  const prisma = getPrisma();
  const existing = await prisma.vegaMemory.findMany({ where: { userId }, select });
  const duplicate = duplicateOf(existing, content);
  if (duplicate?.match === "exact") return { ok: true, memory: view(duplicate.item), duplicate: true, updated: false };
  if (duplicate?.match === "similar") {
    await prisma.vegaMemory.updateMany({ where: { id: duplicate.item.id, userId }, data: { content, kind, updatedAt: new Date() } });
    return { ok: true, memory: view({ ...duplicate.item, content, kind, updatedAt: new Date() }), duplicate: false, updated: true };
  }

  if (existing.length >= MEMORY_LIMIT) {
    // El diario rota solo: se borra la entrada más vieja del diario.
    const oldestJournal = existing.filter((row) => row.kind === "journal").sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())[0];
    if (kind !== "journal" || !oldestJournal) {
      return { ok: false, error: `La memoria está llena (${MEMORY_LIMIT} datos). Borra algunos desde el panel Memoria.` };
    }
    await prisma.vegaMemory.deleteMany({ where: { id: oldestJournal.id, userId } });
  }
  const memory = await prisma.vegaMemory.create({ data: { userId, content, kind }, select });
  return { ok: true, memory: view(memory), duplicate: false, updated: false };
}

export async function searchMemories(userId: string, query: string, limit = 8) {
  const memories = await listMemories(userId);
  const found = searchMemoryList(asItems(memories), query, limit);
  return found;
}

export async function forgetMemory(userId: string, id: string) {
  const deleted = await getPrisma().vegaMemory.deleteMany({ where: { id, userId } });
  return deleted.count > 0;
}

export async function forgetAllMemories(userId: string) {
  const deleted = await getPrisma().vegaMemory.deleteMany({ where: { userId } });
  return deleted.count;
}

/** Compatibilidad: arma el bloque de memoria con todos los recuerdos dados. */
export function memoryPrompt(memories: VegaMemoryView[], omitted = 0) {
  return renderMemoryPrompt(asItems(memories), omitted);
}
