import { beforeEach, describe, expect, it, vi } from "vitest";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
const turnMocks = vi.hoisted(() => ({ prepare: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));
vi.mock("@/lib/vega/turn", () => ({ prepareVegaTurn: turnMocks.prepare, runVegaTurn: turnMocks.run }));
vi.mock("@/lib/ai/composio", () => ({ sendWhatsappReminder: vi.fn(async () => ({ sent: true })) }));
vi.mock("@/lib/ai/composio-user", () => ({ runUserTool: vi.fn(async () => ({ ok: true })), userAccount: vi.fn(async () => null) }));
vi.mock("@/lib/credits", () => ({
  creditPrices: { vegaMessage: 1, vegaTool: 3 },
  chargeCredits: vi.fn(async () => ({ ok: true, chargeId: "ch1", balance: 10, duplicate: false })),
  refundCharge: vi.fn(async () => undefined),
}));
vi.mock("@/lib/vega/agents", () => ({ ensureDefaultVegaAgent: vi.fn(async () => ({ id: "agent1" })) }));

const { createTask, pauseTask, resumeTask, listRoutineRuns } = await import("@/lib/vega/tasks");
const { claimTask, defaultRunnerDeps, dispatchRoutines, executeRun, recoverStaleRuns } = await import("@/lib/vega/routine-runner");
const { authorizedCron } = await import("@/lib/vega/dispatch-http");

type Deps = typeof defaultRunnerDeps;
const MX = "America/Mexico_City";
const now = new Date("2026-11-12T16:00:00Z"); // 10:00 en CDMX

let tasks: ReturnType<typeof table>;
let runs: ReturnType<typeof table>;
let users: ReturnType<typeof table>;
let messages: ReturnType<typeof table>;
let actions: ReturnType<typeof table>;
let notify: ReturnType<typeof vi.fn>;
let turn: ReturnType<typeof vi.fn>;

function deps(extra: Partial<Deps> = {}): Deps {
  return {
    ...defaultRunnerDeps,
    canRun: () => true,
    chat: async () => ({ id: "chat1", agentId: "agent1" }),
    notify: notify as unknown as Deps["notify"],
    turn: turn as unknown as Deps["turn"],
    ...extra,
  };
}

function addTask(data: Record<string, unknown>) {
  return tasks.create({
    data: {
      userId: "u1",
      title: "Resumen",
      instruction: "Resume mi correo",
      kind: "task",
      repeat: "daily",
      useWeb: false,
      status: "active",
      schedule: "0 9 * * *",
      timezone: MX,
      runAt: new Date("2026-11-12T15:00:00Z"),
      runCount: 0,
      failCount: 0,
      lastRunAt: null,
      lastResult: null,
      ...data,
    },
  });
}

beforeEach(() => {
  tasks = table(() => ({ status: "active", runCount: 0, failCount: 0, lastRunAt: null, lastResult: null, schedule: null, timezone: MX }));
  runs = table(() => ({ status: "queued", attempts: 0, startedAt: null, finishedAt: null, seenAt: null, result: null, actionIds: null, conversationId: null }), {
    unique: ["taskId", "scheduledFor"],
  });
  users = table();
  messages = table();
  actions = table();
  db.current = {
    vegaTask: tasks,
    vegaRoutineRun: runs,
    user: users,
    vegaMessage: messages,
    vegaConversation: table(),
    vegaAction: actions,
  };
  users.rows.push({ id: "u1", name: "Ule", email: "ule@example.com", role: "USER", package: "pro", suspendedUntil: null, vegaWhatsapp: null });
  notify = vi.fn(async () => ["correo"]);
  turn = vi.fn(async () => ({ ok: true, content: "Tienes 3 correos importantes.", actionIds: ["a1"], pendingIds: ["a1"], failed: false, stopReason: null, usage: null }));
  turnMocks.prepare.mockReset();
  turnMocks.run.mockReset();
  delete process.env.VEGA_MAX_ROUTINES;
  delete process.env.VEGA_ROUTINE_RUNS_PER_HOUR;
});

describe("crear y administrar rutinas", () => {
  it("respeta el máximo de rutinas por socio", async () => {
    process.env.VEGA_MAX_ROUTINES = "2";
    const input = { title: "Aviso", instruction: "Llama a Mariana", kind: "reminder" as const, repeat: "daily" as const, useWeb: false, date: "2026-11-12", time: "16:30" };
    expect((await createTask("u1", input, now)).ok).toBe(true);
    expect((await createTask("u1", input, now)).ok).toBe(true);
    const third = await createTask("u1", input, now);
    expect(third).toMatchObject({ ok: false });
    if (!third.ok) expect(third.error).toMatch(/2 rutinas/);
  });

  it("guarda hora exacta y zona horaria", async () => {
    const created = await createTask(
      "u1",
      { title: "Llamada", instruction: "Llama a Mariana", kind: "reminder", repeat: "once", useWeb: false, date: "2026-11-12", time: "16:30" },
      now,
    );
    expect(created.ok).toBe(true);
    expect(tasks.rows[0]).toMatchObject({ schedule: null, timezone: MX, runAt: new Date("2026-11-12T22:30:00Z") });
  });

  it("rechaza horarios de menos de 15 minutos", async () => {
    const created = await createTask(
      "u1",
      { title: "Spam", instruction: "x", kind: "task", repeat: "custom", cron: "*/5 * * * *", useWeb: false, date: "2026-11-12", time: "10:00" },
      now,
    );
    expect(created).toMatchObject({ ok: false });
    expect(tasks.rows).toHaveLength(0);
  });

  it("pausa y reanuda saltando lo que se perdió", async () => {
    const task = await addTask({ runAt: new Date("2026-11-10T15:00:00Z") });
    expect((await pauseTask("u1", task.id as string)).ok).toBe(true);
    expect((await pauseTask("u1", task.id as string)).ok).toBe(false);
    const resumed = await resumeTask("u1", task.id as string, now);
    expect(resumed.ok).toBe(true);
    expect(tasks.rows[0]).toMatchObject({ status: "active", runAt: new Date("2026-11-13T15:00:00Z") });
    expect((await resumeTask("otro", task.id as string, now)).ok).toBe(false);
  });
});

describe("despachador", () => {
  it("dos despachos simultáneos ejecutan la ocurrencia una sola vez", async () => {
    await addTask({});
    await Promise.all([
      dispatchRoutines({ now, budgetMs: 120_000, deps: deps() }),
      dispatchRoutines({ now, budgetMs: 120_000, deps: deps() }),
    ]);
    expect(runs.rows).toHaveLength(1);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(runs.rows[0]).toMatchObject({ status: "done", attempts: 1 });
    expect(tasks.rows[0]).toMatchObject({ runAt: new Date("2026-11-13T15:00:00Z"), runCount: 1 });
  });

  it("la restricción única evita duplicar una corrida aunque se reclame dos veces", async () => {
    const task = await addTask({});
    expect(await claimTask(task.id as string, now, deps())).toBe("queued");
    // Simula otro proceso que leyó el runAt viejo antes del avance.
    tasks.rows[0].runAt = new Date("2026-11-12T15:00:00Z");
    expect(await claimTask(task.id as string, now, deps())).toBe("duplicate");
    expect(runs.rows).toHaveLength(1);
  });

  it("una corrida en ejecución no la toma otro proceso", async () => {
    const task = await addTask({});
    await claimTask(task.id as string, now, deps());
    const runId = runs.rows[0].id as string;
    const [first, second] = await Promise.all([executeRun(runId, now, deps()), executeRun(runId, now, deps())]);
    expect([first, second].sort()).toEqual(["done", "skipped"]);
    expect(turn).toHaveBeenCalledTimes(1);
  });

  it("un recordatorio único termina y no vuelve a correr", async () => {
    await addTask({ kind: "reminder", repeat: "once", schedule: null, instruction: "Llama a Mariana" });
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps() });
    await dispatchRoutines({ now: new Date(now.getTime() + 3_600_000), budgetMs: 60_000, deps: deps() });
    expect(tasks.rows[0].status).toBe("done");
    expect(runs.rows).toHaveLength(1);
    expect(messages.rows[0].content).toMatch(/Llama a Mariana/);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(runs.rows[0].result).toMatch(/Vega y correo/);
  });

  it("las tareas corren en el chat de recordatorios como rutina sin socio en línea", async () => {
    const task = await addTask({});
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps() });
    const [, input] = turn.mock.calls[0];
    expect(input).toMatchObject({ conversationId: "chat1", agentId: "agent1", requestId: `routine-${runs.rows[0].id}` });
    expect(input.channelNote).toMatch(/no está en línea/);
    expect(input.channelNote).toMatch(/tarjeta pendiente/);
    expect(runs.rows[0]).toMatchObject({ status: "done", conversationId: "chat1", actionIds: ["a1"] });
    expect(runs.rows[0].result).toMatch(/1 acción esperando tu confirmación/);
    expect(task.id).toBeTruthy();
  });

  it("el turno en segundo plano no hereda un «reintenta» y junta las tarjetas pendientes", async () => {
    const preparedTurn = { userMessage: "envíalo otra vez" };
    turnMocks.prepare.mockResolvedValue({ ok: true, turn: preparedTurn });
    turnMocks.run.mockImplementation(async (passed: { userMessage?: string }, emit: (event: unknown) => void) => {
      expect(passed.userMessage).toBe("");
      emit({ t: "action", v: { id: "card1", kind: "send_email", status: "pending", payload: {} } });
      return { content: "Te dejé el correo listo para confirmar.", actionIds: ["card1"], sources: [], failed: false, stopReason: null, usage: [] };
    });
    await addTask({ instruction: "Envía el reporte a ana@cliente.mx" });
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps({ turn: defaultRunnerDeps.turn }) });
    expect(turnMocks.run).toHaveBeenCalledTimes(1);
    expect(runs.rows[0]).toMatchObject({ status: "done", actionIds: ["card1"] });
    expect(runs.rows[0].result).toMatch(/esperando tu confirmación/);
  });

  it("sin tiempo suficiente para un turno, la corrida queda en cola", async () => {
    await addTask({});
    const summary = await dispatchRoutines({ now, budgetMs: 10_000, deps: deps() });
    expect(summary).toMatchObject({ queued: 1, deferred: 1 });
    expect(runs.rows[0].status).toBe("queued");
    expect(turn).not.toHaveBeenCalled();
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps() });
    expect(runs.rows[0].status).toBe("done");
  });

  it("aplica el límite de ejecuciones por hora", async () => {
    process.env.VEGA_ROUTINE_RUNS_PER_HOUR = "1";
    await addTask({ title: "A", kind: "reminder" });
    await addTask({ title: "B", kind: "reminder", schedule: "15 9 * * *", runAt: new Date("2026-11-12T15:15:00Z") });
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps() });
    expect(runs.rows.map((run) => run.status).sort()).toEqual(["done", "skipped"]);
  });

  it("con ventana (cron diario de Hobby) adelanta lo que vence pronto sin saltarse la siguiente", async () => {
    await addTask({ kind: "reminder", runAt: new Date("2026-11-12T17:00:00Z") }); // 11:00, una hora después
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps() });
    expect(runs.rows).toHaveLength(0);
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps(), horizonMs: 90 * 60_000 });
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].scheduledFor).toEqual(new Date("2026-11-12T17:00:00Z"));
    expect(tasks.rows[0].runAt).toEqual(new Date("2026-11-13T15:00:00Z"));
  });

  it("monitor de X sin novedad: queda listo, sin aviso ni turno de Vega", async () => {
    await addTask({ kind: "x_monitor", title: "Mi marca", schedule: "0 */3 * * *" });
    const monitor = vi.fn(async () => ({ status: "quiet" as const, result: "Sin alerta. 3 posts nuevos." }));
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps({ monitor }) });
    expect(monitor).toHaveBeenCalledTimes(1);
    expect(runs.rows[0]).toMatchObject({ status: "done", result: "Sin alerta. 3 posts nuevos." });
    expect(runs.rows[0].seenAt).toBeInstanceOf(Date);
    expect(turn).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("monitor de X con pico negativo: avisa en el chat, correo y WhatsApp", async () => {
    await addTask({ kind: "x_monitor", title: "Mi marca", schedule: "0 */3 * * *" });
    const monitor = vi.fn(async () => ({ status: "alert" as const, heading: "Alerta en X: Mi marca", text: "La negatividad llegó a 80 %.", result: "Alerta enviada." }));
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps({ monitor }) });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), "Alerta en X: Mi marca", "La negatividad llegó a 80 %.");
    expect(messages.rows[0].content).toMatch(/Alerta en X: Mi marca/);
    expect(runs.rows[0]).toMatchObject({ status: "done" });
    expect(runs.rows[0].seenAt ?? null).toBeNull();
    expect(turn).not.toHaveBeenCalled();
  });

  it("con el tope mensual de costo alcanzado, la rutina queda omitida sin contar como falla", async () => {
    await addTask({});
    turn.mockResolvedValue({ ok: false, status: 429, error: "Llegaste al límite mensual de uso de IA de Vega." });
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps() });
    expect(runs.rows[0]).toMatchObject({ status: "skipped" });
    expect(runs.rows[0].result).toMatch(/límite mensual de uso de IA/);
    expect(tasks.rows[0].failCount).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("pausa las rutinas de cuentas sin Vega activa", async () => {
    await addTask({});
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps({ canRun: () => false }) });
    expect(tasks.rows[0].status).toBe("paused");
    expect(runs.rows).toHaveLength(0);
  });

  it("marca como fallidas las corridas colgadas, sin reintentarlas", async () => {
    runs.rows.push({ id: "r1", taskId: "t1", userId: "u1", scheduledFor: now, status: "running", startedAt: new Date(now.getTime() - 11 * 60_000) });
    runs.rows.push({ id: "r2", taskId: "t1", userId: "u1", scheduledFor: new Date(1), status: "running", startedAt: new Date(now.getTime() - 60_000) });
    expect(await recoverStaleRuns(now)).toBe(1);
    expect(runs.rows.find((run) => run.id === "r1")?.status).toBe("failed");
    expect(runs.rows.find((run) => run.id === "r2")?.status).toBe("running");
  });

  it("lista las ejecuciones con sus acciones aún pendientes", async () => {
    await addTask({});
    await dispatchRoutines({ now, budgetMs: 60_000, deps: deps() });
    actions.rows.push({ id: "a1", userId: "u1", status: "pending" });
    const listed = await listRoutineRuns("u1");
    expect(listed[0]).toMatchObject({ title: "Resumen", status: "done", pendingActions: 1, seen: false });
  });
});

