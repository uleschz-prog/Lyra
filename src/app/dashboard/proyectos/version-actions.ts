"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import { restoreProjectVersion } from "@/lib/projects/restore";

type Result = { ok: true; versionNumber: number } | { ok: false; error: string };

/** «Restaurar esta versión»: copia una versión anterior como versión nueva (no borra nada). */
export async function restoreVersionAction(projectId: string, number: number, requestKey: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const result = await restoreProjectVersion(getPrisma(), { userId: user.id, projectId, number, requestKey });
  if (result.ok) revalidatePath(`/dashboard/proyectos/${projectId}`);
  return result;
}
