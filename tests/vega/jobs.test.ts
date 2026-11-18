import { describe, expect, it, vi } from "vitest";

import {
  advanceJobOnce,
  jobLimits,
  jobProgress,
  jobView,
  planFromArgs,
  runJob,
  stepMessage,
  type JobDeps,
  type JobRecord,
  type JobStore,
  type StepOutcome,
} from "@/lib/vega/jobs-core";

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job_1",
    userId: "u1",
    conversationId: "c1",
    agentId: null,
    actionId: "a1",
    title: "Comparar proveedores",
    goal: "Encontrar el mejor proveedor de empaques en Pachuca.",
    status: "queued",
    steps: [
      { title: "Buscar proveedores", state: "pending" },
      { title: "Comparar precios", state: "pending" },
      { title: "Recomendar", state: "pending" },
    ],
    stepIndex: 0,
    failures: 0,
    cancelRequested: false,
    lockedUntil: null,
    result: null,
    error: null,
    credits: 0,
    costUsd: 0,
    ...overrides,
  };
}

/** Almacén en memoria con la misma semántica de candado que el de Prisma. */
function memoryStore(initial: JobRecord) {
  const state = { job: structuredClone(initial) };
  const store: JobStore = {
    claim: async (id, now, leaseUntil) => {
      const job = state.job;
      if (job.id !== id || !(job.status === "queued" || job.status === "running")) return null;
      if (job.lockedUntil && job.lockedUntil >= now) return null;
      job.lockedUntil = leaseUntil;
      return structuredClone(job);
    },
    load: async (id) => (state.job.id === id ? structuredClone(state.job) : null),
    save: async (_id, patch) => {
      const { startedAt: _started, finishedAt: _finished, ...rest } = patch;
      void _started;
      void _finished;
      Object.assign(state.job, structuredClone(rest));
    },
  };
  return { state, store };
}

function deps(store: JobStore, runStep: JobDeps["runStep"], clock?: () => number) {
  const finish = vi.fn(async () => undefined);
  return { deps: { store, runStep, finish, ...(clock ? { now: clock } : {}) } satisfies JobDeps, finish };
}

const ok = (content: string, extra: Partial<Extract<StepOutcome, { ok: true }>> = {}): StepOutcome => ({ ok: true, content, actionIds: [], credits: 1, costUsd: 0.001, ...extra });

describe("planFromArgs", () => {
  it("acepta de 2 a 5 pasos y recorta el resto", () => {
    const plan = planFromArgs({ titulo: "Plan", objetivo: "Hacer algo", pasos: ["a", "b", "c", "d", "e", "f", "g"] });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.steps).toHaveLength(jobLimits.maxSteps);
  });

  it("rechaza trabajos de un solo paso o sin objetivo", () => {
    expect(planFromArgs({ titulo: "Plan", objetivo: "x", pasos: ["solo uno"] }).ok).toBe(false);
    expect(planFromArgs({ titulo: "Plan", pasos: ["a", "b"] }).ok).toBe(false);
  });
});

