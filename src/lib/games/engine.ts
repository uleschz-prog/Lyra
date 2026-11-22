// Modo juego dentro del generador v2: misma máquina de estados (plan → generate → validate →
// repair → save) con un solo archivo que escribe el modelo (src/game.js sobre LyraGame).
// Pura como builder/engine.ts: el runner persiste cada paso.
import { builderLimits } from "@/lib/builder/config";
import type { BuildStep, EngineDeps, EngineInput, EngineState } from "@/lib/builder/engine";
import type { EditPlan } from "@/lib/builder/edit";
import { parseJsonObject } from "@/lib/builder/model";
import type { BuildPlan, FileTask, ProjectFiles } from "@/lib/builder/types";
import { extractGameCode, validateGameCode } from "@/lib/games/checks";
import {
  gameCodeSystemPrompt,
  gameCodeUserPrompt,
  gameContextBlock,
  gameEditUserPrompt,
  gamePlanSystemPrompt,
  gamePlanUserPrompt,
  gameRepairPrompt,
} from "@/lib/games/prompts";
import {
  GAME_CODE_PATH,
  gameManifest,
  gameManifestFromFiles,
  gameProjectFiles,
  normalizeGameSpec,
  type GameSpec,
} from "@/lib/games/spec";
import type { ModelUsage } from "@/lib/vega/usage";

export const gameStepLabels: Record<BuildStep, string> = {
  plan: "Diseñando el juego",
  generate: "Programando el juego",
  validate: "Revisando el código del juego",
  repair: "Corrigiendo detalles",
  save: "Guardando la versión jugable",
  done: "Listo",
};

/** Tokens de salida para el archivo del juego (un solo archivo más largo que una sección). */
export const gameOutputTokens = 14_000;

function fail(state: EngineState, error: string): EngineState {
  return { ...state, status: "failed", error };
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown, max: number, size: number) {
  return (Array.isArray(value) ? value : []).map((item) => clean(item, size)).filter(Boolean).slice(0, max);
}

export function gameSpecOf(plan: Pick<BuildPlan, "game"> | null | undefined): GameSpec {
  return plan?.game ?? normalizeGameSpec({}, { leaderboard: false });
}

/** Plan de juego con la forma de BuildPlan (sin páginas ni entidades) para reutilizar el runner. */
export function gamePlanFrom(raw: unknown, input: { brief: string; title: string; leaderboard: boolean }): BuildPlan {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const spec = normalizeGameSpec(data, { leaderboard: input.leaderboard });
  const title = clean(data.title, 60) || clean(input.title, 60) || "Mi juego";
  const summary = clean(data.summary, 280) || `Juego de ${spec.genre} para celular y computadora.`;
  const suggestions = list(data.suggestions, 5, 160);
  return {
    version: 1,
    kind: "juego",
    title,
    summary,
    brand: { name: title, tagline: summary },
    designSystem: `juego-${spec.genre}`,
    chrome: [],
    pages: [],
    entities: [],
    suggestions: suggestions.length ? suggestions : ["Agregar niveles con dificultad creciente", "Sumar un poder especial", spec.leaderboard ? "Compartir el enlace para competir en el ranking" : "Activar el ranking en línea para competir"],
    assumptions: list(data.assumptions, 5, 200),
    game: spec,
  };
}

function codeTask(): FileTask {
  return { path: GAME_CODE_PATH, ref: { chrome: 0 }, state: "pending", attempts: 0 };
}

async function planStep(state: EngineState, input: EngineInput, deps: EngineDeps, usage: ModelUsage[]): Promise<EngineState> {
  const leaderboard = input.live === true;
  const call = await deps.model({ purpose: "plan", json: true, system: gamePlanSystemPrompt({ leaderboard }), user: gamePlanUserPrompt({ brief: input.brief, title: input.title, leaderboard }) });
  if (call.usage) usage.push(call.usage);
  const raw = call.ok ? parseJsonObject(call.text) : null;
  if (!raw) {
    const failures = state.failures + 1;
    if (failures >= 2) return fail({ ...state, failures }, call.ok ? "El plan del juego no fue válido." : call.error);
    return { ...state, failures };
  }
  const plan = gamePlanFrom(raw, { brief: input.brief, title: input.title, leaderboard });
  return { ...state, status: "running", step: "generate", plan, files: {}, tasks: [codeTask()], failures: 0 };
}

async function writeCode(deps: EngineDeps, usage: ModelUsage[], user: string, purpose: "file" | "repair") {
  const call = await deps.model({ purpose, system: gameCodeSystemPrompt(), user, maxOutputTokens: gameOutputTokens });
  if (call.usage) usage.push(call.usage);
  if (!call.ok) return { ok: false as const, code: null, text: "", errors: [call.error] };
  const code = extractGameCode(call.text);
  const errors = await validateGameCode(code);
  return errors.length ? { ok: false as const, code, text: call.text, errors } : { ok: true as const, code, text: call.text, errors: [] };
}

