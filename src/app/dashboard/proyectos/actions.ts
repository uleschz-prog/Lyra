"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

type Result = { ok: true } | { ok: false; error: string };

export async function renameProject(id: string, title: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (clean.length < 2) return { ok: false, error: "Escribe un nombre de al menos 2 letras." };
  // El título visible cambia; la llave de agrupación no, para que Vega siga sumando versiones al mismo proyecto.
  const updated = await getPrisma().project.updateMany({
    where: { id, userId: user.id, deletedAt: null },
    data: { title: clean },
  });
  if (!updated.count) return { ok: false, error: "No encontramos ese proyecto." };
  revalidatePath("/dashboard/proyectos");
  revalidatePath(`/dashboard/proyectos/${id}`);
  return { ok: true };
}

/** Borrado suave: el proyecto desaparece de la lista pero sus versiones siguen guardadas. */
export async function deleteProject(id: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const updated = await getPrisma().project.updateMany({
    where: { id, userId: user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!updated.count) return { ok: false, error: "No encontramos ese proyecto." };
  revalidatePath("/dashboard/proyectos");
  return { ok: true };
}
