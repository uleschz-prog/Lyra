// Runner del generador v2: cobra, crea el trabajo, lo avanza por pasos cortos con candado
// (sondeo del chat o despachador de la Fase 6), guarda la versión y reembolsa si falla.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { buildPreviewHtml } from "@/lib/builder/bundle";
import { builderDailyLimit, builderDayStart, builderEnabled, builderGenerator, builderLimits, builderPrice } from "@/lib/builder/config";
import { advanceEngine, progressOf, stepLabels, type BuildStep, type EngineState } from "@/lib/builder/engine";
import { gatewayBuilderModel, type BuilderModel } from "@/lib/builder/model";
import { storeArtifacts, type ArtifactStore } from "@/lib/builder/storage";
import type { BuildKind, BuildPlan, FileTask, ProjectFiles } from "@/lib/builder/types";
import { saveDeliveredProject, saveProjectVersion } from "@/lib/projects/store";
import { findSecret } from "@/lib/vega/secret-filter";
import type { ProjectFile } from "@/lib/vega/build-project";
import { summarizeUsage, type ModelUsage, type TurnUsage } from "@/lib/vega/usage";

export type BuilderDb = Pick<PrismaClient, "projectBuild" | "project" | "projectVersion" | "vegaAction">;

type Charge = { ok: true; chargeId: string | null; duplicate: boolean } | { ok: false; error: string };

export type RunnerDeps = {
  db: BuilderDb;
  now?: () => Date;
  model?: BuilderModel;
  charge?: (userId: string, amount: number, description: string, key: string) => Promise<Charge>;
  refund?: (chargeId: string | null, reason: string) => Promise<void>;
  record?: (input: { userId: string; conversationId: string | null; usage: TurnUsage }) => Promise<unknown>;
  store?: ArtifactStore;
  env?: Record<string, string | undefined>;
  root?: string;
};

async function defaultCharge(userId: string, amount: number, description: string, key: string): Promise<Charge> {
  const { chargeCredits } = await import("@/lib/credits");
  return chargeCredits(userId, amount, description, key);
}

async function defaultRefund(chargeId: string | null, reason: string) {
  const { refundCharge } = await import("@/lib/credits");
  await refundCharge(chargeId, reason);
}

async function defaultRecord(input: { userId: string; conversationId: string | null; usage: TurnUsage }) {
  const { recordUsage } = await import("@/lib/vega/cost-cap");
  return recordUsage({ ...input, source: "builder" });
}

export type BuildView = {
  id: string;
  kind: BuildKind;
  status: "queued" | "running" | "done" | "failed";
  step: BuildStep;
  label: string;
  progress: number;
  title: string | null;
  designSystem: string | null;
  files: number;
  projectId: string | null;
  versionNumber: number | null;
  error: string | null;
  /** v1 guardada como respaldo cuando v2 falló. */
  fallback: boolean;
};