function withTask(state: EngineState, patch: Partial<FileTask>) {
  const tasks = state.tasks.some((task) => task.path === GAME_CODE_PATH) ? state.tasks : [...state.tasks, codeTask()];
  return tasks.map((task) => (task.path === GAME_CODE_PATH ? { ...task, ...patch } : task));
}

async function generateStep(state: EngineState, deps: EngineDeps, usage: ModelUsage[]): Promise<EngineState> {
  const plan = state.plan!;
  const task = state.tasks.find((item) => item.path === GAME_CODE_PATH) ?? codeTask();
  const result = await writeCode(deps, usage, gameCodeUserPrompt({ title: plan.title, summary: plan.summary, spec: gameSpecOf(plan) }), "file");
  const attempts = task.attempts + 1;
  if (result.ok) return { ...state, files: { ...state.files, [GAME_CODE_PATH]: result.code }, tasks: withTask(state, { state: "done", attempts, errors: undefined }), step: "validate" };
  // Con código pero con errores: se repara sobre ese código.
  if (result.code) return { ...state, files: { ...state.files, [GAME_CODE_PATH]: result.code }, tasks: withTask(state, { state: "repair", attempts, errors: result.errors.slice(0, 8) }), step: "repair" };
  if (attempts >= builderLimits.fileAttempts) return fail({ ...state, tasks: withTask(state, { attempts, errors: result.errors }) }, `No se pudo escribir el juego: ${result.errors[0] ?? "error del modelo"}`);
  return { ...state, tasks: withTask(state, { attempts, errors: result.errors.slice(0, 5) }) };
}

async function repairWith(state: EngineState, deps: EngineDeps, usage: ModelUsage[], context: string): Promise<EngineState> {
  const task = state.tasks.find((item) => item.path === GAME_CODE_PATH);
  const result = await writeCode(deps, usage, gameRepairPrompt({ context, code: state.files[GAME_CODE_PATH] ?? "", errors: task?.errors ?? [] }), "repair");
  const repairRound = state.repairRound + 1;
  if (result.ok) return { ...state, repairRound, files: { ...state.files, [GAME_CODE_PATH]: result.code }, tasks: withTask(state, { state: "done", errors: undefined }), step: "validate" };
  if (repairRound >= builderLimits.repairRounds) return fail({ ...state, repairRound, tasks: withTask(state, { errors: result.errors.slice(0, 8) }) }, `El juego no pasó la revisión: ${result.errors[0] ?? "código inválido"}`);
  return { ...state, repairRound, files: result.code ? { ...state.files, [GAME_CODE_PATH]: result.code } : state.files, tasks: withTask(state, { state: "repair", errors: result.errors.slice(0, 8) }) };
}

/** Ensambla los archivos del proyecto (index.html con el motor y el juego en línea). */
async function validateStep(state: EngineState): Promise<EngineState> {
  const plan = state.plan!;
  const code = state.files[GAME_CODE_PATH] ?? "";
  const errors = await validateGameCode(code);
  if (errors.length) return { ...state, tasks: withTask(state, { state: "repair", errors }), step: "repair" };
  const spec = gameSpecOf(plan);
  const files = gameProjectFiles({ title: plan.title, summary: plan.summary, code, manifest: gameManifest(plan.title, spec) });
  return { ...state, files, step: "save", issues: [] };
}

function stepCost(step: BuildStep) {
  return step === "validate" ? 8_000 : builderLimits.modelTimeoutMs + 2_000;
}

type Stepper = (state: EngineState, deps: EngineDeps, usage: ModelUsage[]) => Promise<EngineState>;

async function loop(initial: EngineState, deps: EngineDeps, budgetMs: number, steps: Partial<Record<BuildStep, Stepper>>) {
  const started = deps.now();
  let state: EngineState = initial.status === "queued" ? { ...initial, status: "running" } : initial;
  const usage: ModelUsage[] = [];
  while (state.status === "running" && state.step !== "save" && state.step !== "done") {
    if (budgetMs - (deps.now() - started) < stepCost(state.step)) break;
    const before = usage.length;
    const run = steps[state.step];
    if (!run) {
      state = fail(state, "Paso desconocido.");
      break;
    }
    try {
      state = await run(state, deps, usage);
      if (state.step !== "plan") state = { ...state, failures: 0 };
    } catch (error) {
      const failures = state.failures + 1;
      state = failures >= 3 ? fail({ ...state, failures }, error instanceof Error ? error.message : "Error inesperado.") : { ...state, failures };
    }
    await deps.persist?.(state, usage.slice(before));
  }
  return { state, usage };
}

