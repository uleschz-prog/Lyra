import { describe, expect, it, vi } from "vitest";

import { advanceBuild, briefFromDelivery, resumeBuilds, startProjectBuild, type BuilderDb, type RunnerDeps } from "@/lib/builder/runner";
import type { ArtifactStore } from "@/lib/builder/storage";
import { buildProject } from "@/lib/vega/build-project";
import { table } from "../vega/fake-prisma";
import { banks, fixtureModel } from "./fixtures";

const now = () => new Date("2026-11-01T00:10:00Z");
const bank = banks[0];

function setup(env: Record<string, string> = {}, options: Parameters<typeof fixtureModel>[1] = {}) {
  const projectBuild = table(
    () => ({
      conversationId: null,
      status: "queued",
      step: "plan",
      plan: null,
      files: null,
      tasks: null,
      report: null,
      repairRound: 0,
      failures: 0,
      chargeId: null,
      refunded: false,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      models: [],
      projectId: null,
      versionNumber: null,
      error: null,
      lockedUntil: null,
    }),
    { unique: ["actionId"] },
  );
  const project = table(() => ({ deletedAt: null, versionCount: 0 }));
  const projectVersion = table(() => ({ generator: "vega-v1" }), { unique: ["sourceActionId"] });
  const vegaAction = table();
  const db = { projectBuild, project, projectVersion, vegaAction } as unknown as BuilderDb;
  const blobs = new Map<string, string>();
  const store: ArtifactStore = {
    put: vi.fn(async (pathname: string, body: string) => {
      const url = `https://store.private.blob.vercel-storage.com/${pathname}`;
      blobs.set(url, body);
      return url;
    }),
    get: vi.fn(async (url: string) => blobs.get(url) ?? null),
  };
  let balance = 100;
  const charges: { key: string; amount: number }[] = [];
  const charge = vi.fn(async (_userId: string, amount: number, _description: string, key: string) => {
    if (charges.some((item) => item.key === key)) return { ok: true as const, chargeId: `tx-${key}`, duplicate: true };
    if (amount > balance) return { ok: false as const, error: "Sin créditos" };
    balance -= amount;
    charges.push({ key, amount });
    return { ok: true as const, chargeId: `tx-${key}`, duplicate: false };
  });
  const refund = vi.fn(async () => {
    balance += 10;
  });
  const record = vi.fn(async () => null);
  const deps: RunnerDeps = { db, now, model: fixtureModel(bank, options), charge, refund, record, store, env };
  return { db, tables: { projectBuild, project, projectVersion, vegaAction }, deps, charge, refund, record, store, blobs, balance: () => balance };
}

const v1 = buildProject({
  titulo: bank.title,
  tipo: "sitio",
  resumen: bank.summary,
  secciones: [
    { tipo: "portada", titulo: "Tu sonrisa en buenas manos", texto: "Clínica dental familiar.", boton: "Agendar" },
    { tipo: "servicios", titulo: "Servicios", items: [{ nombre: "Limpieza", detalle: "45 min" }] },
    { tipo: "pasos", titulo: "Cómo funciona", items: [{ titulo: "Agenda", texto: "Por WhatsApp" }, { titulo: "Valoración", texto: "Revisión completa" }] },
    { tipo: "preguntas", titulo: "Preguntas", items: [{ titulo: "¿Aceptan tarjeta?", texto: "Sí." }] },
    { tipo: "texto", titulo: "Nosotros", parrafos: ["Clínica familiar desde 2014."] },
    { tipo: "contacto", titulo: "Contacto", campos: ["Nombre"], nota: "" },
  ],
});
if (!v1.ok) throw new Error(v1.error);

async function action(tables: ReturnType<typeof setup>["tables"]) {
  return tables.vegaAction.create({ data: { userId: "u1", conversationId: "c1", kind: "deliver_project", payload: v1.ok ? v1.project : {}, status: "running", result: "" } });
}

const user = { id: "u1", package: null, role: null };

