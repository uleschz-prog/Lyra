// Máquina de estados del generador v2. Es pura (sin base de datos): recibe el estado, el
// modelo y un reloj, avanza pasos mientras alcance el presupuesto y devuelve el nuevo estado.
// El runner la persiste después de cada paso, así cualquier invocación puede retomarla.
import { bundleProject, type CompileIssue } from "@/lib/builder/bundle";
import { checkGeneratedFile, extractCode } from "@/lib/builder/checks";
import { builderLimits } from "@/lib/builder/config";
import { fileSystemPrompt, filePrompt, repairPrompt, templateSource } from "@/lib/builder/generate";
import { allowedIcons } from "@/lib/builder/icons";
import { parseJsonObject, type BuilderModel } from "@/lib/builder/model";
import { composeSkeleton, normalizePlan, planSystemPrompt, planUserPrompt } from "@/lib/builder/plan";
import { fileTasks, scaffoldFiles, sectionForTask } from "@/lib/builder/scaffold";
import type { BuildKind, BuildPlan, FileTask, ProjectFiles } from "@/lib/builder/types";
import type { ModelUsage } from "@/lib/vega/usage";

export type BuildStep = "plan" | "generate" | "validate" | "repair" | "save" | "done";

export type EngineState = {
  status: "queued" | "running" | "done" | "failed";
  step: BuildStep;
  plan: BuildPlan | null;
  files: ProjectFiles;
  tasks: FileTask[];
  issues: CompileIssue[];
  repairRound: number;
  failures: number;
  error: string | null;
};

export type EngineInput = { brief: string; kind: BuildKind; title: string };

export type EngineDeps = {
  model: BuilderModel;
  now: () => number;
  /** Se llama después de cada paso para guardar el avance. */
  persist?: (state: EngineState, usage: ModelUsage[]) => Promise<void>;
  /** Para pruebas: compila sin minificar. */
  root?: string;
};

export function initialState(): EngineState {
  return { status: "queued", step: "plan", plan: null, files: {}, tasks: [], issues: [], repairRound: 0, failures: 0, error: null };
}

const maxStepFailures = 3;

/** Porcentaje aproximado para la tarjeta del chat. */
export function progressOf(state: Pick<EngineState, "step" | "tasks" | "status">) {
  if (state.status === "done") return 100;
  if (state.step === "plan") return 5;
  if (state.step === "generate") {
    const total = state.tasks.length || 1;
    const finished = state.tasks.filter((task) => task.state !== "pending").length;
    return Math.round(12 + (finished / total) * 68);
  }
  if (state.step === "validate") return 84;
  if (state.step === "repair") return 88;
  if (state.step === "save") return 95;
  return 100;
}

export const stepLabels: Record<BuildStep, string> = {
  plan: "Diseñando el plan y el sistema visual",
  generate: "Escribiendo los componentes",
  validate: "Compilando y revisando el código",
  repair: "Corrigiendo detalles",
  save: "Guardando la versión y la vista previa",
  done: "Listo",
};

function fail(state: EngineState, error: string): EngineState {
  return { ...state, status: "failed", error };
}

/** Une los errores de compilación con el archivo generado que los causa. */
export function blameIssues(issues: CompileIssue[], tasks: FileTask[]) {
  const taskPaths = new Set(tasks.map((task) => task.path));
  const blamed = new Map<string, string[]>();
  let unknown = 0;
  for (const issue of issues) {
    const mentioned = [...issue.message.matchAll(/src\/(?:sections|components)\/[A-Za-z0-9]+\.tsx/g)].map((match) => match[0]).find((path) => taskPaths.has(path));
    const path = mentioned ?? (issue.path && taskPaths.has(issue.path) ? issue.path : null);
    if (!path) {
      unknown += 1;
      continue;
    }
    blamed.set(path, [...(blamed.get(path) ?? []), issue.message]);
  }
  return { blamed, unknown };
}

