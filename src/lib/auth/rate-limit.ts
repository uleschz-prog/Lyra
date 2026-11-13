import { createHash } from "node:crypto";

/**
 * Límite de intentos de acceso guardado en Postgres (en Vercel Hobby no hay Redis).
 * Solo se guardan hashes: nunca la IP ni el correo en claro.
 */

export type AuthAction = "login" | "register" | "oauth";
type Scope = "ip" | "id" | "ip+id";

export type AuthLimitRule = { scope: Scope; max: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const authLimits: Record<AuthAction, AuthLimitRule[]> = {
  // Solo cuentan los intentos fallidos; un acceso correcto limpia los de ese correo + IP.
  login: [
    { scope: "ip+id", max: 5, windowMs: 15 * MINUTE },
    { scope: "ip", max: 20, windowMs: HOUR },
    { scope: "id", max: 30, windowMs: HOUR },
  ],
  // Cuentan todos los intentos de registro (también los que fallan por validación).
  register: [
    { scope: "ip", max: 10, windowMs: HOUR },
    { scope: "ip", max: 30, windowMs: 24 * HOUR },
    { scope: "id", max: 5, windowMs: HOUR },
  ],
  // Callback y cierre de OAuth: todos los intentos por IP.
  oauth: [{ scope: "ip", max: 20, windowMs: 15 * MINUTE }],
};

/** Retención de los registros; el más largo de los periodos es de 24 h. */
export const AUTH_ATTEMPT_RETENTION_MS = 24 * HOUR;

export type AuthAttemptDb = {
  authAttempt: {
    count(args: { where: { keyHash: string; createdAt: { gte: Date } } }): Promise<number>;
    findFirst(args: {
      where: { keyHash: string; createdAt: { gte: Date } };
      orderBy: { createdAt: "asc" };
      select: { createdAt: true };
    }): Promise<{ createdAt: Date } | null>;
    createMany(args: { data: { action: string; keyHash: string; createdAt: Date }[] }): Promise<unknown>;
    deleteMany(args: { where: { keyHash?: { in: string[] }; createdAt?: { lt: Date } } }): Promise<unknown>;
  };
};

export type AuthSubject = { ip: string; id?: string };

export const RATE_LIMIT_MESSAGE = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";

export function hashKey(action: AuthAction, scope: Scope, value: string) {
  return createHash("sha256").update(`lyra-auth:${action}:${scope}:${value}`).digest("hex");
}

function keyFor(action: AuthAction, rule: AuthLimitRule, subject: AuthSubject): string | null {
  const ip = subject.ip || "desconocida";
  const id = subject.id?.trim().toLowerCase() ?? "";
  if (rule.scope === "ip") return hashKey(action, "ip", ip);
  if (!id) return null;
  if (rule.scope === "id") return hashKey(action, "id", id);
  return hashKey(action, "ip+id", `${ip}|${id}`);
}

function keysFor(action: AuthAction, subject: AuthSubject) {
  const keys = authLimits[action].map((rule) => keyFor(action, rule, subject)).filter((key): key is string => Boolean(key));
  return [...new Set(keys)];
}

/** IP del cliente. En Vercel `x-forwarded-for` lo fija la plataforma; se toma la primera. */
export function clientIp(request: Request) {
  const headers = request.headers;
  const raw =
    headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip") ?? headers.get("x-forwarded-for") ?? "";
  const first = raw.split(",")[0]?.trim() ?? "";
  return first.slice(0, 64) || "desconocida";
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export async function checkAuthLimit(
  db: AuthAttemptDb,
  action: AuthAction,
  subject: AuthSubject,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  let retryAfterMs = 0;
  for (const rule of authLimits[action]) {
    const keyHash = keyFor(action, rule, subject);
    if (!keyHash) continue;
    const since = new Date(now.getTime() - rule.windowMs);
    const count = await db.authAttempt.count({ where: { keyHash, createdAt: { gte: since } } });
    if (count < rule.max) continue;
    const oldest = await db.authAttempt.findFirst({
      where: { keyHash, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const freesAt = (oldest?.createdAt.getTime() ?? now.getTime()) + rule.windowMs;
    retryAfterMs = Math.max(retryAfterMs, freesAt - now.getTime());
  }
  if (retryAfterMs <= 0) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

export async function recordAuthAttempt(
  db: AuthAttemptDb,
  action: AuthAction,
  subject: AuthSubject,
  now: Date = new Date(),
  prune: boolean = Math.random() < 0.02,
) {
  const data = keysFor(action, subject).map((keyHash) => ({ action, keyHash, createdAt: now }));
  if (data.length) await db.authAttempt.createMany({ data });
  if (prune) {
    await db.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - AUTH_ATTEMPT_RETENTION_MS) } } });
  }
}

/** Tras un login correcto se olvidan los fallos de ese correo + IP (no los de la IP sola). */
export async function clearAuthFailures(db: AuthAttemptDb, action: AuthAction, subject: AuthSubject) {
  const rule = authLimits[action].find((item) => item.scope === "ip+id");
  const keyHash = rule ? keyFor(action, rule, subject) : null;
  if (keyHash) await db.authAttempt.deleteMany({ where: { keyHash: { in: [keyHash] } } });
}

export function rateLimitMessage(retryAfterSeconds: number) {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  if (minutes <= 1) return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
  return `Demasiados intentos. Espera unos ${minutes} minutos e inténtalo de nuevo.`;
}