describe("Runner del generador v2", () => {
  it("cobra 10 créditos una vez por entrega y crea el trabajo", async () => {
    const { deps, tables, charge } = setup();
    const a = await action(tables);
    const first = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "sitio", brief: bank.brief }, deps);
    expect(first).toMatchObject({ ok: true, duplicate: false, build: { status: "queued", kind: "sitio" } });
    expect(charge).toHaveBeenCalledWith("u1", 10, expect.any(String), `builder:${a.id}`);
    const again = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "sitio", brief: bank.brief }, deps);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(charge).toHaveBeenCalledTimes(1);
    expect(tables.projectBuild.rows).toHaveLength(1);
  });

  it("respeta el límite diario, los créditos y el interruptor", async () => {
    const limited = setup({ VEGA_BUILDER_DAILY_DEFAULT: "1" });
    const a1 = await action(limited.tables);
    const a2 = await action(limited.tables);
    expect((await startProjectBuild({ user, conversationId: null, actionId: a1.id as string, kind: "app", brief: "x" }, limited.deps)).ok).toBe(true);
    expect(await startProjectBuild({ user, conversationId: null, actionId: a2.id as string, kind: "app", brief: "x" }, limited.deps)).toMatchObject({ ok: false, reason: "limit" });

    const poor = setup({ VEGA_BUILDER_PRICE_SITE: "500" });
    const a3 = await action(poor.tables);
    expect(await startProjectBuild({ user, conversationId: null, actionId: a3.id as string, kind: "sitio", brief: "x" }, poor.deps)).toMatchObject({ ok: false, reason: "credits" });
    expect(poor.tables.projectBuild.rows).toHaveLength(0);

    const off = setup({ VEGA_BUILDER: "off" });
    expect(await startProjectBuild({ user, conversationId: null, actionId: "zz", kind: "sitio", brief: "x" }, off.deps)).toMatchObject({ ok: false, reason: "off" });
    expect(await startProjectBuild({ user, conversationId: null, actionId: "zz", kind: "agente", brief: "x" }, setup().deps)).toMatchObject({ ok: false, reason: "kind" });
  });

  it("construye, guarda en Blob y deja la versión vega-v2 en Proyectos", async () => {
    const { deps, tables, record, blobs } = setup({ BLOB_READ_WRITE_TOKEN: "test" });
    const a = await action(tables);
    const started = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "sitio", brief: bank.brief }, deps);
    if (!started.ok) throw new Error("no arrancó");
    const view = await advanceBuild(started.build.id, deps);
    expect(view).toMatchObject({ status: "done", progress: 100, designSystem: "clinic" });
    const version = tables.projectVersion.rows[0];
    expect(version).toMatchObject({ generator: "vega-v2", buildId: started.build.id, sourceActionId: a.id, files: [] });
    expect(String(version.filesUrl)).toContain("/files.json");
    expect(String(version.previewUrl)).toContain("/preview.html");
    expect(version.previewHtml).toBeUndefined();
    expect(JSON.parse(blobs.get(String(version.filesUrl))!).map((file: { path: string }) => file.path)).toContain("src/App.tsx");
    const stored = tables.vegaAction.rows[0];
    expect(stored.status).toBe("done");
    expect((stored.payload as { build: { status: string; projectId: string } }).build).toMatchObject({ status: "done", projectId: version.projectId });
    expect(record).toHaveBeenCalledTimes(1);
    const build = tables.projectBuild.rows[0];
    expect(build.calls as number).toBeGreaterThan(5);
    expect(build.costUsd as number).toBeGreaterThan(0);
    expect(build.models).toContain("gemini:gemini-2.5-flash");
    expect(build.lockedUntil).toBeNull();
  }, 30_000);

  it("sin Blob guarda archivos y vista previa en la base", async () => {
    const { deps, tables, store } = setup();
    const a = await action(tables);
    const started = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "sitio", brief: bank.brief }, deps);
    if (!started.ok) throw new Error("no arrancó");
    await advanceBuild(started.build.id, deps);
    const version = tables.projectVersion.rows[0];
    expect((version.files as { path: string }[]).map((file) => file.path)).toContain("package.json");
    expect(String(version.previewHtml)).toContain("<!doctype html>");
    expect(store.put).not.toHaveBeenCalled();
  }, 30_000);

  it("si falla, reembolsa una sola vez y guarda la versión v1 de respaldo", async () => {
    const { deps, tables, refund } = setup({}, { failPlan: true });
    const a = await action(tables);
    const started = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "sitio", brief: bank.brief }, deps);
    if (!started.ok) throw new Error("no arrancó");
    const view = await advanceBuild(started.build.id, deps);
    expect(view).toMatchObject({ status: "failed", fallback: true });
    await advanceBuild(started.build.id, deps);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(tables.projectBuild.rows[0].refunded).toBe(true);
    expect(tables.projectVersion.rows[0]).toMatchObject({ generator: "vega-v1", sourceActionId: a.id });
    expect((tables.vegaAction.rows[0].payload as { build: { status: string } }).build.status).toBe("failed");
  });

  it("no avanza un trabajo tomado por otra invocación y da por perdido uno viejo", async () => {
    const { deps, tables, refund } = setup();
    const a = await action(tables);
    const started = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "sitio", brief: bank.brief }, deps);
    if (!started.ok) throw new Error("no arrancó");
    tables.projectBuild.rows[0].lockedUntil = new Date(now().getTime() + 30_000);
    const busy = await advanceBuild(started.build.id, deps);
    expect(busy).toMatchObject({ status: "queued" });
    expect((deps.model as unknown as { calls: unknown[] }).calls).toHaveLength(0);

    tables.projectBuild.rows[0].lockedUntil = null;
    const late = { ...deps, now: () => new Date(now().getTime() + 31 * 60_000) };
    const view = await advanceBuild(started.build.id, late);
    expect(view?.status).toBe("failed");
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("el despachador retoma trabajos que nadie está sondeando", async () => {
    const { deps, tables } = setup();
    const a = await action(tables);
    const started = await startProjectBuild({ user, conversationId: "c1", actionId: a.id as string, kind: "sitio", brief: bank.brief }, deps);
    if (!started.ok) throw new Error("no arrancó");
    const result = await resumeBuilds({ ...deps, now: () => new Date(now().getTime() + 60_000) }, { budgetMs: 45_000 });
    expect(result).toEqual({ found: 1, advanced: 1 });
    expect(tables.projectBuild.rows[0].status).toBe("done");
  }, 30_000);

  it("arma el brief con lo que pidió el socio y el copy de Vega", () => {
    const brief = briefFromDelivery({ brief: "Clínica dental en Pachuca", color: "#0F766E", secciones: [{ tipo: "portada", titulo: "Hola" }] }, { title: "Sonríe", summary: "Dental" });
    expect(brief).toContain("Clínica dental en Pachuca");
    expect(brief).toContain("Color de marca: #0F766E");
    expect(brief).toContain('"titulo":"Hola"');
  });
});