async function planStep(state: EngineState, input: EngineInput, deps: EngineDeps, usage: ModelUsage[]): Promise<EngineState> {
  const composition = composeSkeleton(input.brief, input.kind);
  const call = await deps.model({
    purpose: "plan",
    json: true,
    system: planSystemPrompt(input.kind),
    user: planUserPrompt({ brief: input.brief, kind: input.kind, composition, icons: allowedIcons }),
  });
  if (call.usage) usage.push(call.usage);
  const raw = call.ok ? parseJsonObject(call.text) : null;
  if (!raw) {
    const failures = state.failures + 1;
    if (failures >= 2) return fail({ ...state, failures }, call.ok ? "El plan del modelo no fue válido." : call.error);
    return { ...state, failures };
  }
  const plan = normalizePlan(raw, { brief: input.brief, kind: input.kind, composition, fallbackTitle: input.title });
  return { ...state, status: "running", step: "generate", plan, files: scaffoldFiles(plan), tasks: fileTasks(plan), failures: 0 };
}

async function writeTask(plan: BuildPlan, task: FileTask, deps: EngineDeps, usage: ModelUsage[], repair: { code: string; errors: string[] } | null) {
  const section = sectionForTask(plan, task);
  const call = await deps.model({
    purpose: repair ? "repair" : "file",
    system: fileSystemPrompt(plan.kind),
    user: repair ? repairPrompt(plan, task, repair.code, repair.errors) : filePrompt(plan, task),
  });
  if (call.usage) usage.push(call.usage);
  if (!call.ok) return { ok: false as const, errors: [`${task.path}: ${call.error}`] };
  const code = extractCode(call.text);
  const errors = checkGeneratedFile(task.path, code, section.name);
  return errors.length ? { ok: false as const, errors, code } : { ok: true as const, code };
}

async function generateStep(state: EngineState, deps: EngineDeps, usage: ModelUsage[]): Promise<EngineState> {
  const plan = state.plan!;
  const pending = state.tasks.filter((task) => task.state === "pending").slice(0, builderLimits.parallelFiles);
  if (!pending.length) return { ...state, step: "validate" };
  const results = await Promise.all(pending.map((task) => writeTask(plan, task, deps, usage, null).catch(() => ({ ok: false as const, errors: [`${task.path}: error inesperado`] }))));
  const files = { ...state.files };
  const tasks = state.tasks.map((task) => {
    const index = pending.findIndex((item) => item.path === task.path);
    if (index < 0) return task;
    const result = results[index];
    if (result.ok) {
      files[task.path] = result.code;
      return { ...task, state: "done" as const, attempts: task.attempts + 1, errors: undefined };
    }
    const attempts = task.attempts + 1;
    if (attempts >= builderLimits.fileAttempts) {
      files[task.path] = templateSource(plan, task);
      return { ...task, state: "template" as const, attempts, errors: result.errors.slice(0, 5) };
    }
    return { ...task, attempts, errors: result.errors.slice(0, 5) };
  });
  const left = tasks.some((task) => task.state === "pending");
  return { ...state, files, tasks, step: left ? "generate" : "validate" };
}

