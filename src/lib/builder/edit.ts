// Entrega 4 · edición en el lugar: Vega cambia un proyecto v2 que ya existe (incluye los del
// marketplace). Elige pocos archivos, los reescribe con el código actual como contexto, compila,
// repara una vez y, si un archivo no queda bien, regresa a su versión original. Es pura como engine.ts.
import { bundleProject } from "@/lib/builder/bundle";
import { checkGeneratedFile, extractCode } from "@/lib/builder/checks";
import { builderLimits } from "@/lib/builder/config";
import {
  blameIssues,
  type BuildStep,
  type EngineDeps,
  type EngineState,
} from "@/lib/builder/engine";
import { allowedIcons } from "@/lib/builder/icons";
import { parseJsonObject } from "@/lib/builder/model";
import type {
  BuildKind,
  BuildPlan,
  FileTask,
  ProjectFiles,
} from "@/lib/builder/types";
import type { ModelUsage } from "@/lib/vega/usage";

/** Lo que guarda ProjectBuild.plan en una edición (no es un BuildPlan de proyecto nuevo). */
export type EditPlan = {
  mode: "edit";
  kind: BuildKind;
  title: string;
  summary: string;
  designSystem: null;
  request: string;
  projectId: string;
  baseVersion: number;
  targets: string[];
  /** Contenido original de los archivos elegidos, para regresar si algo falla. */
  originals: Record<string, string>;
  /** Qué cambió, en una frase (lo escribe el modelo al elegir archivos). */
  note: string;
  suggestions: string[];
};

export const editLimits = {
  maxTargets: 6,
  maxRequest: 2_000,
  catalogChars: 14_000,
  maxCssBytes: 24_000,
};

/** ¿Es un proyecto del generador v2 (React + Vite) que el editor sabe compilar? */
export function isEditableProject(files: ProjectFiles) {
  return (
    typeof files["src/main.tsx"] === "string" &&
    typeof files["src/App.tsx"] === "string" &&
    typeof files["index.html"] === "string"
  );
}

/** Archivos que el modelo puede tocar: secciones, componentes, páginas y los colores/tipografía. */
export function editableFiles(files: ProjectFiles) {
  return Object.keys(files)
    .filter(
      (path) =>
        /^src\/(sections|components|pages)\/[A-Za-z0-9]+\.tsx$/.test(path) ||
        path === "src/index.css",
    )
    .filter((path) => path !== "src/components/SectionBoundary.tsx")
    .sort();
}

export function componentNameOf(path: string) {
  return path
    .split("/")
    .pop()!
    .replace(/\.(tsx|ts|css)$/, "");
}

