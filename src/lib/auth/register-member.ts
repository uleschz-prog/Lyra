import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { compensationPlan, getPackage, isSignupPlanId, type SignupPlanId } from "@/config/compensation-plan";
import { payCommissions } from "@/lib/compensation/payout";
import { mercadoPagoReady } from "@/lib/payments/mercadopago";
import { getPrisma } from "@/lib/prisma";
import { ensureProject } from "@/lib/projects";

const usernamePattern = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/;

export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RegisterInput = {
  name: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  packageId: string;
  ref: string;
  idea?: string;
  kind?: string;
  code?: string;
};

function clean(input: RegisterInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();
  const packageId = input.packageId.trim();
  const ref = input.ref.trim() || "LYRA-ROOT";
  const idea = input.idea?.trim().slice(0, 240) ?? "";
  const code = input.code?.trim().toUpperCase().slice(0, 24) ?? "";

  if (name.length < 2 || name.length > 80) {
    throw new AuthError(400, "Escribe tu nombre completo.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new AuthError(400, "El correo no es válido.");
  }
  if (!usernamePattern.test(username)) {
    throw new AuthError(400, "El usuario usa minúsculas, números y guiones, entre 3 y 24 caracteres.");
  }
  if (input.password.length < 8 || input.password.length > 72) {
    throw new AuthError(400, "La contraseña necesita entre 8 y 72 caracteres.");
  }
  if (input.password !== input.confirmPassword) {
    throw new AuthError(400, "La confirmación no coincide con la contraseña.");
  }
  if (!code && !isSignupPlanId(packageId)) {
    throw new AuthError(400, "Elige Started, Pro, Founder o Corporate.");
  }

  return { name, email, username, packageId, ref, idea, code, kind: input.kind, password: input.password };
}

function paymentsRequired() {
  return mercadoPagoReady() || process.env.NODE_ENV === "production";
}

export async function findSponsorByRef(ref: string) {
  if (!process.env.DATABASE_URL) return null;
  const prisma = getPrisma();
  const code = ref.trim();
  if (!code) return null;

  return prisma.user.findFirst({
    where: {
      OR: [{ referralCode: code.toUpperCase() }, { username: code.toLowerCase() }],
    },
    select: { id: true, name: true, username: true },
  });
}

export async function registerMember(input: RegisterInput) {
  if (!process.env.DATABASE_URL) {
    throw new AuthError(503, "La base de datos no está configurada.");
  }

  const data = clean(input);
  const prisma = getPrisma();
  const sponsor = await prisma.user.findFirst({
    where: {
      OR: [{ referralCode: data.ref.toUpperCase() }, { username: data.ref.toLowerCase() }],
    },
    select: { id: true, name: true, username: true, sponsorId: true, package: true },
  });

  if (!sponsor) {
    throw new AuthError(404, "No encontramos al patrocinador de ese enlace.");
  }

  const activation = data.code
    ? await prisma.activationCode.findUnique({
        where: { code: data.code },
        select: { id: true, packageId: true, usedById: true },
      })
    : null;
  if (data.code && (!activation || activation.usedById)) {
    throw new AuthError(400, "Ese código de activación no es válido o ya se usó.");
  }
  const packageId = (activation?.packageId ?? data.packageId) as SignupPlanId;
  if (!isSignupPlanId(packageId)) {
    throw new AuthError(400, "Ese código no corresponde a una membresía vigente.");
  }

  const upline = [sponsor];
  const seen = new Set<string>([sponsor.id]);
  let cursor = sponsor.sponsorId;

  while (cursor && upline.length < compensationPlan.unilevel.length && !seen.has(cursor)) {
    seen.add(cursor);
    const ancestor = await prisma.user.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, username: true, sponsorId: true, package: true },
    });
    if (!ancestor) break;
    upline.push(ancestor);
    cursor = ancestor.sponsorId;
  }

  const planPackage = getPackage(packageId);
  const password = await bcrypt.hash(data.password, 12);
  const pending = !activation && paymentsRequired();
  const credits = pending ? 0 : planPackage.credits;

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          username: data.username,
          password,
          role: "MEMBER",
          package: pending ? "NONE" : packageId,
          pendingPackage: pending ? packageId : null,
          activatedWithCode: Boolean(activation),
          activationCredits: !pending && "activationCredits" in planPackage ? planPackage.activationCredits : 0,
          rank: "ASTRA",
          sponsorId: sponsor.id,
          referralCode: data.username.toUpperCase(),
          credits,
          walletBalance: 0,
          alphaFastTrackUntil: null,
          wallet: {
            create: {
              balance: credits,
              totalEarnedCommissions: 0,
            },
          },
        },
        select: { id: true, name: true },
      });

      await tx.networkRelation.createMany({
        data: upline.map((ancestor, index) => ({
          userId: created.id,
          ancestorId: ancestor.id,
          depth: index + 1,
        })),
      });

      if (activation) {
        const claimed = await tx.activationCode.updateMany({
          where: { id: activation.id, usedById: null },
          data: { usedById: created.id, usedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new AuthError(409, "Ese código de activación ya se usó.");
        }
      } else if (!pending) {
        await payCommissions(
          tx,
          { id: created.id, name: created.name, sponsorId: sponsor.id, package: packageId },
          planPackage.price,
          "purchase",
        );
      }

      await ensureProject(tx, created.id, data.idea, data.kind);

      return { ...created, pending };
    });

    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = JSON.stringify(error.meta?.target ?? "");
      if (target.includes("email")) {
        throw new AuthError(409, "Ese correo ya tiene una cuenta.");
      }
      throw new AuthError(409, "Ese nombre de usuario ya está en uso.");
    }
    throw error;
  }
}
