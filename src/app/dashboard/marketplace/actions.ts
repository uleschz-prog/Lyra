"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { moderateTemplate, publishTemplate, purchaseTemplate, unpublishTemplate, cloneTemplate } from "@/lib/marketplace/core";
import { ledgerCredits, marketDb, readOwnVersion } from "@/lib/marketplace/server";

type Fail = { ok: false; error: string };

async function viewer() {
  const user = await getCurrentUser();
  return user ? { id: user.id, role: user.role } : null;
}

export async function applyTemplateAction(templateId: string, requestKey: string) {
  const user = await viewer();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." } as Fail;
  if (typeof templateId !== "string" || typeof requestKey !== "string" || !/^[\w-]{8,64}$/.test(requestKey)) return { ok: false, error: "Solicitud no válida." } as Fail;
  const result = await cloneTemplate(marketDb(), { user, templateId, requestKey });
  if (result.ok) {
    revalidatePath("/dashboard/proyectos");
    revalidatePath("/dashboard/marketplace");
  }
  return result;
}

export async function buyTemplateAction(templateId: string) {
  const user = await viewer();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." } as Fail;
  if (typeof templateId !== "string") return { ok: false, error: "Solicitud no válida." } as Fail;
  const result = await purchaseTemplate(marketDb(), ledgerCredits, { user, templateId });
  if (result.ok) revalidatePath("/dashboard/wallet");
  return result;
}

export async function publishTemplateAction(input: {
  projectId: string;
  versionNumber?: number;
  title: string;
  description: string;
  category: string;
  tags: string;
  price: number;
}) {
  const user = await viewer();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." } as Fail;
  if (!input || typeof input.projectId !== "string" || typeof input.title !== "string" || typeof input.description !== "string" || typeof input.category !== "string") {
    return { ok: false, error: "Los datos de la plantilla no son válidos." } as Fail;
  }
  const result = await publishTemplate(marketDb(), { user, ...input }, readOwnVersion);
  if (result.ok) revalidatePath("/dashboard/marketplace");
  return result;
}

export async function unpublishTemplateAction(id: string) {
  const user = await viewer();
  if (!user || typeof id !== "string") return { ok: false, error: "Inicia sesión para continuar." } as Fail;
  const result = await unpublishTemplate(marketDb(), { user, id });
  revalidatePath("/dashboard/marketplace");
  revalidatePath("/dashboard/marketplace/mis-plantillas");
  return result;
}

export async function moderateTemplateAction(id: string, decision: "approve" | "reject", reason?: string) {
  const user = await viewer();
  if (!user || typeof id !== "string" || (decision !== "approve" && decision !== "reject")) return { ok: false, error: "Solicitud no válida." } as Fail;
  const result = await moderateTemplate(marketDb(), { admin: user, id, decision, reason: typeof reason === "string" ? reason : undefined });
  revalidatePath("/dashboard/marketplace");
  revalidatePath("/dashboard/marketplace/moderacion");
  return result;
}