/** Textos visibles de un archivo (para que el modelo sepa dónde está cada cosa). */
export function visibleText(source: string, limit = 260) {
  const texts = [...source.matchAll(/"([^"\n]{3,140})"|>([^<>{}\n]{3,140})</g)]
    .map((match) => (match[1] ?? match[2]).trim())
    .filter(
      (text) =>
        /[a-záéíóúñ]{3}/i.test(text) &&
        !(/^[a-z0-9:/\-[\].#%\s]+$/.test(text) && /[-:]/.test(text)) &&
        !text.startsWith("../") &&
        !text.startsWith("#"),
    );
  return [...new Set(texts)].join(" · ").slice(0, limit);
}

export function initialEditState(input: {
  kind: BuildKind;
  title: string;
  summary: string;
  request: string;
  projectId: string;
  baseVersion: number;
  files: ProjectFiles;
}): EngineState {
  const plan: EditPlan = {
    mode: "edit",
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    designSystem: null,
    request: input.request.slice(0, editLimits.maxRequest),
    projectId: input.projectId,
    baseVersion: input.baseVersion,
    targets: [],
    originals: {},
    note: "",
    suggestions: [],
  };
  return {
    status: "queued",
    step: "plan",
    plan: plan as unknown as BuildPlan,
    files: input.files,
    tasks: [],
    issues: [],
    repairRound: 0,
    failures: 0,
    error: null,
  };
}

export function editPlanOf(state: Pick<EngineState, "plan">): EditPlan {
  return state.plan as unknown as EditPlan;
}

export function pickSystemPrompt() {
  return [
    "Eres el editor de proyectos de LYRA. Recibes un cambio que pide el socio y el catálogo de archivos de un proyecto React + Tailwind ya hecho.",
    `Elige los archivos MÍNIMOS que hay que modificar (máximo ${editLimits.maxTargets}). src/index.css tiene los colores y las tipografías del sitio (@theme).`,
    "No puedes crear archivos ni páginas nuevas, agregar paquetes, conectar servidores, pagos, correos o bases de datos. Si el cambio necesita eso, devuelve archivos vacío y explica en no_se_puede, en español de México, con una frase honesta.",
    'Responde SOLO JSON: {"archivos": ["src/..."], "resumen": "frase corta de lo que vas a cambiar", "no_se_puede": ""}.',
  ].join("\n");
}

export function pickUserPrompt(plan: EditPlan, files: ProjectFiles) {
  const catalog: string[] = [];
  let used = 0;
  for (const path of editableFiles(files)) {
    const line = `- ${path}: ${path.endsWith(".css") ? "colores, tipografías, radios y sombras" : visibleText(files[path] ?? "")}`;
    if (used + line.length > editLimits.catalogChars) break;
    catalog.push(line);
    used += line.length;
  }
  const routes =
    (files["src/App.tsx"] ?? "").match(/"\/[^"]*":\s*[A-Za-z]+/g)?.join(", ") ??
    "";
  return [
    `Proyecto: ${plan.title} (${plan.kind === "app" ? "app" : "sitio web"}) — ${plan.summary}`,
    routes ? `Rutas: ${routes}` : "",
    `Cambio que pide el socio: ${plan.request}`,
    `Archivos:\n${catalog.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function editSystemPrompt(kind: BuildKind, path: string) {
  const css = path.endsWith(".css");
  if (css) {
    return [
      "Eres diseñador front-end. Modificas src/index.css de un proyecto con Tailwind CSS v4.",
      'Devuelve SOLO el archivo COMPLETO en un bloque ```css. Conserva @import "tailwindcss"; y el bloque @theme con los mismos nombres de variables (--color-*, --font-*, --radius-*, --shadow-card); cambia solo los valores que pide el socio.',
      "Prohibido: otros @import, url(...) y expresiones. Si cambias tipografías usa solo familias de Google Fonts que ya estén cargadas o fuentes del sistema.",
    ].join("\n");
  }
  return [
    "Eres ingeniero front-end senior. Modificas UN archivo TSX existente de React 19 + Tailwind CSS v4 de un proyecto hecho por LYRA.",
    "Devuelve SOLO el archivo COMPLETO modificado en un bloque ```tsx, sin explicaciones.",
    "Haz exactamente el cambio pedido y conserva todo lo demás igual (estructura, nombre del componente, imports, clases del sistema, accesibilidad).",
    '- Imports permitidos: los que ya tiene el archivo, "react", "lucide-react" (solo íconos de la lista) y archivos relativos que ya existen' +
      (kind === "sitio"
        ? ' (en sitios también "../lib/leads" con { sendLead } para enviar un formulario a Contactos).'
        : "."),
    "- Prohibido: fetch, XMLHttpRequest, WebSocket, eval, new Function, dangerouslySetInnerHTML, localStorage/sessionStorage directos, import(), require, process.env, <script>, <iframe>, window.top/parent.",
    "- No escribas URLs externas salvo wa.me e images.unsplash.com si ya estaban. No inventes precios, reseñas, certificaciones ni datos que el socio no dio.",
    "- Usa SOLO las clases de color del sistema (bg-bg, bg-surface, text-ink, text-muted, border-line, bg-primary, text-primary, bg-accent…). Copia en español de México.",
  ].join("\n");
}

export function editFilePrompt(plan: EditPlan, path: string, code: string) {
  return [
    `Archivo: ${path}. Componente: ${componentNameOf(path)}.`,
    `Proyecto: ${plan.title} — ${plan.summary}`,
    `Cambio que pide el socio: ${plan.request}`,
    plan.note ? `Plan del editor: ${plan.note}` : "",
    path.endsWith(".css")
      ? ""
      : `Íconos permitidos: ${allowedIcons.join(", ")}.`,
    `Código actual:\n\`\`\`${path.endsWith(".css") ? "css" : "tsx"}\n${code}\`\`\``,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function editRepairPrompt(
  plan: EditPlan,
  path: string,
  code: string,
  errors: string[],
) {
  return [
    `Corrige ${path}. Falló la validación del servidor con estos errores:`,
    errors.map((error) => `- ${error}`).join("\n"),
    `El cambio que pidió el socio sigue siendo: ${plan.request}`,
    "Devuelve el archivo COMPLETO corregido. Cambia solo lo necesario.",
    `Código actual:\n\`\`\`${path.endsWith(".css") ? "css" : "tsx"}\n${code}\`\`\``,
  ].join("\n\n");
}

/** Revisiones de src/index.css editado por el modelo. */
export function checkEditedCss(source: string): string[] {
  const errors: string[] = [];
  if (Buffer.byteLength(source, "utf8") > editLimits.maxCssBytes)
    errors.push("El CSS es demasiado grande.");
  if (!/@import\s+["']tailwindcss["'];/.test(source))
    errors.push('Falta @import "tailwindcss";.');
  if (/@import\s+(?!["']tailwindcss["'])/.test(source))
    errors.push('Solo se permite @import "tailwindcss".');
  if (/url\s*\(|expression\s*\(|javascript:|<\/?style|<script/i.test(source))
    errors.push("No se permiten url(), expression() ni etiquetas.");
  if (!/@theme\s*\{/.test(source)) errors.push("Conserva el bloque @theme.");
  return errors.map((error) => `src/index.css: ${error}`);
}

function extractCss(text: string) {
  const fenced = [...text.matchAll(/```(?:css)?\s*\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
  return (fenced.sort((a, b) => b.length - a.length)[0] ?? text).trim() + "\n";
}

export function checkEditedFile(path: string, source: string) {
  return path.endsWith(".css")
    ? checkEditedCss(source)
    : checkGeneratedFile(path, source, componentNameOf(path));
}

function fail(state: EngineState, error: string): EngineState {
  return { ...state, status: "failed", error };
}

async function pickStep(
  state: EngineState,
  deps: EngineDeps,
  usage: ModelUsage[],
): Promise<EngineState> {
  const plan = editPlanOf(state);
  const call = await deps.model({
    purpose: "plan",
    json: true,
    system: pickSystemPrompt(),
    user: pickUserPrompt(plan, state.files),
  });
  if (call.usage) usage.push(call.usage);
  const raw = (call.ok ? parseJsonObject(call.text) : null) as {
    archivos?: unknown;
    no_se_puede?: unknown;
    resumen?: unknown;
  } | null;
  if (!raw) {
    const failures = state.failures + 1;
    return failures >= 2
      ? fail(
          { ...state, failures },
          call.ok ? "El editor no entendió el cambio." : call.error,
        )
      : { ...state, failures };
  }
  const allowed = new Set(editableFiles(state.files));
  const targets = [
    ...new Set(
      (Array.isArray(raw.archivos) ? (raw.archivos as unknown[]) : []).filter(
        (path): path is string => typeof path === "string" && allowed.has(path),
      ),
    ),
  ].slice(0, editLimits.maxTargets);
  const refusal =
    typeof raw.no_se_puede === "string"
      ? raw.no_se_puede.trim().slice(0, 300)
      : "";
  if (!targets.length)
    return fail(
      state,
      refusal ||
        "No encontré qué archivo cambiar para eso. Intenta describir el cambio con otras palabras.",
    );
  const note =
    typeof raw.resumen === "string" ? raw.resumen.trim().slice(0, 240) : "";
  const originals = Object.fromEntries(
    targets.map((path) => [path, state.files[path] ?? ""]),
  );
  const tasks: FileTask[] = targets.map((path) => ({
    path,
    ref: { chrome: -1 },
    state: "pending",
    attempts: 0,
  }));
  const next: EditPlan = { ...plan, targets, originals, note };
  return {
    ...state,
    status: "running",
    step: "generate",
    plan: next as unknown as BuildPlan,
    tasks,
    failures: 0,
  };
}

async function editTask(
  plan: EditPlan,
  path: string,
  code: string,
  deps: EngineDeps,
  usage: ModelUsage[],
  errors: string[] | null,
) {
  const call = await deps.model({
    purpose: errors ? "repair" : "file",
    system: editSystemPrompt(plan.kind, path),
    user: errors
      ? editRepairPrompt(plan, path, code, errors)
      : editFilePrompt(plan, path, code),
  });
  if (call.usage) usage.push(call.usage);
  if (!call.ok)
    return { ok: false as const, errors: [`${path}: ${call.error}`] };
  const next = path.endsWith(".css")
    ? extractCss(call.text)
    : extractCode(call.text);
  const problems = checkEditedFile(path, next);
  return problems.length
    ? { ok: false as const, errors: problems }
    : { ok: true as const, code: next };
}

async function rewriteStep(
  state: EngineState,
  deps: EngineDeps,
  usage: ModelUsage[],
  mode: "generate" | "repair",
): Promise<EngineState> {
  const plan = editPlanOf(state);
  const wanted = mode === "generate" ? "pending" : "repair";
  const batch = state.tasks
    .filter((task) => task.state === wanted)
    .slice(0, builderLimits.parallelFiles);
  if (!batch.length) return { ...state, step: "validate" };
  const results = await Promise.all(
    batch.map((task) =>
      editTask(
        plan,
        task.path,
        state.files[task.path] ?? "",
        deps,
        usage,
        mode === "repair" ? (task.errors ?? []) : null,
      ).catch(() => ({
        ok: false as const,
        errors: [`${task.path}: error inesperado`],
      })),
    ),
  );
  const files = { ...state.files };
  const tasks = state.tasks.map((task): FileTask => {
    const index = batch.findIndex((item) => item.path === task.path);
    if (index < 0) return task;
    const result = results[index];
    if (result.ok) {
      files[task.path] = result.code;
      return {
        ...task,
        state: "done",
        attempts: task.attempts + 1,
        errors: undefined,
      };
    }
    const attempts = task.attempts + 1;
    // Sin más intentos: el archivo regresa a como estaba (nunca se pierde lo que ya funcionaba).
    if (mode === "repair" || attempts >= builderLimits.fileAttempts) {
      files[task.path] = plan.originals[task.path] ?? files[task.path];
      return {
        ...task,
        state: "template",
        attempts,
        errors: result.errors.slice(0, 5),
      };
    }
    return { ...task, attempts, errors: result.errors.slice(0, 5) };
  });
  const left = tasks.some((task) => task.state === wanted);
  return { ...state, files, tasks, step: left ? mode : "validate" };
}

export function changedTargets(state: Pick<EngineState, "plan" | "files">) {
  const plan = editPlanOf(state);
  return plan.targets.filter(
    (path) => state.files[path] !== plan.originals[path],
  );
}

async function validateEdit(
  state: EngineState,
  deps: EngineDeps,
): Promise<EngineState> {
  const plan = editPlanOf(state);
  const compiled = await bundleProject(state.files, {
    minify: false,
    root: deps.root,
  });
  if (compiled.ok) {
    if (!changedTargets(state).length)
      return fail(
        { ...state, issues: [] },
        "No pude aplicar ese cambio sin romper el proyecto; no se modificó nada.",
      );
    return { ...state, step: "save", issues: [] };
  }
  const { blamed, unknown } = blameIssues(compiled.issues, state.tasks);
  const files = { ...state.files };
  const giveUp = unknown > 0 || state.repairRound >= 1;
  let changed = false;
  const tasks = state.tasks.map((task): FileTask => {
    if (task.state === "template") return task;
    const errors = blamed.get(task.path);
    if (giveUp && (unknown > 0 || errors)) {
      changed = true;
      files[task.path] = plan.originals[task.path] ?? files[task.path];
      return { ...task, state: "template", errors: errors ?? task.errors };
    }
    if (errors) {
      changed = true;
      return { ...task, state: "repair", errors: errors.slice(0, 8) };
    }
    return task;
  });
  // Los errores vienen de archivos que no tocamos: el proyecto original ya no compilaba.
  if (!changed)
    return fail(
      { ...state, issues: compiled.issues },
      "El proyecto original no compila; no se pudo editar.",
    );
  const repair = tasks.some((task) => task.state === "repair");
  return {
    ...state,
    files,
    tasks,
    issues: compiled.issues,
    step: repair ? "repair" : "validate",
    repairRound: repair ? state.repairRound + 1 : state.repairRound,
  };
}

function stepCost(step: BuildStep) {
  return step === "validate" ? 8_000 : builderLimits.modelTimeoutMs + 2_000;
}

/** Avanza la edición hasta «save», terminar, fallar o agotar el presupuesto (misma forma que advanceEngine). */
export async function advanceEdit(
  initial: EngineState,
  deps: EngineDeps,
  budgetMs: number,
): Promise<{ state: EngineState; usage: ModelUsage[] }> {
  const started = deps.now();
  let state: EngineState =
    initial.status === "queued" ? { ...initial, status: "running" } : initial;
  const usage: ModelUsage[] = [];
  while (
    state.status === "running" &&
    state.step !== "save" &&
    state.step !== "done"
  ) {
    if (budgetMs - (deps.now() - started) < stepCost(state.step)) break;
    const before = usage.length;
    try {
      if (state.step === "plan") state = await pickStep(state, deps, usage);
      else if (state.step === "generate")
        state = await rewriteStep(state, deps, usage, "generate");
      else if (state.step === "repair")
        state = await rewriteStep(state, deps, usage, "repair");
      else if (state.step === "validate")
        state = await validateEdit(state, deps);
      if (state.step !== "plan") state = { ...state, failures: 0 };
    } catch (error) {
      const failures = state.failures + 1;
      state =
        failures >= 3
          ? fail(
              { ...state, failures },
              error instanceof Error ? error.message : "Error inesperado.",
            )
          : { ...state, failures };
    }
    await deps.persist?.(state, usage.slice(before));
  }
  return { state, usage };
}