/** Avanza un juego nuevo. `input.live` = ranking en línea. */
export function advanceGameEngine(initial: EngineState, input: EngineInput, deps: EngineDeps, budgetMs: number) {
  return loop(initial, deps, budgetMs, {
    plan: (state, d, usage) => planStep(state, input, d, usage),
    generate: generateStep,
    repair: (state, d, usage) => repairWith(state, d, usage, gameContextBlock(state.plan!.title, state.plan!.summary, gameSpecOf(state.plan))),
    validate: (state) => validateStep(state),
  });
}

/* ------------------------------- Edición ------------------------------- */

export function initialGameEditState(input: { title: string; summary: string; request: string; projectId: string; baseVersion: number; files: ProjectFiles }): EngineState {
  const plan: EditPlan = {
    mode: "edit",
    kind: "juego",
    title: input.title,
    summary: input.summary,
    designSystem: null,
    request: input.request.slice(0, 2_000),
    projectId: input.projectId,
    baseVersion: input.baseVersion,
    targets: [GAME_CODE_PATH],
    originals: { [GAME_CODE_PATH]: input.files[GAME_CODE_PATH] ?? "" },
    note: "",
    suggestions: [],
  };
  return { status: "queued", step: "generate", plan: plan as unknown as BuildPlan, files: input.files, tasks: [codeTask()], issues: [], repairRound: 0, failures: 0, error: null };
}

function editPlan(state: EngineState) {
  return state.plan as unknown as EditPlan;
}

function noteOf(text: string) {
  const match = text.match(/Nota:\s*([^\n]+)/i);
  return match ? match[1].trim().slice(0, 240) : "";
}

function editContext(state: EngineState) {
  const plan = editPlan(state);
  const manifest = gameManifestFromFiles(state.files);
  return `Juego: ${plan.title}\nCambio pedido: ${plan.request}\nRanking en línea: ${manifest?.leaderboard ? "sí (no lo quites)" : "no"}`;
}

async function editGenerate(state: EngineState, deps: EngineDeps, usage: ModelUsage[]): Promise<EngineState> {
  const plan = editPlan(state);
  const manifest = gameManifestFromFiles(state.files);
  const task = state.tasks.find((item) => item.path === GAME_CODE_PATH) ?? codeTask();
  const result = await writeCode(deps, usage, gameEditUserPrompt({ title: plan.title, request: plan.request, code: plan.originals[GAME_CODE_PATH] ?? "", leaderboard: Boolean(manifest?.leaderboard) }), "file");
  const attempts = task.attempts + 1;
  const note = noteOf(result.text);
  const nextPlan = (note ? { ...plan, note } : plan) as unknown as BuildPlan;
  if (result.ok) return { ...state, plan: nextPlan, files: { ...state.files, [GAME_CODE_PATH]: result.code }, tasks: withTask(state, { state: "done", attempts }), step: "validate" };
  if (result.code) return { ...state, plan: nextPlan, files: { ...state.files, [GAME_CODE_PATH]: result.code }, tasks: withTask(state, { state: "repair", attempts, errors: result.errors.slice(0, 8) }), step: "repair" };
  if (attempts >= builderLimits.fileAttempts) return fail(state, "No pude aplicar ese cambio al juego; no se modificó nada.");
  return { ...state, tasks: withTask(state, { attempts, errors: result.errors.slice(0, 5) }) };
}

async function editValidate(state: EngineState): Promise<EngineState> {
  const plan = editPlan(state);
  const code = state.files[GAME_CODE_PATH] ?? "";
  const errors = await validateGameCode(code);
  if (errors.length) return { ...state, tasks: withTask(state, { state: "repair", errors }), step: "repair" };
  if (code === plan.originals[GAME_CODE_PATH]) return fail(state, "No pude aplicar ese cambio al juego; no se modificó nada.");
  const manifest = gameManifestFromFiles(state.files);
  if (!manifest) return fail(state, "El juego no tiene su manifiesto (lyra.game.json).");
  const files = { ...state.files, ...gameProjectFiles({ title: plan.title, summary: plan.summary, code, manifest }) };
  return { ...state, files, step: "save", issues: [] };
}

/** Avanza la edición de un juego (reescribe src/game.js con el cambio y lo vuelve a ensamblar). */
export function advanceGameEdit(initial: EngineState, deps: EngineDeps, budgetMs: number) {
  return loop(initial, deps, budgetMs, {
    // El trabajo de edición se crea con step «plan»: en un juego no hay que elegir archivos.
    plan: editGenerate,
    generate: editGenerate,
    repair: (state, d, usage) => repairWith(state, d, usage, editContext(state)),
    validate: (state) => editValidate(state),
  });
}
