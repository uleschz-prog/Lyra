"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import { ensureProject } from "@/lib/projects";

export async function createOfficeProject(idea: string, kind?: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "La sesión expiró." };

  const project = await ensureProject(getPrisma(), user.id, idea, kind).catch(() => null);
  if (!project) return { ok: false as const, error: "Describe la idea con un poco más de detalle." };

  redirect(`/dashboard/projects/${project.id}`);
}
