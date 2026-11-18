"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

type Result = { ok: true } | { ok: false; error: string };

export async function setLeadReadAction(
  leadId: string,
  read: boolean,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const updated = await getPrisma().projectLead.updateMany({
    where: { id: leadId, userId: user.id },
    data: { read: read === true },
  });
  if (!updated.count)
    return { ok: false, error: "No encontramos ese contacto." };
  return { ok: true };
}

export async function markAllLeadsReadAction(
  projectId: string,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  await getPrisma().projectLead.updateMany({
    where: { projectId, userId: user.id, read: false },
    data: { read: true },
  });
  revalidatePath(`/dashboard/proyectos/${projectId}`);
  revalidatePath(`/dashboard/proyectos/${projectId}/contactos`);
  return { ok: true };
}
