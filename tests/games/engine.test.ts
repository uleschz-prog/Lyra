import { describe, expect, it, vi } from "vitest";

import { initialState } from "@/lib/builder/engine";
import type { BuilderModel } from "@/lib/builder/model";
import { advanceBuild, startProjectBuild, startProjectEdit, type BaseVersion, type BuilderDb, type RunnerDeps } from "@/lib/builder/runner";
import { basicGameDraft, basicGameFiles } from "@/lib/games/basic";
import { advanceGameEngine, gamePlanFrom } from "@/lib/games/engine";
import { GAME_CODE_PATH, gameManifestFromFiles } from "@/lib/games/spec";
import { table } from "../vega/fake-prisma";

import { brokenGame, gameModel, gamePlanJson, tinyGame } from "./fixtures";

const clock = () => new Date("2026-11-01T00:10:00Z");
const user = { id: "u1", package: null, role: null };

function engineDeps(model: BuilderModel) {
  let t = 0;
  return { model, now: () => (t += 10) };
}

describe("motor del modo juego (plan → código → revisión → archivos)", () => {
  it("planea, escribe src/game.js y arma index.html con el motor", async () => {
    const model = gameModel([tinyGame]);
    const { state } = await advanceGameEngine(initialState(), { brief: "Un taco que esquiva chiles", kind: "juego", title: "Taco", live: true }, engineDeps(model), 600_000);
    expect(state.status).toBe("running");
    expect(state.step).toBe("save");
    expect(state.plan).toMatchObject({ kind: "juego", title: "Taco Esquiva", designSystem: "juego-arcade" });
    expect(state.plan?.game?.leaderboard).toBe(true);
    expect(state.files[GAME_CODE_PATH]).toContain("LyraGame.start");
    expect(state.files["index.html"]).toContain("LyraGame v1");
    expect(gameManifestFromFiles(state.files)).toMatchObject({ leaderboard: true, maxScore: 50000 });
    expect(model.calls.map((call) => call.purpose)).toEqual(["plan", "file"]);
    expect(model.calls[1].user).toContain("Ranking en línea: sí");
  });

  it("repara código inválido con los errores de la revisión", async () => {
    const model = gameModel([brokenGame, tinyGame]);
    const { state } = await advanceGameEngine(initialState(), { brief: "x", kind: "juego", title: "Taco" }, engineDeps(model), 600_000);
    expect(state.step).toBe("save");
    expect(model.calls.map((call) => call.purpose)).toEqual(["plan", "file", "repair"]);
    expect(model.calls[2].user).toMatch(/Sin red/);
  });

  it("falla (para reembolsar) si después de las reparaciones sigue inválido", async () => {
    const model = gameModel([brokenGame]);
    const { state } = await advanceGameEngine(initialState(), { brief: "x", kind: "juego", title: "Taco" }, engineDeps(model), 600_000);
    expect(state.status).toBe("failed");
    expect(state.error).toMatch(/no pasó la revisión/);
  });

  it("se detiene si no alcanza el presupuesto y retoma después", async () => {
    const model = gameModel([tinyGame]);
    let t = 0;
    const first = await advanceGameEngine(initialState(), { brief: "x", kind: "juego", title: "Taco" }, { model, now: () => (t += 5_000) }, 48_000);
    expect(first.state.step).toBe("generate");
    const second = await advanceGameEngine(first.state, { brief: "x", kind: "juego", title: "Taco" }, engineDeps(model), 600_000);
    expect(second.state.step).toBe("save");
  });

  it("gamePlanFrom tiene la forma de BuildPlan sin páginas", () => {
    const plan = gamePlanFrom(gamePlanJson, { brief: "", title: "x", leaderboard: false });
    expect(plan).toMatchObject({ pages: [], chrome: [], entities: [], kind: "juego" });
    expect(plan.game?.leaderboard).toBe(false);
  });
});

function setup(model: BuilderModel, env: Record<string, string> = {}, base?: BaseVersion) {
  const projectBuild = table(
    () => ({ conversationId: null, status: "queued", step: "plan", plan: null, files: null, tasks: null, report: null, repairRound: 0, failures: 0, chargeId: null, refunded: false, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, models: [], projectId: null, versionNumber: null, error: null, lockedUntil: null, mode: "new" }),
    { unique: ["actionId"] },
  );
  const project = table(() => ({ deletedAt: null, versionCount: 0 }));
  const projectVersion = table(() => ({ generator: "vega-v1" }), { unique: ["sourceActionId"] });
  const vegaAction = table();
  const db = { projectBuild, project, projectVersion, vegaAction } as unknown as BuilderDb;
  const charges: { amount: number; description: string }[] = [];
  const charge = vi.fn(async (_userId: string, amount: number, description: string, key: string) => {
    charges.push({ amount, description });
    return { ok: true as const, chargeId: `tx-${key}`, duplicate: false };
  });
  const refund = vi.fn(async () => undefined);
  const load = vi.fn(async (): Promise<BaseVersion | null> => base ?? null);
  const deps: RunnerDeps = { db, now: clock, model, charge, refund, record: vi.fn(async () => null), load, env };
  return { db, tables: { projectBuild, project, projectVersion, vegaAction }, deps, charges, refund };
}

