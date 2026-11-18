"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import { publishProject, unpublishProject, type PublishView } from "@/lib/publish/core";

type Result = { ok: true; publish?: PublishView } | { ok: false; error: string };

export async function publishProjectAction(projectId: string, input: { slug: string; versionNumber: number; indexable: boolean }): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const result = await publishProject(getPrisma(), { userId: user.id, projectId, slug: input.slug, versionNumber: input.versionNumber, indexable: input.indexable });
  if (!result.ok) return result;
  revalidatePath(`/dashboard/proyectos/${projectId}`);
  return { ok: true, publish: result.publish };
}

export async function unpublishProjectAction(projectId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const result = await unpublishProject(getPrisma(), { userId: user.id, projectId });
  if (!result.ok) return result;
  revalidatePath(`/dashboard/proyectos/${projectId}`);
  return { ok: true };
}
