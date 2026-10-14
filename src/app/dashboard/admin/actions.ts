"use server";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { compensationPlan, getPackage, isSignupPlanId } from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { INDEFINITE_YEAR } from "@/lib/auth/suspension";
import { creditCredits, debitCredits } from "@/lib/credits/ledger";
import { activateMembership } from "@/lib/payments/activate";
import { getPrisma } from "@/lib/prisma";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin?.role === "ADMIN" ? admin : null;
}

const denied = { ok: false as const, error: "Solo la cuenta administradora puede hacer esto." };

async function target(id: string) {
  return getPrisma().user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, sponsorId: true, pendingPackage: true },
  });
}

function done() {
  revalidatePath("/dashboard/admin");
}

export async function validateRegistration(id: string): Promise<Result> {
  if (!(await requireAdmin())) return denied;
  const user = await target(id);
  if (!user?.pendingPackage || !isSignupPlanId(user.pendingPackage)) {
    return { ok: false, error: "Esa cuenta no tiene una inscripción pendiente." };
  }
  const packageId = user.pendingPackage;
  const activated = await getPrisma().$transaction((tx) =>
    activateMembership(tx, user, packageId, {
      description: `Inscripción ${getPackage(packageId).label} · validada por administración`,
    }),
  );
  if (!activated) return { ok: false, error: "La inscripción ya estaba activa." };
  done();
  return { ok: true };
}

export async function adjustCredits(id: string, delta: number, note: string): Promise<Result<{ credits: number }>> {
  if (!(await requireAdmin())) return denied;
  const amount = Math.trunc(delta);
  if (!amount || Math.abs(amount) > 1_000_000) return { ok: false, error: "Escribe una cantidad válida de créditos." };
  if (!(await target(id))) return { ok: false, error: "Esa cuenta ya no existe." };

  const description = `${amount > 0 ? "Créditos añadidos" : "Créditos retirados"} por administración${note.trim() ? ` · ${note.trim().slice(0, 120)}` : ""}`;
  const result =
    amount > 0
      ? await creditCredits({
          userId: id,
          credits: amount,
          kind: "ADJUSTMENT",
          reason: "admin.adjust",
          description,
          amountUsd: 0,
        })
      : await debitCredits({
          userId: id,
          credits: -amount,
          kind: "ADJUSTMENT",
          reason: "admin.adjust",
          description,
          amountUsd: 0,
        });

  if (!result.ok) {
    if (result.code === "missing") return { ok: false, error: "Esa cuenta ya no existe." };
    if (result.code === "insufficient") return { ok: false, error: `Solo tiene ${result.balance} créditos para quitar.` };
    return { ok: false, error: "No se pudo ajustar el saldo." };
  }
  done();
  return { ok: true, credits: result.balance };
}

export async function updateProfile(id: string, input: { name: string; email: string }): Promise<Result> {
  if (!(await requireAdmin())) return denied;
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "El nombre necesita entre 2 y 80 caracteres." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return { ok: false, error: "El correo no es válido." };
  try {
    await getPrisma().user.update({ where: { id }, data: { name, email } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Ese correo ya lo usa otra cuenta." };
    }
    throw error;
  }
  done();
  return { ok: true };
}

export async function resetPassword(id: string, requested: string): Promise<Result<{ password: string }>> {
  if (!(await requireAdmin())) return denied;
  const password = requested.trim() || `Lyra-${randomBytes(5).toString("hex")}`;
  if (password.length < 8 || password.length > 72) return { ok: false, error: "La contraseña necesita entre 8 y 72 caracteres." };
  if (!(await target(id))) return { ok: false, error: "Esa cuenta ya no existe." };
  await getPrisma().user.update({ where: { id }, data: { password: await bcrypt.hash(password, 12) } });
  return { ok: true, password };
}

export async function suspendAccount(id: string, days: number | "indefinite" | "lift"): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  const user = await target(id);
  if (!user) return { ok: false, error: "Esa cuenta ya no existe." };
  if (user.role === "ADMIN" || user.id === admin.id) return { ok: false, error: "La cuenta administradora no se puede suspender." };

  const suspendedUntil =
    days === "lift"
      ? null
      : days === "indefinite"
        ? new Date(Date.UTC(INDEFINITE_YEAR, 0, 1))
        : new Date(Date.now() + Math.max(1, Math.min(365, Math.trunc(days))) * 86_400_000);
  await getPrisma().user.update({ where: { id }, data: { suspendedUntil } });
  done();
  return { ok: true };
}

async function rebuildUpline(tx: Prisma.TransactionClient, userId: string) {
  const links: { userId: string; ancestorId: string; depth: number }[] = [];
  const seen = new Set([userId]);
  let cursor = (await tx.user.findUnique({ where: { id: userId }, select: { sponsorId: true } }))?.sponsorId ?? null;
  while (cursor && links.length < compensationPlan.unilevel.length && !seen.has(cursor)) {
    seen.add(cursor);
    links.push({ userId, ancestorId: cursor, depth: links.length + 1 });
    cursor = (await tx.user.findUnique({ where: { id: cursor }, select: { sponsorId: true } }))?.sponsorId ?? null;
  }
  await tx.networkRelation.deleteMany({ where: { userId } });
  if (links.length > 0) await tx.networkRelation.createMany({ data: links });
}

export async function deleteAccount(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  const user = await target(id);
  if (!user) return { ok: false, error: "Esa cuenta ya no existe." };
  if (user.role === "ADMIN" || user.id === admin.id) return { ok: false, error: "La cuenta administradora no se puede borrar." };

  await getPrisma().$transaction(
    async (tx) => {
      const affected = await tx.networkRelation.findMany({ where: { ancestorId: id }, select: { userId: true } });
      await tx.user.updateMany({ where: { sponsorId: id }, data: { sponsorId: user.sponsorId } });
      await tx.user.delete({ where: { id } });
      for (const { userId } of affected) await rebuildUpline(tx, userId);
    },
    { timeout: 60_000 },
  );
  done();
  return { ok: true };
}