type BuildRow = {
  id: string;
  userId: string;
  conversationId: string | null;
  actionId: string | null;
  kind: string;
  brief: string;
  status: string;
  step: string;
  plan: unknown;
  files: unknown;
  tasks: unknown;
  report: unknown;
  repairRound: number;
  failures: number;
  chargeId: string | null;
  refunded: boolean;
  projectId: string | null;
  versionNumber: number | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const buildSelect = {
  id: true,
  userId: true,
  conversationId: true,
  actionId: true,
  kind: true,
  brief: true,
  status: true,
  step: true,
  plan: true,
  files: true,
  tasks: true,
  report: true,
  repairRound: true,
  failures: true,
  chargeId: true,
  refunded: true,
  projectId: true,
  versionNumber: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

const kindLabel: Record<BuildKind, string> = { sitio: "Sitio", app: "App" };

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function asKind(value: string): BuildKind {
  return value === "app" ? "app" : "sitio";
}

function stateOf(row: BuildRow): EngineState {
  const report = (row.report && typeof row.report === "object" ? row.report : {}) as { issues?: EngineState["issues"] };
  return {
    status: (["queued", "running", "done", "failed"].includes(row.status) ? row.status : "queued") as EngineState["status"],
    step: (row.step in stepLabels ? row.step : "plan") as BuildStep,
    plan: (row.plan as BuildPlan | null) ?? null,
    files: (row.files && typeof row.files === "object" ? row.files : {}) as ProjectFiles,
    tasks: Array.isArray(row.tasks) ? (row.tasks as FileTask[]) : [],
    issues: Array.isArray(report.issues) ? report.issues : [],
    repairRound: row.repairRound,
    failures: row.failures,
    error: row.error,
  };
}

export function buildView(row: Pick<BuildRow, "id" | "kind" | "status" | "step" | "plan" | "tasks" | "projectId" | "versionNumber" | "error">): BuildView {
  const plan = (row.plan as BuildPlan | null) ?? null;
  const tasks = Array.isArray(row.tasks) ? (row.tasks as FileTask[]) : [];
  const status = (["queued", "running", "done", "failed"].includes(row.status) ? row.status : "queued") as BuildView["status"];
  const step = (row.step in stepLabels ? row.step : "plan") as BuildStep;
  return {
    id: row.id,
    kind: asKind(row.kind),
    status,
    step,
    label: status === "failed" ? "No se pudo terminar" : status === "queued" ? "En cola" : stepLabels[step],
    progress: status === "failed" ? 100 : progressOf({ status, step, tasks }),
    title: plan?.title ?? null,
    designSystem: plan?.designSystem ?? null,
    files: tasks.length,
    projectId: row.projectId,
    versionNumber: row.versionNumber,
    error: row.error,
    fallback: status === "failed" && Boolean(row.projectId),
  };
}

export type StartResult =
  | { ok: true; build: BuildView; duplicate: boolean }
  | { ok: false; reason: "off" | "kind" | "limit" | "credits"; message: string };

/** Arranca una construcción v2 para una entrega de Vega (idempotente por `actionId`). */
export async function startProjectBuild(
  input: {
    user: { id: string; package: string | null; role?: string | null };
    conversationId: string | null;
    actionId: string;
    kind: string;
    brief: string;
  },
  deps: RunnerDeps,
): Promise<StartResult> {
  if (!builderEnabled(deps.env)) return { ok: false, reason: "off", message: "El generador v2 está apagado." };
  if (input.kind !== "sitio" && input.kind !== "app") return { ok: false, reason: "kind", message: "El generador v2 hace sitios y apps." };
  const db = deps.db;
  const existing = await db.projectBuild.findUnique({ where: { actionId: input.actionId }, select: buildSelect });
  if (existing) return { ok: true, build: buildView(existing), duplicate: true };

  const now = deps.now?.() ?? new Date();
  const limit = builderDailyLimit(input.user, deps.env);
  if (limit !== null) {
    const today = await db.projectBuild.count({ where: { userId: input.user.id, createdAt: { gte: builderDayStart(now) }, refunded: false } });
    if (today >= limit) {
      return { ok: false, reason: "limit", message: `Llegaste al límite de ${limit} construcciones por día de tu plan. Mañana se reinicia (hora CDMX).` };
    }
  }

  const price = builderPrice(input.kind, deps.env);
  const charge = await (deps.charge ?? defaultCharge)(input.user.id, price, `Vega · ${input.kind === "app" ? "app" : "sitio web"} (generador v2)`, `builder:${input.actionId}`);
  if (!charge.ok) return { ok: false, reason: "credits", message: charge.error };

  try {
    const row = await db.projectBuild.create({
      data: {
        userId: input.user.id,
        conversationId: input.conversationId,
        actionId: input.actionId,
        kind: input.kind,
        brief: input.brief.slice(0, 12_000),
        credits: price,
        chargeId: charge.chargeId,
        tasks: [],
      },
      select: buildSelect,
    });
    return { ok: true, build: buildView(row), duplicate: false };
  } catch (error) {
    const again = await db.projectBuild.findUnique({ where: { actionId: input.actionId }, select: buildSelect });
    if (again) return { ok: true, build: buildView(again), duplicate: true };
    // Sin trabajo creado: se devuelve el cobro (si fue nuevo) y Vega entrega con v1.
    if (!charge.duplicate) await (deps.refund ?? defaultRefund)(charge.chargeId, "Reembolso: no se pudo iniciar el generador");
    throw error;
  }
}

async function claim(db: BuilderDb, id: string, now: Date) {
  const claimed = await db.projectBuild.updateMany({
    where: { id, status: { in: ["queued", "running"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + builderLimits.leaseMs) },
  });
  return claimed.count === 1;
}

async function updateAction(db: BuilderDb, actionId: string | null, patch: { status: string; result: string; build: Record<string, unknown> }) {
  if (!actionId) return;
  const action = await db.vegaAction.findUnique({ where: { id: actionId }, select: { payload: true } });
  if (!action) return;
  const payload = (action.payload && typeof action.payload === "object" ? action.payload : {}) as Record<string, unknown>;
  await db.vegaAction.update({
    where: { id: actionId },
    data: { status: patch.status, result: patch.result, payload: json({ ...payload, build: patch.build }) },
    select: { id: true },
  });
}

/** Marca el trabajo como fallido, reembolsa una sola vez y guarda la versión v1 de respaldo. */
async function failBuild(row: BuildRow, error: string, deps: RunnerDeps) {
  const db = deps.db;
  const now = deps.now?.() ?? new Date();
  const first = await db.projectBuild.updateMany({ where: { id: row.id, refunded: false }, data: { refunded: true } });
  if (first.count === 1 && row.chargeId) {
    await (deps.refund ?? defaultRefund)(row.chargeId, "Reembolso: el generador no pudo terminar el proyecto").catch((refundError: unknown) =>
      console.error("[Generador] no se pudo reembolsar", { errorType: refundError instanceof Error ? refundError.name : typeof refundError }),
    );
  }
  let saved: { projectId: string; versionNumber: number } | null = null;
  if (row.actionId) {
    const action = await db.vegaAction.findUnique({ where: { id: row.actionId }, select: { payload: true } });
    if (action) {
      saved = await saveDeliveredProject(db, { userId: row.userId, conversationId: row.conversationId, actionId: row.actionId, payload: action.payload }).catch(() => null);
    }
  }
  const message = error.slice(0, 300);
  await db.projectBuild.update({
    where: { id: row.id },
    data: { status: "failed", error: message, finishedAt: now, lockedUntil: null, projectId: saved?.projectId ?? null, versionNumber: saved?.versionNumber ?? null },
    select: { id: true },
  });
  await updateAction(db, row.actionId, {
    status: "done",
    result: saved ? "Entregué la versión básica: el generador premium no pudo terminar y te devolvimos los créditos." : "El generador no pudo terminar; te devolvimos los créditos.",
    build: { buildId: row.id, status: "failed", error: message, projectId: saved?.projectId ?? null, versionNumber: saved?.versionNumber ?? null },
  });
}

function filesArray(files: ProjectFiles): ProjectFile[] {
  return Object.keys(files)
    .sort()
    .map((path) => ({ path, content: files[path] }));
}

async function saveBuild(row: BuildRow, state: EngineState, deps: RunnerDeps) {
  const db = deps.db;
  const plan = state.plan;
  if (!plan) throw new Error("La construcción no tiene plan.");
  const preview = await buildPreviewHtml(plan, state.files, { root: deps.root });
  if (!preview.ok || !preview.html) throw new Error("No se pudo compilar la vista previa final.");
  const files = filesArray(state.files);
  // Última barrera: ningún archivo (tampoco el andamiaje con datos del plan) sale con algo con forma de llave.
  const leaked = files.find((file) => findSecret(file.content));
  if (leaked) {
    await failBuild(row, `El proyecto incluía un dato sensible en ${leaked.path}; no se guardó.`, deps);
    return null;
  }
  const bytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0);
  if (files.length > builderLimits.maxFiles || bytes > builderLimits.maxBytes) throw new Error("El proyecto excede el tamaño permitido.");
  const stored = await storeArtifacts({ userId: row.userId, buildId: row.id, files, html: preview.html }, { store: deps.store, env: deps.env });
  const saved = await saveProjectVersion(db, {
    userId: row.userId,
    conversationId: row.conversationId,
    actionId: row.actionId ?? `build:${row.id}`,
    kind: plan.kind,
    title: plan.title,
    summary: plan.summary,
    files: stored.filesUrl ? [] : files,
    suggestions: plan.suggestions.slice(0, 5),
    bytes,
    generator: builderGenerator,
    filesUrl: stored.filesUrl,
    previewUrl: stored.previewUrl,
    previewHtml: stored.previewUrl ? null : preview.html,
    buildId: row.id,
  });
  if (!saved) throw new Error("No se pudo guardar la versión.");
  const now = deps.now?.() ?? new Date();
  await db.projectBuild.update({
    where: { id: row.id },
    data: {
      status: "done",
      step: "done",
      projectId: saved.projectId,
      versionNumber: saved.versionNumber,
      finishedAt: now,
      lockedUntil: null,
      // La versión ya tiene los archivos; el trabajo conserva plan y tareas.
      files: json({}),
    },
    select: { id: true },
  });
  await updateAction(db, row.actionId, {
    status: "done",
    result: `${kindLabel[plan.kind]} listo: ${plan.title}`,
    build: { buildId: row.id, status: "done", projectId: saved.projectId, versionNumber: saved.versionNumber, title: plan.title, designSystem: plan.designSystem, files: files.length },
  });
  return saved;
}

/**
 * Avanza un trabajo dentro de `budgetMs` (cabe en una función de 60 s de Vercel Hobby).
 * Si otra invocación lo tiene tomado, solo devuelve el estado.
 */
export async function advanceBuild(id: string, deps: RunnerDeps, budgetMs: number = builderLimits.stepBudgetMs): Promise<BuildView | null> {
  const db = deps.db;
  const clock = deps.now ?? (() => new Date());
  const current = await db.projectBuild.findUnique({ where: { id }, select: buildSelect });
  if (!current) return null;
  if (current.status === "done" || current.status === "failed") return buildView(current);
  if (!(await claim(db, id, clock()))) return buildView(current);

  if (clock().getTime() - current.createdAt.getTime() > builderLimits.staleMs) {
    await failBuild(current, "El trabajo tardó demasiado.", deps);
    return buildView((await db.projectBuild.findUnique({ where: { id }, select: buildSelect }))!);
  }

  const usage: ModelUsage[] = [];
  try {
    const plan = (current.plan as BuildPlan | null) ?? null;
    const { state } = await advanceEngine(
      stateOf(current),
      { brief: current.brief, kind: asKind(current.kind), title: plan?.title ?? "" },
      {
        model: deps.model ?? gatewayBuilderModel,
        now: () => clock().getTime(),
        root: deps.root,
        persist: async (next, stepUsage) => {
          usage.push(...stepUsage);
          const summary = summarizeUsage(stepUsage);
          await db.projectBuild.update({
            where: { id },
            data: {
              status: next.status === "failed" ? "running" : next.status,
              step: next.step,
              plan: next.plan ? json(next.plan) : undefined,
              files: json(next.files),
              tasks: json(next.tasks),
              report: json({ issues: next.issues.slice(0, 40) }),
              repairRound: next.repairRound,
              failures: next.failures,
              calls: { increment: summary.calls },
              inputTokens: { increment: summary.inputTokens },
              outputTokens: { increment: summary.outputTokens },
              costUsd: { increment: summary.costUsd },
              lockedUntil: new Date(clock().getTime() + builderLimits.leaseMs),
            },
            select: { id: true },
          });
        },
      },
      budgetMs,
    );
    if (state.status === "failed") await failBuild(current, state.error ?? "El generador no pudo terminar.", deps);
    else if (state.step === "save") await saveBuild(current, state, deps);
    else await db.projectBuild.update({ where: { id }, data: { lockedUntil: null }, select: { id: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    console.error("[Generador] falló el avance", { buildId: id, errorType: error instanceof Error ? error.name : typeof error });
    const fresh = await db.projectBuild.findUnique({ where: { id }, select: buildSelect });
    if (fresh && fresh.failures + 1 >= 3) await failBuild(fresh, message, deps);
    else await db.projectBuild.update({ where: { id }, data: { failures: { increment: 1 }, lockedUntil: null }, select: { id: true } });
  } finally {
    if (usage.length) {
      const providers = [...new Set(usage.map((call) => `${call.provider}:${call.model}`))];
      const row = await db.projectBuild.findUnique({ where: { id }, select: { models: true } }).catch(() => null);
      const known = new Set(row?.models ?? []);
      const fresh = providers.filter((name) => !known.has(name));
      if (fresh.length) await db.projectBuild.update({ where: { id }, data: { models: { push: fresh } }, select: { id: true } }).catch(() => null);
      await (deps.record ?? defaultRecord)({ userId: current.userId, conversationId: current.conversationId, usage: summarizeUsage(usage) }).catch(() => null);
    }
  }
  const after = await db.projectBuild.findUnique({ where: { id }, select: buildSelect });
  return after ? buildView(after) : null;
}

/** Trabajos del socio (para la tarjeta del chat y la API). */
export async function getBuildForUser(db: BuilderDb, userId: string, id: string) {
  const row = await db.projectBuild.findFirst({ where: { id, userId }, select: buildSelect });
  return row ? buildView(row) : null;
}

/**
 * Despachador de la Fase 6: retoma trabajos que nadie está sondeando (el socio cerró el chat)
 * y da por perdidos los que pasaron el tiempo máximo.
 */
export async function resumeBuilds(deps: RunnerDeps, options: { limit?: number; budgetMs?: number; idleMs?: number } = {}) {
  const db = deps.db;
  const clock = deps.now ?? (() => new Date());
  const started = clock().getTime();
  const budget = options.budgetMs ?? 45_000;
  const idle = new Date(started - (options.idleMs ?? 20_000));
  const rows = await db.projectBuild.findMany({
    where: { status: { in: ["queued", "running"] }, updatedAt: { lt: idle } },
    orderBy: { updatedAt: "asc" },
    take: options.limit ?? 3,
    select: { id: true },
  });
  let advanced = 0;
  for (const row of rows) {
    const left = budget - (clock().getTime() - started);
    if (left < 15_000) break;
    const view = await advanceBuild(row.id, deps, Math.min(left, builderLimits.stepBudgetMs));
    if (view) advanced += 1;
  }
  return { found: rows.length, advanced };
}

/** Texto que recibe el plan: lo que pidió el socio y el borrador de Vega (copy real). */
export function briefFromDelivery(args: Record<string, unknown>, payload: { title?: string; summary?: string }) {
  const lines: string[] = [];
  const brief = typeof args.brief === "string" ? args.brief.trim() : "";
  if (brief) lines.push(brief);
  if (payload.title) lines.push(`Nombre: ${payload.title}`);
  if (payload.summary) lines.push(`Resumen: ${payload.summary}`);
  if (typeof args.color === "string" && /^#[0-9a-f]{6}$/i.test(args.color)) lines.push(`Color de marca: ${args.color}`);
  if (Array.isArray(args.secciones)) {
    const content = JSON.stringify(args.secciones).slice(0, 7000);
    lines.push(`Contenido que redactó Vega (úsalo como copy base, mejóralo sin inventar datos): ${content}`);
  }
  return lines.join("\n").slice(0, 10_000);
}
