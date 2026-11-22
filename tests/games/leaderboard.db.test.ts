// Ranking en línea contra Postgres real (misma base desechable que la Data API). Sin
// LIVEAPPS_TEST_DATABASE_URL se salta.
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { ensureGameSpace, issueRunToken, leaderboardLimits, resetScores, submitScore, topScores } from "@/lib/games/leaderboard";
import { gameManifest, normalizeGameSpec } from "@/lib/games/spec";

const url = process.env.LIVEAPPS_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("Ranking en línea (Postgres)", () => {
  let db: PrismaClient;
  const run = Date.now().toString(36);
  const slug = `juego-${run}`;
  let userId = "";
  let projectId = "";
  let space: { id: string; schema: unknown };
  const manifest = gameManifest("Taco Esquiva", normalizeGameSpec({ maxScore: 50_000, maxPerSecond: 200 }, { leaderboard: true }));
  const t0 = new Date("2026-11-21T18:00:00Z");
  const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
  let ipCounter = 0;
  const nextIp = () => `10.1.0.${(ipCounter += 1)}`;

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= "secreto-local-de-prueba-para-pines-1234567890";
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, max: 4 }) });
    const user = await db.user.create({ data: { name: "Dueño", email: `juego-${run}@example.com`, username: `juego${run}`, password: "x", referralCode: `J${run}` } });
    userId = user.id;
    const project = await db.project.create({ data: { userId, kind: "juego", title: "Taco Esquiva", summary: "Prueba", groupKey: `g-${run}`, versionCount: 1 } });
    projectId = project.id;
    const created = await ensureGameSpace(db, { projectId, userId, versionId: "v1", manifest });
    if (!created) throw new Error("no se creó el espacio");
    space = created;
  });

  afterAll(async () => {
    await db?.appSpace.deleteMany({ where: { projectId } });
    await db?.project.deleteMany({ where: { id: projectId } });
    await db?.user.deleteMany({ where: { id: userId } });
    await db?.$disconnect();
  });

  async function play(name: string, score: number, seconds = 60, ip = nextIp()) {
    const token = issueRunToken(space.id, at(0));
    return submitScore(db, { space, slug, ip, body: { name, score, run: token }, now: at(seconds) });
  }

  it("crea el espacio una vez y lo reutiliza", async () => {
    const again = await ensureGameSpace(db, { projectId, userId, versionId: "v1", manifest });
    expect(again?.id).toBe(space.id);
    expect(await db.appSpace.count({ where: { projectId } })).toBe(1);
  });

  it("guarda puntajes válidos y devuelve el top ordenado con el lugar", async () => {
    expect(await play("Ana", 900)).toMatchObject({ ok: true, name: "Ana", rank: 1 });
    expect(await play("Beto", 1500)).toMatchObject({ ok: true, rank: 1 });
    const third = await play("Caro", 1200);
    expect(third).toMatchObject({ ok: true, rank: 2 });
    expect(third.ok && third.top.map((row) => row.name)).toEqual(["Beto", "Caro", "Ana"]);
  });

  it("rechaza puntajes imposibles, nombres inválidos, fichas falsas y fichas repetidas", async () => {
    expect(await play("Dani", 999_999)).toMatchObject({ ok: false, status: 400 });
    expect(await play("Dani", 5_000, 10)).toMatchObject({ ok: false, error: expect.stringMatching(/no es posible/) });
    expect(await play("x", 100)).toMatchObject({ ok: false, status: 400 });
    expect(await submitScore(db, { space, slug, ip: nextIp(), body: { name: "Eva", score: 100, run: "1.abcdefghij.firma-falsa-firma-falsa-firma-fal" }, now: at(60) })).toMatchObject({ ok: false, status: 400 });
    const token = issueRunToken(space.id, at(0));
    expect(await submitScore(db, { space, slug, ip: nextIp(), body: { name: "Fer", score: 300, run: token }, now: at(60) })).toMatchObject({ ok: true });
    expect(await submitScore(db, { space, slug, ip: nextIp(), body: { name: "Fer", score: 3000, run: token }, now: at(60) })).toMatchObject({ ok: false, status: 409 });
  });

  it("limita por IP", async () => {
    const ip = "10.9.9.9";
    const results = [];
    for (let i = 0; i <= leaderboardLimits.perIp.max; i += 1) results.push(await play("Gil", 10 + i, 60, ip));
    expect(results.at(-1)).toMatchObject({ ok: false, status: 429 });
  });

  it("conserva solo los mejores y el dueño puede borrar el ranking", async () => {
    for (let i = 0; i < leaderboardLimits.keep + 5; i += 1) await play(`Jugador ${i}`, 2000 + i);
    const count = await db.appRecord.count({ where: { spaceId: space.id, collection: "scores" } });
    expect(count).toBe(leaderboardLimits.keep);
    const top = await topScores(db, space.id);
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({ name: `Jugador ${leaderboardLimits.keep + 4}`, score: 2000 + leaderboardLimits.keep + 4 });
    expect(await resetScores(db, space.id)).toBe(leaderboardLimits.keep);
    expect(await topScores(db, space.id)).toEqual([]);
  });

  it("si la versión publicada ya no trae ranking, el espacio se pausa", async () => {
    expect(await ensureGameSpace(db, { projectId, userId, versionId: "v2", manifest: { ...manifest, leaderboard: false } })).toBeNull();
    expect((await db.appSpace.findUnique({ where: { projectId } }))?.status).toBe("paused");
    const back = await ensureGameSpace(db, { projectId, userId, versionId: "v3", manifest });
    expect(back?.status).toBe("active");
  });
});
