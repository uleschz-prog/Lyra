import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { debitCredits, readCreditBalance, refundCredits } from "@/lib/credits/ledger";
import type { AuthProfile, WalletTransaction } from "@/lib/types";

type AiUser = Pick<AuthProfile, "id" | "role" | "package" | "credits">;

export async function requireAiUser(): Promise<{ user: AiUser; response: null } | { user: null; response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Inicia sesión para usar la IA." }, { status: 401 }),
    };
  }
  return { user, response: null };
}

export function idempotencyKeyFrom(request: Request, bodyKey?: unknown) {
  const header = request.headers.get("idempotency-key") ?? "";
  const body = typeof bodyKey === "string" ? bodyKey : "";
  const raw = (header || body).trim();
  if (/^[A-Za-z0-9:_-]{8,80}$/.test(raw)) return raw;
  return crypto.randomUUID();
}

export function aiJson(body: Record<string, unknown>, status: number, balance: number) {
  const response = NextResponse.json({ ...body, balance }, { status });
  response.headers.set("x-credit-balance", String(balance));
  response.headers.set("cache-control", "no-store");
  return response;
}

export function withCreditHeader(response: NextResponse, balance: number) {
  response.headers.set("x-credit-balance", String(balance));
  response.headers.set("cache-control", "no-store");
  return response;
}

type ChargeSuccess<T> = {
  ok: true;
  value: T;
  balance: number;
  charged: number;
  transaction: WalletTransaction | null;
};

type ChargeFailure = {
  ok: false;
  status: 402 | 409 | 502;
  error: string;
  balance: number;
};

export async function chargeAiCall<T>(input: {
  userId: string;
  cost: number;
  reason: string;
  description: string;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonValue;
  execute: () => Promise<T>;
}): Promise<ChargeSuccess<T> | ChargeFailure> {
  if (!Number.isInteger(input.cost) || input.cost < 0) {
    const balance = await readCreditBalance(input.userId);
    return { ok: false, status: 402, error: "El precio de esta operación no es válido.", balance };
  }

  if (input.cost === 0) {
    try {
      const value = await input.execute();
      return { ok: true, value, balance: await readCreditBalance(input.userId), charged: 0, transaction: null };
    } catch (error) {
      return {
        ok: false,
        status: 502,
        error: error instanceof Error ? error.message : "El modelo no pudo responder.",
        balance: await readCreditBalance(input.userId).catch(() => 0),
      };
    }
  }

  const externalRef = `ai:${input.reason}:${input.userId}:${input.idempotencyKey}`.slice(0, 160);
  const debit = await debitCredits({
    userId: input.userId,
    credits: input.cost,
    externalRef,
    reason: input.reason,
    description: input.description,
    metadata: input.metadata,
  });

  if (!debit.ok) {
    return {
      ok: false,
      status: 402,
      error:
        debit.code === "insufficient"
          ? `Necesitas ${input.cost} créditos y tienes ${debit.balance}.`
          : "No se pudo cobrar la operación.",
      balance: debit.balance,
    };
  }

  if (debit.already) {
    return {
      ok: false,
      status: 409,
      error: "Esa operación ya se procesó.",
      balance: debit.balance,
    };
  }

  try {
    const value = await input.execute();
    return { ok: true, value, balance: debit.balance, charged: input.cost, transaction: debit.transaction };
  } catch (error) {
    const refund = await refundCredits({
      userId: input.userId,
      credits: input.cost,
      externalRef: `${externalRef}:refund`,
      reason: `${input.reason}.refund`.slice(0, 80),
      description: `Reembolso · ${input.description}`.slice(0, 500),
      metadata: { reversesRef: externalRef },
    });
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "El modelo no pudo responder.",
      balance: refund.ok ? refund.balance : debit.balance,
    };
  }
}