describe("advanceJobOnce", () => {
  it("ejecuta un paso por llamada y termina con el resultado del último", async () => {
    const { state, store } = memoryStore(makeJob());
    const runStep = vi.fn(async (_job: JobRecord, index: number) => ok(`resultado ${index + 1}`, { actionIds: index === 0 ? ["act1"] : [] }));
    const { deps: d, finish } = deps(store, runStep);

    const first = await advanceJobOnce("job_1", d, 50_000);
    expect(first.advanced).toBe(true);
    expect(runStep).toHaveBeenCalledTimes(1);
    expect(state.job.status).toBe("running");
    expect(state.job.stepIndex).toBe(1);
    expect(state.job.steps[0]).toMatchObject({ state: "done", result: "resultado 1", actionIds: ["act1"] });
    expect(state.job.lockedUntil).toBeNull();
    expect(jobProgress(state.job)).toBe(33);

    await advanceJobOnce("job_1", d, 50_000);
    const last = await advanceJobOnce("job_1", d, 50_000);
    expect(runStep).toHaveBeenCalledTimes(3);
    expect(last.job?.status).toBe("done");
    expect(state.job.result).toBe("resultado 3");
    expect(state.job.credits).toBe(3);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(jobView(state.job)).toMatchObject({ status: "done", progress: 100, result: "resultado 3" });

    // Ya terminado: no vuelve a correr nada.
    const again = await advanceJobOnce("job_1", d, 50_000);
    expect(again.advanced).toBe(false);
    expect(runStep).toHaveBeenCalledTimes(3);
  });

  it("no corre el paso si otra invocación tiene el candado", async () => {
    const { store } = memoryStore(makeJob({ status: "running", lockedUntil: new Date(Date.now() + 60_000) }));
    const runStep = vi.fn(async () => ok("x"));
    const { deps: d } = deps(store, runStep);
    const result = await advanceJobOnce("job_1", d, 50_000);
    expect(result.advanced).toBe(false);
    expect(runStep).not.toHaveBeenCalled();
  });

  it("dos llamadas simultáneas ejecutan el paso una sola vez", async () => {
    const { state, store } = memoryStore(makeJob());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runStep = vi.fn(async () => {
      await gate;
      return ok("uno");
    });
    const { deps: d } = deps(store, runStep);
    const a = advanceJobOnce("job_1", d, 50_000);
    const b = advanceJobOnce("job_1", d, 50_000);
    await Promise.resolve();
    release();
    const results = await Promise.all([a, b]);
    expect(runStep).toHaveBeenCalledTimes(1);
    expect(results.filter((item) => item.advanced)).toHaveLength(1);
    expect(state.job.stepIndex).toBe(1);
  });

  it("no empieza un paso si no alcanza el tiempo de la invocación", async () => {
    const { store } = memoryStore(makeJob());
    const runStep = vi.fn(async () => ok("x"));
    const { deps: d } = deps(store, runStep);
    const result = await advanceJobOnce("job_1", d, jobLimits.minStepMs - 1);
    expect(result.advanced).toBe(false);
    expect(runStep).not.toHaveBeenCalled();
  });

  it("cancela antes del siguiente paso sin cobrar más", async () => {
    const { state, store } = memoryStore(makeJob({ status: "running", stepIndex: 1, cancelRequested: true, steps: [{ title: "a", state: "done", result: "r" }, { title: "b", state: "pending" }, { title: "c", state: "pending" }] }));
    const runStep = vi.fn(async () => ok("x"));
    const { deps: d, finish } = deps(store, runStep);
    const result = await advanceJobOnce("job_1", d, 50_000);
    expect(runStep).not.toHaveBeenCalled();
    expect(result.job?.status).toBe("canceled");
    expect(state.job.steps.map((step) => step.state)).toEqual(["done", "skipped", "skipped"]);
    expect(finish).toHaveBeenCalledOnce();
  });

  it("si se cancela durante un paso, guarda ese paso y no hace los siguientes", async () => {
    const { state, store } = memoryStore(makeJob());
    const runStep = vi.fn(async () => {
      state.job.cancelRequested = true; // el socio tocó «Cancelar» mientras corría
      return ok("primer resultado");
    });
    const { deps: d } = deps(store, runStep);
    const result = await advanceJobOnce("job_1", d, 50_000);
    expect(result.job?.status).toBe("canceled");
    expect(state.job.steps.map((step) => step.state)).toEqual(["done", "skipped", "skipped"]);
  });

  it("reintenta una vez un paso fallido y luego da el trabajo por fallido", async () => {
    const { state, store } = memoryStore(makeJob());
    const runStep = vi.fn(async (): Promise<StepOutcome> => ({ ok: false, retry: true, error: "El modelo no respondió." }));
    const { deps: d, finish } = deps(store, runStep);
    await advanceJobOnce("job_1", d, 50_000);
    expect(state.job).toMatchObject({ status: "running", failures: 1, stepIndex: 0 });
    expect(state.job.steps[0].state).toBe("pending");
    const second = await advanceJobOnce("job_1", d, 50_000);
    expect(second.job?.status).toBe("failed");
    expect(state.job.error).toBe("El modelo no respondió.");
    expect(state.job.steps.map((step) => step.state)).toEqual(["failed", "skipped", "skipped"]);
    expect(finish).toHaveBeenCalledOnce();
  });

  it("no reintenta lo que no tiene arreglo (p. ej. sin créditos)", async () => {
    const { state, store } = memoryStore(makeJob());
    const runStep = vi.fn(async (): Promise<StepOutcome> => ({ ok: false, retry: false, error: "Sin créditos." }));
    const { deps: d } = deps(store, runStep);
    await advanceJobOnce("job_1", d, 50_000);
    expect(state.job.status).toBe("failed");
    expect(runStep).toHaveBeenCalledOnce();
  });

  it("un error inesperado cuenta como fallo reintentable", async () => {
    const { state, store } = memoryStore(makeJob());
    const runStep = vi.fn(async (): Promise<StepOutcome> => {
      throw new Error("timeout");
    });
    const { deps: d } = deps(store, runStep);
    await advanceJobOnce("job_1", d, 50_000);
    expect(state.job).toMatchObject({ status: "running", failures: 1 });
  });
});

describe("runJob", () => {
  it("avanza pasos mientras quede presupuesto en la invocación (cada paso < 60 s)", async () => {
    let now = 0;
    const clock = () => now;
    const { state, store } = memoryStore(makeJob({ steps: [1, 2, 3, 4, 5].map((n) => ({ title: `p${n}`, state: "pending" as const })) }));
    const budgets: number[] = [];
    const runStep = vi.fn(async (_job: JobRecord, index: number, budgetMs: number) => {
      budgets.push(budgetMs);
      now += 15_000;
      return ok(`r${index}`);
    });
    const { deps: d } = deps(store, runStep, clock);
    const job = await runJob("job_1", d, 55_000);
    // 55 s: pasos en t=0, 15 y 30; a los 45 s quedan 10 s (< 20 s) y se detiene.
    expect(runStep).toHaveBeenCalledTimes(3);
    expect(job?.status).toBe("running");
    expect(state.job.stepIndex).toBe(3);
    expect(Math.max(...budgets)).toBeLessThanOrEqual(jobLimits.stepBudgetMs);
    // La siguiente invocación termina el trabajo.
    now = 100_000;
    const finished = await runJob("job_1", d, 55_000);
    expect(finished?.status).toBe("done");
  });
});

describe("stepMessage", () => {
  it("incluye los resultados previos y pide el resultado final en el último paso", () => {
    const job = makeJob({ steps: [{ title: "Buscar", state: "done", result: "3 proveedores" }, { title: "Comparar", state: "done", result: "B es más barato" }, { title: "Recomendar", state: "pending" }] });
    const message = stepMessage(job, 2);
    expect(message).toContain("paso 3 de 3");
    expect(message).toContain("3 proveedores");
    expect(message).toContain("B es más barato");
    expect(message).toContain("último paso");
    expect(stepMessage(job, 0)).toContain("Haz solo este paso");
  });
});
