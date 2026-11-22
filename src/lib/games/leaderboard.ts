// Ranking en línea de los juegos publicados (top 10 con nombre). Reutiliza la base de datos en
// vivo sin migraciones: un AppSpace por juego (schema.kind = "game") y cada puntaje es un
// AppRecord de la colección «scores». Público (sin PIN) con límites: por IP y por juego,
// fichas de partida firmadas por el servidor (tiempo real jugado) y cotas del manifiesto.
// No es a prueba de trampas: es un ranking casual honesto.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { GameManifest } from "@/lib/games/spec";
import { usageDay } from "@/lib/liveapps/config";

export type LeaderboardDb = Pick<PrismaClient, "appSpace" | "appRecord" | "appUsage" | "authAttempt" | "$transaction">;

export const leaderboardLimits = {
  /** Puntajes enviados por IP en la ventana. */
  perIp: { max: 20, windowMs: 10 * 60_000 },
  /** Puntajes por juego por hora. */
  perGame: { max: 600, windowMs: 60 * 60_000 },
  /** Escrituras por juego por día (CDMX). */
  perDay: 3_000,
  /** Puntajes que se conservan (los demás se borran: solo importa el top). */
  keep: 50,
  top: 10,
  /** Partida mínima y máxima entre la ficha y el envío. */
  minRunMs: 3_000,
  maxRunMs: 3 * 60 * 60_000,
  /** Margen sobre maxPerSecond × segundos. */
  graceScore: 100,
  nameMin: 2,
  nameMax: 16,
} as const;

export type GameSpaceSchema = { kind: "game"; versionId: string; title: string; maxScore: number; maxPerSecond: number };

export function gameSpaceSchema(raw: unknown): GameSpaceSchema | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.kind !== "game" || typeof value.versionId !== "string") return null;
  const maxScore = Number(value.maxScore);
  const maxPerSecond = Number(value.maxPerSecond);
  if (!Number.isFinite(maxScore) || !Number.isFinite(maxPerSecond)) return null;
  return { kind: "game", versionId: value.versionId, title: String(value.title ?? "Juego").slice(0, 80), maxScore, maxPerSecond };
}

/* ------------------------------- Nombres ------------------------------- */

const links = /(https?|www\.|\.(com|mx|net|org|io|xyz)\b)/i;
const blocked = /(p[o0]rn|nazi|hitler|put[oa]|pendej|verga|chinga|mierda|culer|fuck|shit|bitch|nigg)/i;

/** Nombre visible en el ranking: letras, números, espacios y . _ - ' (2–16). null si no sirve. */
export function cleanPlayerName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, leaderboardLimits.nameMax);
  if (name.length < leaderboardLimits.nameMin || links.test(name) || blocked.test(name.replace(/[\s._'-]/g, ""))) return null;
  return name;
}

/* ------------------------------- Fichas de partida ------------------------------- */

function secret(env: Record<string, string | undefined>) {
  const value = env.SESSION_SECRET;
  if (!value || value.length < 16) throw new Error("SESSION_SECRET no está configurada.");
  return value;
}

function sign(payload: string, env: Record<string, string | undefined>) {
  return createHmac("sha256", secret(env)).update(`lyra-game-run:${payload}`).digest("base64url").slice(0, 32);
}

/** Ficha firmada «cuándo empezó a jugar» para un espacio. La entrega GET scores. */
export function issueRunToken(spaceId: string, now: Date, env: Record<string, string | undefined> = process.env) {
  const nonce = randomBytes(9).toString("base64url");
  const payload = `${spaceId}.${now.getTime().toString(36)}.${nonce}`;
  return `${now.getTime().toString(36)}.${nonce}.${sign(payload, env)}`;
}

export function readRunToken(token: unknown, spaceId: string, env: Record<string, string | undefined> = process.env): { startedAt: number; nonce: string } | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[a-z0-9]{6,12}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{8,20}$/.test(parts[1])) return null;
  const expected = Buffer.from(sign(`${spaceId}.${parts[0]}.${parts[1]}`, env));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const startedAt = Number.parseInt(parts[0], 36);
  return Number.isFinite(startedAt) ? { startedAt, nonce: parts[1] } : null;
}

/* ------------------------------- Cotas del puntaje ------------------------------- */

export function checkScore(input: { score: unknown; elapsedMs: number; bounds: Pick<GameManifest, "maxScore" | "maxPerSecond"> }): { ok: true; score: number } | { ok: false; error: string } {
  const score = input.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1) return { ok: false, error: "Puntaje inválido." };
  if (score > input.bounds.maxScore) return { ok: false, error: "Ese puntaje supera el máximo de este juego." };
  if (input.elapsedMs < leaderboardLimits.minRunMs) return { ok: false, error: "La partida fue demasiado corta." };
  if (input.elapsedMs > leaderboardLimits.maxRunMs) return { ok: false, error: "La partida expiró; juega otra para entrar al ranking." };
  const plausible = (input.bounds.maxPerSecond * input.elapsedMs) / 1000 + leaderboardLimits.graceScore;
  if (score > plausible) return { ok: false, error: "Ese puntaje no es posible en ese tiempo." };
  return { ok: true, score };
}

