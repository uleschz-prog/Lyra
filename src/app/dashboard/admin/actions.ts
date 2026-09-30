"use server";

import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { compensationPlan, getPackage, isSignupPlanId } from "@/config/compensation-plan";
import { getCurrentUser } from "@/lib/auth/profile";
import { INDEFINITE_YEAR } from "@/lib/auth/suspension";
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
    select: { id: true, name: true, role: true, sponsorId: true, pendingPackage: true, credits: true, package: true },
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
  const user = await target(id);
  if (!user) return { ok: false, error: "Esa cuenta ya no existe." };
  if (user.credits + amount < 0) return { ok: false, error: `Solo tiene ${user.credits} créditos para quitar.` };

  const prisma = getPrisma();
  const credits = await prisma.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id, credits: { gte: Math.max(-amount, 0) } },
      data: { credits: { increment: amount } },
    });
    if (changed.count === 0) return null;
    const updated = await tx.user.findUniqueOrThrow({ where: { id }, select: { credits: true } });
    const wallet = await tx.creditWallet.upsert({
      where: { userId: id },
      create: { userId: id, balance: updated.credits },
      update: { balance: updated.credits },
    });
    await tx.transaction.create({
      data: {
        userId: id,
        walletId: wallet.id,
        amount: 0,
        creditDelta: amount,
        kind: "ADJUSTMENT",
        description: `${amount > 0 ? "Créditos añadidos" : "Créditos retirados"} por administración${note.trim() ? ` · ${note.trim().slice(0, 120)}` : ""}`,
      },
    });
    return updated.credits;
  });
  if (credits === null) return { ok: false, error: "El saldo cambió y ya no alcanza para quitar esa cantidad." };
  done();
  return { ok: true, credits };
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

export async function changePackage(id: string, packageId: string): Promise<Result<{ package: string }>> {
  if (!(await requireAdmin())) return denied;
  if (!isSignupPlanId(packageId)) return { ok: false, error: "Ese paquete no es válido." };
  const user = await target(id);
  if (!user) return { ok: false, error: "Esa cuenta ya no existe." };
  if (user.package === packageId) return { ok: false, error: "La cuenta ya tiene ese paquete." };

  await getPrisma().user.update({
    where: { id },
    data: { package: packageId, pendingPackage: null },
  });
  done();
  return { ok: true, package: packageId };
}

const USDT_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

/// Dirección TRC20 (Tron) que empieza con T y tiene 34 caracteres.
async function isValidUsdtTrc20(value: string) {
  return USDT_RE.test(value.trim());
}

export async function setUsdtWallet(id: string, address: string): Promise<Result<{ usdtTrc20: string | null }>> {
  if (!(await requireAdmin())) return denied;
  const value = address.trim();
  if (value && !(await isValidUsdtTrc20(value))) {
    return { ok: false, error: "La dirección USDT TRC20 debe empezar con T y tener 34 caracteres." };
  }
  const user = await target(id);
  if (!user) return { ok: false, error: "Esa cuenta ya no existe." };
  await getPrisma().user.update({ where: { id }, data: { usdtTrc20: value || null } });
  done();
  return { ok: true, usdtTrc20: value || null };
}

export async function getCommissionHistory(id: string, limit = 50): Promise<Result<{ rows: { id: string; kind: string; description: string; amount: number; createdAt: string }[] }>> {
  if (!(await requireAdmin())) return denied;
  const rows = await getPrisma().transaction.findMany({
    where: { userId: id, kind: { in: ["COMMISSION", "PAYOUT"] } },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, Math.trunc(limit))),
    select: { id: true, kind: true, description: true, amount: true, createdAt: true },
  });
  return {
    ok: true,
    rows: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      description: row.description,
      amount: Number(row.amount) || 0,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/// Corte de comisiones: marca las comisiones acumuladas como liquidadas.
/// Paga el saldo de comisiones de cada socio a su wallet USDT TRC20 y deja la bitácora.
export async function settleCommissions(note: string): Promise<Result<{ settled: number; total: number; skipped: number }>> {
  if (!(await requireAdmin())) return denied;
  const prisma = getPrisma();
  const members = await prisma.user.findMany({
    where: { walletBalance: { gt: 0 }, role: { not: "ADMIN" } },
    select: { id: true, name: true, walletBalance: true, usdtTrc20: true },
    orderBy: { walletBalance: "desc" },
  });
  if (members.length === 0) return { ok: false, error: "No hay comisiones pendientes por entregar." };

  const label = note.trim() ? ` · ${note.trim().slice(0, 80)}` : "";
  let settled = 0;
  let total = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const member of members) {
      const amount = Math.round(member.walletBalance * 100) / 100;
      if (amount <= 0) continue;
      const wallet = await tx.creditWallet.upsert({
        where: { userId: member.id },
        create: { userId: member.id, balance: 0, totalEarnedCommissions: 0 },
        update: {},
      });
      await tx.user.update({ where: { id: member.id }, data: { walletBalance: { decrement: amount } } });
      await tx.transaction.create({
        data: {
          userId: member.id,
          walletId: wallet.id,
          amount: -amount,
          creditDelta: 0,
          kind: "PAYOUT",
          description: `Corte de comisiones${label}${member.usdtTrc20 ? ` · USDT TRC20 ${member.usdtTrc20}` : " · sin wallet USDT"}`,
        },
      });
      settled += 1;
      total += amount;
      if (!member.usdtTrc20) skipped += 1;
    }
  });

  done();
  return { ok: true, settled, total: Math.round(total * 100) / 100, skipped };
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