async function validateStep(state: EngineState, deps: EngineDeps): Promise<EngineState> {
  const compiled = await bundleProject(state.files, { minify: false, root: deps.root });
  if (compiled.ok) return { ...state, step: "save", issues: [] };
  const plan = state.plan!;
  const { blamed, unknown } = blameIssues(compiled.issues, state.tasks);
  const allTemplates = state.tasks.every((task) => task.state === "template");
  if (allTemplates) return fail({ ...state, issues: compiled.issues }, "No se pudo compilar el proyecto.");
  const files = { ...state.files };
  // Errores que no podemos atribuir o ya sin rondas de reparación: se usan las secciones de la biblioteca.
  const useTemplates = unknown > 0 || state.repairRound >= builderLimits.repairRounds;
  let changed = false;
  const tasks = state.tasks.map((task): FileTask => {
    const errors = blamed.get(task.path);
    if (task.state === "template") return task;
    if (useTemplates && (unknown > 0 || errors)) {
      changed = true;
      files[task.path] = templateSource(plan, task);
      return { ...task, state: "template", errors: errors ?? task.errors };
    }
    if (errors) {
      changed = true;
      return { ...task, state: "repair", errors: errors.slice(0, 8) };
    }
    return task;
  });
  // Si los errores solo están en secciones de la biblioteca no hay nada más que intentar.
  if (!changed) return fail({ ...state, issues: compiled.issues }, "No se pudo compilar el proyecto.");
  const needsRepair = tasks.some((task) => task.state === "repair");
  return {
    ...state,
    files,
    tasks,
    issues: compiled.issues,
    step: needsRepair ? "repair" : "validate",
    repairRound: needsRepair ? state.repairRound + 1 : state.repairRound,
  };
}

async function repairStep(state: EngineState, deps: EngineDeps, usage: ModelUsage[]): Promise<EngineState> {
  const plan = state.plan!;
  const batch = state.tasks.filter((task) => task.state === "repair").slice(0, builderLimits.parallelFiles);
  if (!batch.length) return { ...state, step: "validate" };
  const results = await Promise.all(
    batch.map((task) => writeTask(plan, task, deps, usage, { code: state.files[task.path] ?? "", errors: task.errors ?? [] }).catch(() => ({ ok: false as const, errors: [`${task.path}: error inesperado`] }))),
  );
  const files = { ...state.files };
  const tasks = state.tasks.map((task) => {
    const index = batch.findIndex((item) => item.path === task.path);
    if (index < 0) return task;
    const result = results[index];
    if (result.ok) {
      files[task.path] = result.code;
      return { ...task, state: "done" as const, errors: undefined };
    }
    files[task.path] = templateSource(plan, task);
    return { ...task, state: "template" as const, errors: result.errors.slice(0, 5) };
  });
  const left = tasks.some((task) => task.state === "repair");
  return { ...state, files, tasks, step: left ? "repair" : "validate" };
}

/** Tiempo estimado de cada paso para decidir si cabe en lo que queda de la invocación. */
function stepCost(step: BuildStep) {
  if (step === "plan" || step === "generate" || step === "repair") return builderLimits.modelTimeoutMs + 2_000;
  return 8_000;
}

/**
 * Avanza el trabajo hasta llegar a «save», terminar, fallar o agotar el presupuesto.
 * Un paso que lanza una excepción cuenta como fallo; tres seguidos terminan el trabajo.
 */
export async function advanceEngine(initial: EngineState, input: EngineInput, deps: EngineDeps, budgetMs: number): Promise<{ state: EngineState; usage: ModelUsage[] }> {
  const started = deps.now();
  let state: EngineState = initial.status === "queued" ? { ...initial, status: "running" } : initial;
  const usage: ModelUsage[] = [];
  while (state.status === "running" && state.step !== "save" && state.step !== "done") {
    const left = budgetMs - (deps.now() - started);
    if (left < stepCost(state.step)) break;
    const before = usage.length;
    try {
      if (state.step === "plan") state = await planStep(state, input, deps, usage);
      else if (state.step === "generate") state = await generateStep(state, deps, usage);
      else if (state.step === "validate") state = await validateStep(state, deps);
      else if (state.step === "repair") state = await repairStep(state, deps, usage);
      if (state.step !== "plan") state = { ...state, failures: 0 };
    } catch (error) {
      const failures = state.failures + 1;
      state = failures >= maxStepFailures ? fail({ ...state, failures }, error instanceof Error ? error.message : "Error inesperado.") : { ...state, failures };
    }
    await deps.persist?.(state, usage.slice(before));
  }
  return { state, usage };
}