/* ------------------------------- Base de datos ------------------------------- */

export type ScoreRow = { name: string; score: number };

function attemptHash(scope: string, value: string) {
  return createHash("sha256").update(`lyra-game-score:${scope}:${value}`).digest("hex");
}

/** Espacio del ranking de un juego publicado (lo crea o actualiza con la versión publicada). */
export async function ensureGameSpace(
  db: LeaderboardDb,
  input: { projectId: string; userId: string; versionId: string; manifest: GameManifest | null },
) {
  const space = await db.appSpace.findUnique({ where: { projectId: input.projectId } });
  const current = space ? gameSpaceSchema(space.schema) : null;
  if (space && !current) return null; // espacio de otro tipo: no se toca
  if (!input.manifest?.leaderboard) {
    if (space && space.status === "active") await db.appSpace.update({ where: { id: space.id }, data: { status: "paused" } });
    return null;
  }
  const schema: GameSpaceSchema = { kind: "game", versionId: input.versionId, title: input.manifest.title, maxScore: input.manifest.maxScore, maxPerSecond: input.manifest.maxPerSecond };
  const json = schema as unknown as Prisma.InputJsonValue;
  if (!space) {
    try {
      return await db.appSpace.create({ data: { projectId: input.projectId, userId: input.userId, schema: json, branches: [] } });
    } catch {
      return db.appSpace.findUnique({ where: { projectId: input.projectId } });
    }
  }
  if (current && (current.versionId !== input.versionId || space.status !== "active")) {
    return db.appSpace.update({ where: { id: space.id }, data: { schema: json, status: "active" } });
  }
  return space;
}

export async function topScores(db: Pick<LeaderboardDb, "appRecord">, spaceId: string, limit: number = leaderboardLimits.top): Promise<ScoreRow[]> {
  const rows = await db.appRecord.findMany({ where: { spaceId, collection: "scores", deleted: false }, select: { data: true, seq: true }, take: leaderboardLimits.keep * 2 });
  return rows
    .map((row) => {
      const data = (row.data ?? {}) as Record<string, unknown>;
      return { name: String(data.name ?? ""), score: Number(data.score) || 0, seq: row.seq };
    })
    .filter((row) => row.name && row.score > 0)
    .sort((a, b) => b.score - a.score || a.seq - b.seq)
    .slice(0, limit)
    .map(({ name, score }) => ({ name, score }));
}

export type SubmitResult = { ok: true; name: string; rank: number | null; top: ScoreRow[] } | { ok: false; status: number; error: string };

