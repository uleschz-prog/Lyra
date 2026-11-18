import { beforeEach, describe, expect, it, vi } from "vitest";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));

const scopeLib = await import("@/lib/vega/agent-scope");
const memory = await import("@/lib/vega/memory");
const tasks = await import("@/lib/vega/tasks");
const files = await import("@/lib/vega/files");
const { runVegaTool } = await import("@/lib/vega/tools");
const core = await import("@/lib/vega/jobs-core");
const { startDelegation } = await import("@/lib/vega/jobs-tool");

const main = { agentId: "vega", isDefault: true };
const luna = { agentId: "luna", isDefault: false };

let fake: Record<string, ReturnType<typeof table>> & { $transaction?: unknown };
beforeEach(() => {
  fake = {
    vegaMemory: table((data) => ({ kind: "fact", agentId: null, ...data })),
    vegaTask: table((data) => ({ agentId: null, status: "active", lastRunAt: null, lastResult: null, runCount: 0, failCount: 0, ...data })),
    vegaRoutineRun: table(),
    vegaFile: table((data) => ({ agentId: null, ...data }), { unique: ["userId", "path"] }),
    vegaAgent: table(),
    vegaConversation: table(),
    vegaMessage: table(),
    vegaAction: table(),
    vegaJob: table((data) => ({ status: "queued", ...data })),
  };
  fake.$transaction = async (fn: (tx: unknown) => unknown) => fn(fake);
  db.current = fake;
});

describe("Vega v2 · alcance por agente (lógica pura)", () => {
  it("el principal es dueño de lo suyo y de lo de antes de v2 (agentId null)", () => {
    expect(scopeLib.ownedWhere(main)).toEqual({ OR: [{ agentId: "vega" }, { agentId: null }] });
    expect(scopeLib.ownedWhere(luna)).toEqual({ agentId: "luna" });
    expect(scopeLib.ownedWhere(null)).toEqual({});
    expect(scopeLib.ownsRecord(main, null)).toBe(true);
    expect(scopeLib.ownsRecord(luna, null)).toBe(false);
  });

  it("los datos de perfil se comparten; lo demás es de cada agente", () => {
    expect(scopeLib.canSeeMemory(luna, { agentId: "vega", kind: "profile" })).toBe(true);
    expect(scopeLib.canSeeMemory(luna, { agentId: null, kind: "fact" })).toBe(false);
    expect(scopeLib.canSeeMemory(main, { agentId: null, kind: "fact" })).toBe(true);
    expect(scopeLib.canSeeMemory(luna, { agentId: "luna", kind: "preference" })).toBe(true);
  });

  it("limpia la personalidad y la convierte en instrucciones", () => {
    const persona = scopeLib.parsePersona({ tone: "directo", address: "usted", emojis: "no", length: "breve", rules: "  Firma como Luna ", extra: 1 });
    expect(persona).toEqual({ tone: "directo", address: "usted", emojis: "no", length: "breve", rules: "Firma como Luna" });
    expect(scopeLib.parsePersona({ tone: "grosero", address: "vos" })).toEqual({});
    const prompt = scopeLib.personaPrompt(persona);
    expect(prompt).toContain("Habla de usted");
    expect(prompt).toContain("No uses emojis");
    expect(prompt).toContain("Firma como Luna");
    expect(scopeLib.personaPrompt({})).toBe("");
  });
});

describe("Vega v2 · memoria por agente", () => {
  it("cada agente ve lo suyo más el perfil compartido; el principal también ve lo de antes", async () => {
    await fake.vegaMemory.create({ data: { userId: "u1", content: "Dato viejo sin agente", kind: "fact" } });
    await memory.saveMemory("u1", "Vende cosméticos en Pachuca", "profile", main);
    await memory.saveMemory("u1", "Luna escribe posts los lunes", "fact", luna);
    await memory.saveMemory("u2", "Otro socio", "fact", luna);

    const forLuna = (await memory.listMemories("u1", luna)).map((item) => item.content).sort();
    expect(forLuna).toEqual(["Luna escribe posts los lunes", "Vende cosméticos en Pachuca"]);
    const forMain = (await memory.listMemories("u1", main)).map((item) => item.content).sort();
    expect(forMain).toEqual(["Dato viejo sin agente", "Vende cosméticos en Pachuca"]);
    expect(await memory.listMemories("u1")).toHaveLength(3);
  });

  it("un agente no borra recuerdos de otro, y «borrar todo» conserva el perfil", async () => {
    const mainFact = await memory.saveMemory("u1", "Meta: 20 socios nuevos", "goal", main);
    await memory.saveMemory("u1", "Habla de usted a los clientes", "profile", main);
    await memory.saveMemory("u1", "Luna usa hashtags locales", "fact", luna);
    expect(mainFact.ok).toBe(true);
    const id = mainFact.ok ? mainFact.memory.id : "";
    expect(await memory.forgetMemory("u1", id, luna)).toBe(false);
    expect(await memory.forgetAllMemories("u1", luna)).toBe(1);
    expect((await memory.listMemories("u1")).map((item) => item.content).sort()).toEqual(["Habla de usted a los clientes", "Meta: 20 socios nuevos"]);
  });

  it("la herramienta recordar guarda con el agente del turno", async () => {
    const outcome = await runVegaTool("u1", "recordar", { dato: "Prefiere reportes en viñetas", tipo: "preferencia" }, { scope: luna });
    expect(outcome.kind).toBe("result");
    expect(fake.vegaMemory.rows[0]).toMatchObject({ agentId: "luna" });
  });
});

