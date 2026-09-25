"use server";

import { parseAgent } from "@/lib/agent-document";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import { executeAgent, runProjectFlows } from "@/lib/project-runtime";
import { insertProjectRow } from "@/lib/project-tables";

export async function addProjectRow(projectId: string, tableName: string, values: Record<string, string>) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "La sesión expiró." };
  if (!projectId || !tableName) return { ok: false as const, error: "Esa tabla no está en el proyecto." };

  const saved = await insertProjectRow(user.id, projectId, tableName.slice(0, 40), values);
  if (!saved.ok) return saved;

  const runs = await runProjectFlows(user.id, projectId, tableName.slice(0, 40), saved.row.values).catch(() => []);
  return { ...saved, runs };
}

export async function publishProject(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "La sesión expiró." };

  const updated = await getPrisma().project.updateMany({
    where: { id: projectId, userId: user.id, kind: "site" },
    data: { published: true },
  });
  if (updated.count === 0) return { ok: false as const, error: "Ese sitio no está en tu cuenta." };
  return { ok: true as const, href: `/s/${projectId}` };
}

export async function askProjectAgent(projectId: string, message: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "La sesión expiró." };
  const text = message.trim().slice(0, 500);
  if (text.length < 2) return { ok: false as const, error: "Escribe un mensaje para el agente." };

  const project = await getPrisma().project.findFirst({
    where: { id: projectId, userId: user.id, kind: "agent" },
    select: { ui: true },
  });
  const agent = parseAgent(project?.ui);
  if (!agent) return { ok: false as const, error: "El agente todavía no está listo." };

  const output = await executeAgent(agent, text);
  return { ok: true as const, output };
}
