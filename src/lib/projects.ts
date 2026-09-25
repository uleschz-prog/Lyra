import type { Prisma, PrismaClient } from "@prisma/client";

import { inferProjectKind, type ProjectKind } from "@/lib/project-kind";
import { getPrisma } from "@/lib/prisma";

type ProjectDb = PrismaClient | Prisma.TransactionClient;

export function normalizeIdea(value: string) {
  const idea = value.trim().replace(/\s+/g, " ").slice(0, 240);
  if (idea.length < 8) return null;
  const title = idea.length > 72 ? `${idea.slice(0, 69).trimEnd()}…` : idea;
  return { idea, title };
}

export async function ensureProject(db: ProjectDb, userId: string, raw: string, hintedKind?: string | null) {
  const project = normalizeIdea(raw);
  if (!project) return null;
  const kind: ProjectKind = inferProjectKind(project.idea, hintedKind);

  const existing = await db.project.findFirst({
    where: { userId, idea: project.idea },
    select: { id: true },
  });
  if (existing) return existing;

  return db.project.create({
    data: { userId, title: project.title, idea: project.idea, kind },
    select: { id: true },
  });
}

export async function listProjects(userId: string) {
  if (!process.env.DATABASE_URL) return [];

  return getPrisma().project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, title: true, idea: true, kind: true, createdAt: true },
  });
}
