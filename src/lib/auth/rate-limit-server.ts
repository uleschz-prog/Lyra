import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";

import {
  type AuthAction,
  type AuthAttemptDb,
  type AuthSubject,
  checkAuthLimit,
  clearAuthFailures,
  rateLimitMessage,
  recordAuthAttempt,
} from "./rate-limit";

function db() {
  return getPrisma() as unknown as AuthAttemptDb;
}

/**
 * Si la tabla falla (p. ej. la migración aún no corre), se deja pasar y se registra
 * en logs: un error del limitador no debe dejar a todos sin poder entrar.
 */
export async function authLimitResponse(action: AuthAction, subject: AuthSubject): Promise<NextResponse | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const result = await checkAuthLimit(db(), action, subject);
    if (result.allowed) return null;
    return NextResponse.json(
      { error: rateLimitMessage(result.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[auth-rate-limit] check", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Para rutas que redirigen (callback de OAuth): true si hay que frenar. */
export async function authLimited(action: AuthAction, subject: AuthSubject) {
  return (await authLimitResponse(action, subject)) !== null;
}

export async function noteAuthAttempt(action: AuthAction, subject: AuthSubject) {
  if (!process.env.DATABASE_URL) return;
  try {
    await recordAuthAttempt(db(), action, subject);
  } catch (error) {
    console.error("[auth-rate-limit] record", error instanceof Error ? error.message : error);
  }
}

export async function forgetAuthFailures(action: AuthAction, subject: AuthSubject) {
  if (!process.env.DATABASE_URL) return;
  try {
    await clearAuthFailures(db(), action, subject);
  } catch (error) {
    console.error("[auth-rate-limit] clear", error instanceof Error ? error.message : error);
  }
}