const payload = basicGameDraft({ title: "Taco Esquiva", summary: "Un taco que esquiva chiles", leaderboard: true, suggestions: [] });

describe("runner con juegos", () => {
  it("cobra 20 con ranking, construye y guarda la versión jugable (index.html como vista previa)", async () => {
    const { deps, tables, charges } = setup(gameModel([tinyGame]));
    const a = await tables.vegaAction.create({ data: { userId: "u1", conversationId: "c1", kind: "deliver_project", payload, status: "running", result: "" } });
    const started = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "juego", brief: "Taco que esquiva chiles", live: true }, deps);
    if (!started.ok) throw new Error(started.message);
    expect(started.build.kind).toBe("juego");
    expect(charges[0]).toEqual({ amount: 20, description: "Vega · juego con ranking en línea (generador v2)" });
    expect(tables.projectBuild.rows[0]).toMatchObject({ live: true, credits: 20, kind: "juego" });
    const view = await advanceBuild(started.build.id, deps);
    expect(view).toMatchObject({ status: "done", kind: "juego" });
    const version = tables.projectVersion.rows[0];
    expect(String(version.previewHtml)).toContain("LyraGame.start");
    expect(tables.project.rows[0]).toMatchObject({ kind: "juego", title: "Taco Esquiva" });
    expect(String(tables.vegaAction.rows[0].result)).toBe("Juego listo: Taco Esquiva");
  });

  it("sin ranking cobra 10 (o lo que diga el entorno)", async () => {
    const { deps, tables, charges } = setup(gameModel([tinyGame]), { VEGA_BUILDER_PRICE_GAME: "8" });
    const a = await tables.vegaAction.create({ data: { userId: "u1", conversationId: "c1", kind: "deliver_project", payload, status: "running", result: "" } });
    await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "juego", brief: "x" }, deps);
    expect(charges[0].amount).toBe(8);
    expect(tables.projectBuild.rows[0]).toMatchObject({ live: false });
  });

  it("si falla, reembolsa y guarda la versión básica (juego base) con su leyenda honesta", async () => {
    const { deps, tables, refund } = setup(gameModel([brokenGame]));
    const a = await tables.vegaAction.create({ data: { userId: "u1", conversationId: "c1", kind: "deliver_project", payload, status: "running", result: "" } });
    const started = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "juego", brief: "x" }, deps);
    if (!started.ok) throw new Error(started.message);
    const view = await advanceBuild(started.build.id, deps);
    expect(view).toMatchObject({ status: "failed", fallback: true });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(String(tables.projectVersion.rows[0].summary)).toMatch(/^Versión básica/);
  });

  it("editar_proyecto cambia src/game.js de un juego y guarda versión nueva", async () => {
    const files = basicGameFiles({ title: "Bloques Neón", summary: "x", leaderboard: true });
    const base: BaseVersion = { projectId: "proj1", kind: "juego", title: "Bloques Neón", summary: "x", number: 1, generator: "vega-v2", files: Object.entries(files).map(([path, content]) => ({ path, content })) };
    const edited = files[GAME_CODE_PATH].replace("speed: 430", "speed: 520");
    const { deps, tables, charges } = setup(gameModel([edited], { note: "La bola va más rápido." }), {}, base);
    await tables.project.create({ data: { id: "proj1", userId: "u1", kind: "juego", title: "Bloques Neón", summary: "x", groupKey: "g", versionCount: 1 } });
    await tables.projectVersion.create({ data: { projectId: "proj1", number: 1, title: "Bloques Neón", summary: "x", files: base.files, generator: "vega-v2", sourceActionId: "seed" } });
    const a = await tables.vegaAction.create({ data: { userId: "u1", conversationId: "c1", kind: "deliver_project", payload: { kind: "juego", title: "Bloques Neón", files: [], edit: { projectId: "proj1" } }, status: "running", result: "" } });
    const started = await startProjectEdit({ user, conversationId: "c1", actionId: a.id as string, projectId: "proj1", request: "Que la bola vaya más rápido" }, deps);
    if (!started.ok) throw new Error(started.message);
    expect(charges[0].amount).toBe(2);
    const view = await advanceBuild(started.build.id, deps);
    expect(view).toMatchObject({ status: "done", versionNumber: 2 });
    const saved = tables.projectVersion.rows.find((row) => row.number === 2)!;
    expect(String(saved.summary)).toContain("La bola va más rápido.");
    expect(String(saved.previewHtml)).toContain("speed: 520");
  });

  it("no edita un juego sin manifiesto", async () => {
    const base: BaseVersion = { projectId: "proj1", kind: "juego", title: "X", summary: "x", number: 1, generator: "vega-v1", files: [{ path: "index.html", content: "<html></html>" }] };
    const { deps } = setup(gameModel([tinyGame]), {}, base);
    expect(await startProjectEdit({ user, conversationId: null, actionId: "e1", projectId: "proj1", request: "Más rápido" }, deps)).toMatchObject({ ok: false, reason: "legacy" });
  });
});