describe("Vega v2 · rutinas por agente", () => {
  const routine = { title: "Resumen", instruction: "Resume ventas", kind: "reminder" as const, repeat: "daily" as const, useWeb: false, date: "2026-12-01", time: "09:00" };

  it("se crean con su agente y cada agente solo lista, pausa y borra las suyas", async () => {
    const now = new Date("2026-11-18T12:00:00Z");
    await fake.vegaTask.create({ data: { userId: "u1", title: "Vieja", instruction: "x", kind: "reminder", repeat: "once", useWeb: false, runAt: new Date("2026-12-01T15:00:00Z"), schedule: null, timezone: "America/Mexico_City" } });
    const mine = await tasks.createTask("u1", routine, now, luna);
    expect(mine.ok && mine.task.agentId).toBe("luna");

    expect((await tasks.listTasks("u1", false, luna)).map((task) => task.title)).toEqual(["Resumen"]);
    expect((await tasks.listTasks("u1", false, main)).map((task) => task.title)).toEqual(["Vieja"]);
    const oldId = fake.vegaTask.rows[0].id as string;
    expect((await tasks.pauseTask("u1", oldId, luna)).ok).toBe(false);
    expect(await tasks.deleteTask("u1", oldId, luna)).toBe(false);
    expect((await tasks.pauseTask("u1", oldId, main)).ok).toBe(true);
  });
});

describe("Vega v2 · archivos compartidos con autor", () => {
  it("guarda qué agente creó el archivo y todos lo pueden leer", async () => {
    await runVegaTool("u1", "escribir_archivo", { ruta: "posts/lunes.md", contenido: "Hola" }, { scope: luna });
    expect(fake.vegaFile.rows[0]).toMatchObject({ agentId: "luna", path: "posts/lunes.md" });
    const read = await files.readWorkspaceFile("u1", "posts/lunes.md");
    expect(read.ok).toBe(true);
  });
});

describe("Vega v2 · delegar_a_agente", () => {
  it("encuentra al agente por nombre sin acentos y arma el plan (1 paso si no hay pasos)", () => {
    const agents = [{ id: "a1", name: "Lúna" }, { id: "a2", name: "Atlas" }];
    expect(core.pickTeammate(agents, "luna")?.id).toBe("a1");
    expect(core.pickTeammate(agents, "a2")?.id).toBe("a2");
    expect(core.pickTeammate(agents, "Nadie")).toBeNull();
    const plan = core.delegationPlan({ tarea: "Escribe 3 posts para Instagram" });
    expect(plan.ok && plan.steps).toHaveLength(1);
    expect(core.delegationPlan({}).ok).toBe(false);
    expect(core.delegateDeclaration([{ name: "Luna", specialty: "Redes" }]).description).toContain("Luna (Redes)");
  });

  it("crea la conversación del otro agente, el trabajo a su nombre y la tarjeta en el chat de origen", async () => {
    await fake.vegaAgent.create({ data: { id: "vega", userId: "u1", name: "Vega", avatar: "✦", isDefault: true } });
    await fake.vegaAgent.create({ data: { id: "luna", userId: "u1", name: "Luna", avatar: "🦊", isDefault: false } });
    await fake.vegaAgent.create({ data: { id: "otro", userId: "u2", name: "Intruso", avatar: "🤖", isDefault: false } });

    expect((await startDelegation(fake as never, { userId: "u1", chatId: "origen", fromAgentId: "vega", args: { agente: "Intruso", tarea: "x" } })).ok).toBe(false);
    expect((await startDelegation(fake as never, { userId: "u1", chatId: "origen", fromAgentId: "vega", args: { agente: "Vega", tarea: "x" } })).ok).toBe(false);

    const started = await startDelegation(fake as never, { userId: "u1", chatId: "origen", fromAgentId: "vega", args: { agente: "luna", tarea: "Escribe un post del evento" } });
    expect(started.ok).toBe(true);
    const chat = fake.vegaConversation.rows[0];
    expect(chat).toMatchObject({ userId: "u1", agentId: "luna" });
    const job = fake.vegaJob.rows[0];
    expect(job).toMatchObject({ agentId: "luna", conversationId: chat.id });
    const action = fake.vegaAction.rows[0];
    expect(action).toMatchObject({ conversationId: "origen", kind: "background_job" });
    expect(core.jobDraftOf(action.payload)?.delegate).toMatchObject({ name: "Luna", conversationId: chat.id });
    expect(fake.vegaMessage.rows[0]).toMatchObject({ conversationId: chat.id, role: "assistant" });
  });
});

describe("Vega v2 · resultado de una tarea delegada", () => {
  it("al terminar, el resultado también llega a la conversación de origen", async () => {
    const { defaultJobDeps } = await import("@/lib/vega/jobs");
    await fake.vegaAgent.create({ data: { id: "luna", userId: "u1", name: "Luna", avatar: "🦊", isDefault: false } });
    const action = await fake.vegaAction.create({ data: { userId: "u1", conversationId: "origen", kind: "background_job", status: "running" } });
    const job = {
      id: "job1",
      userId: "u1",
      conversationId: "chat-luna",
      agentId: "luna",
      actionId: action.id as string,
      title: "Post del evento",
      goal: "x",
      status: "done" as const,
      steps: [{ title: "Post", state: "done" as const, result: "Aquí está el post" }],
      stepIndex: 1,
      failures: 0,
      cancelRequested: false,
      lockedUntil: null,
      result: "Aquí está el post",
      error: null,
      credits: 1,
      costUsd: 0,
    };
    await defaultJobDeps(fake as never).finish(job as never);
    expect(fake.vegaAction.rows[0]).toMatchObject({ status: "done" });
    const origin = fake.vegaMessage.rows.find((row) => row.conversationId === "origen");
    expect(origin?.content).toContain("Luna terminó «Post del evento»");
    expect(origin?.content).toContain("Aquí está el post");
  });
});