/** Guarda un puntaje con todas las revisiones. `space` ya es el espacio activo del juego. */
export async function submitScore(
  db: LeaderboardDb,
  input: { space: { id: string; schema: unknown }; slug: string; ip: string; body: Record<string, unknown>; now?: Date; env?: Record<string, string | undefined> },
): Promise<SubmitResult> {
  const now = input.now ?? new Date();
  const schema = gameSpaceSchema(input.space.schema);
  if (!schema) return { ok: false, status: 404, error: "Este juego no tiene ranking." };
  const ipKey = attemptHash("ip", `${input.slug}:${input.ip || "desconocida"}`);
  const gameKey = attemptHash("game", input.slug);
  const [byIp, byGame] = await Promise.all([
    db.authAttempt.count({ where: { keyHash: ipKey, createdAt: { gte: new Date(now.getTime() - leaderboardLimits.perIp.windowMs) } } }),
    db.authAttempt.count({ where: { keyHash: gameKey, createdAt: { gte: new Date(now.getTime() - leaderboardLimits.perGame.windowMs) } } }),
  ]);
  if (byIp >= leaderboardLimits.perIp.max || byGame >= leaderboardLimits.perGame.max) return { ok: false, status: 429, error: "Demasiados puntajes seguidos. Espera unos minutos." };
  await db.authAttempt.createMany({ data: [{ action: "game-score", keyHash: ipKey, createdAt: now }, { action: "game-score", keyHash: gameKey, createdAt: now }] });

  const name = cleanPlayerName(input.body.name);
  if (!name) return { ok: false, status: 400, error: "Escribe un nombre de 2 a 16 letras o números." };
  const run = readRunToken(input.body.run, input.space.id, input.env);
  if (!run) return { ok: false, status: 400, error: "La partida no es válida; juega otra para entrar al ranking." };
  const checked = checkScore({ score: input.body.score, elapsedMs: now.getTime() - run.startedAt, bounds: schema });
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };

  // Una ficha = un puntaje.
  const runKey = attemptHash("run", `${input.space.id}:${run.nonce}`);
  const used = await db.authAttempt.count({ where: { keyHash: runKey } });
  if (used) return { ok: false, status: 409, error: "Ese puntaje ya se guardó." };
  const day = usageDay(now);
  const usage = await db.appUsage.findUnique({ where: { spaceId_day: { spaceId: input.space.id, day } }, select: { writes: true } });
  if ((usage?.writes ?? 0) >= leaderboardLimits.perDay) return { ok: false, status: 429, error: "El ranking llegó a su límite de hoy." };

  const rid = `s-${randomBytes(8).toString("hex")}`;
  await db.$transaction(async (tx) => {
    await tx.authAttempt.create({ data: { action: "game-run", keyHash: runKey, createdAt: now } });
    const space = await tx.appSpace.update({ where: { id: input.space.id }, data: { seq: { increment: 1 }, recordCount: { increment: 1 } }, select: { seq: true } });
    await tx.appRecord.create({ data: { spaceId: input.space.id, rid, collection: "scores", branchId: null, data: { name, score: checked.score, at: now.toISOString() }, seq: space.seq } });
    await tx.appUsage.upsert({ where: { spaceId_day: { spaceId: input.space.id, day } }, create: { spaceId: input.space.id, day, writes: 1, logins: 0 }, update: { writes: { increment: 1 } } });
  });
  await pruneScores(db, input.space.id);
  const top = await topScores(db, input.space.id);
  const index = top.findIndex((row) => row.name === name && row.score === checked.score);
  return { ok: true, name, rank: index >= 0 ? index + 1 : null, top };
}

/** Conserva solo los mejores `keep` puntajes. */
export async function pruneScores(db: Pick<LeaderboardDb, "appRecord" | "appSpace">, spaceId: string) {
  const rows = await db.appRecord.findMany({ where: { spaceId, collection: "scores" }, select: { id: true, data: true, seq: true } });
  if (rows.length <= leaderboardLimits.keep) return 0;
  const sorted = rows
    .map((row) => ({ id: row.id, seq: row.seq, score: Number(((row.data ?? {}) as Record<string, unknown>).score) || 0 }))
    .sort((a, b) => b.score - a.score || a.seq - b.seq);
  const drop = sorted.slice(leaderboardLimits.keep).map((row) => row.id);
  await db.appRecord.deleteMany({ where: { id: { in: drop } } });
  await db.appSpace.update({ where: { id: spaceId }, data: { recordCount: { decrement: drop.length } } });
  return drop.length;
}

/** El dueño borra el ranking de su juego (p. ej. antes de un torneo). */
export async function resetScores(db: Pick<LeaderboardDb, "appRecord" | "appSpace">, spaceId: string) {
  const removed = await db.appRecord.deleteMany({ where: { spaceId, collection: "scores" } });
  await db.appSpace.update({ where: { id: spaceId }, data: { recordCount: 0 } });
  return removed.count;
}