describe("autorización del despachador", () => {
  it("exige el Bearer de CRON_SECRET", () => {
    const request = (value?: string) => new Request("https://lyra.test/api/vega/routines/dispatch", { headers: value ? { authorization: value } : {} });
    expect(authorizedCron(request("Bearer s3cret"), "s3cret")).toBe(true);
    expect(authorizedCron(request("Bearer otro"), "s3cret")).toBe(false);
    expect(authorizedCron(request(), "s3cret")).toBe(false);
    expect(authorizedCron(request("Bearer "), undefined)).toBe(false);
  });
});

describe("concurrencia", () => {
  it("corre tareas de socios distintos en paralelo y deja el resto en cola", async () => {
    process.env.VEGA_ROUTINE_CONCURRENCY = "2";
    users.rows.push({ id: "u2", name: "Ana", email: "ana@example.com", role: "USER", package: "pro", suspendedUntil: null, vegaWhatsapp: null });
    for (const [minute, userId] of [[0, "u1"], [15, "u1"], [30, "u2"]] as const) {
      await addTask({ userId, title: `T${minute}`, schedule: `${minute} 9 * * *`, runAt: new Date(`2026-11-12T15:${String(minute).padStart(2, "0")}:00Z`) });
    }
    let elapsed = 0;
    const clock = () => elapsed;
    turn.mockImplementation(async () => {
      elapsed += 20_000; // cada lote «consume» tiempo
      return { ok: true, content: "ok", actionIds: [], pendingIds: [], failed: false, stopReason: null, usage: null };
    });
    const summary = await dispatchRoutines({ now, budgetMs: 55_000, deps: deps(), clock });
    expect(turn).toHaveBeenCalledTimes(2);
    // Primer lote: una de u1 y la de u2 (nunca dos del mismo socio a la vez).
    expect(turn.mock.calls.map(([user]) => (user as { id: string }).id).sort()).toEqual(["u1", "u2"]);
    expect(summary).toMatchObject({ done: 2, deferred: 1 });
    delete process.env.VEGA_ROUTINE_CONCURRENCY;
  });
});
