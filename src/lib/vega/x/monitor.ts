// Monitores de X (Fase 8). Cada monitor es una rutina de la Fase 6 (VegaTask kind = "x_monitor")
// que el despachador ejecuta por sondeo (polling) con la búsqueda reciente de X: Vercel no puede
// mantener abierto el filtered stream. El sondeo no usa modelo; solo avisa al socio si hay un
// pico de negatividad (alerta de crisis). El reporte programado es una rutina «tarea» aparte.
import { getPrisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE, zonedParts } from "@/lib/vega/schedule";
import { createTask, deleteTask } from "@/lib/vega/tasks";
import { interactions, postUrl } from "@/lib/vega/x/analysis";
import { monitorCap, xSettings, type XUserCtx } from "@/lib/vega/x/limits";
import { cleanHandle, keywordTerm, monitorQuery } from "@/lib/vega/x/query";
import { classifyPost, crisisConfig, evaluateCrisis, nextBaseline, summarizeSentiment } from "@/lib/vega/x/sentiment";
import { xSearch, type XServiceDeps } from "@/lib/vega/x/service";

type Env = Record<string, string | undefined>;

export type MonitorFrequency = "cada_hora" | "cada_3_horas" | "cada_6_horas" | "diario";
export type ReportFrequency = "nunca" | "diario" | "semanal";

const frequencies: Array<{ id: MonitorFrequency; minutes: number; cron: string; label: string }> = [
  { id: "cada_hora", minutes: 60, cron: "0 * * * *", label: "cada hora" },
  { id: "cada_3_horas", minutes: 180, cron: "0 */3 * * *", label: "cada 3 horas" },
  { id: "cada_6_horas", minutes: 360, cron: "0 */6 * * *", label: "cada 6 horas" },
  { id: "diario", minutes: 1440, cron: "0 9 * * *", label: "una vez al día (9:00)" },
];

/** La frecuencia pedida, o la siguiente más lenta que respete VEGA_X_MONITOR_MIN_MINUTES. */
export function monitorSchedule(requested: string | undefined, env: Env = process.env) {
  const min = xSettings(env).monitorMinMinutes;
  const wanted = frequencies.find((item) => item.id === requested) ?? frequencies[1];
  const chosen = frequencies.slice(frequencies.indexOf(wanted)).find((item) => item.minutes >= min) ?? frequencies[frequencies.length - 1];
  return { ...chosen, adjusted: chosen.id !== wanted.id };
}

export function cleanMonitorInput(input: { keywords: unknown; handles: unknown }) {
  const list = (value: unknown) => (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []).filter((item): item is string => typeof item === "string");
  const keywords = [...new Set(list(input.keywords).map((item) => item.trim()).filter((item) => keywordTerm(item)))].slice(0, 10);
  const handles = [...new Set(list(input.handles).map((item) => cleanHandle(item)).filter((item): item is string => Boolean(item)))].slice(0, 5);
  return { keywords, handles };
}

function localDate(now: Date, timezone: string) {
  const parts = zonedParts(now, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function reportInstruction(title: string, keywords: string[], handles: string[]) {
  const parts = [`Reporte de X «${title}».`];
  if (keywords.length) parts.push(`Usa tendencias_x con las palabras clave: ${keywords.join(", ")}.`);
  if (handles.length) parts.push(`Usa analizar_competidor para cada cuenta: ${handles.map((handle) => `@${handle}`).join(", ")}.`);
  parts.push(
    "Entrega un reporte breve en español: volumen y su cambio, sentimiento (positivo, negativo, neutral), temas y hashtags, posts destacados con su enlace, señales de riesgo o crisis y 3 recomendaciones concretas para el negocio del socio. No inventes cifras: usa solo lo que devuelvan las herramientas.",
  );
  return parts.join(" ");
}

export async function createXMonitor(
  user: XUserCtx,
  input: { title: string; keywords: unknown; handles: unknown; lang?: string; frequency?: string; report?: string; reportTime?: string; timezone?: string },
  now = new Date(),
  env: Env = process.env,
) {
  const prisma = getPrisma();
  const { keywords, handles } = cleanMonitorInput(input);
  if (!keywords.length && !handles.length) return { ok: false as const, error: "Dime al menos una palabra clave o una cuenta de X (@usuario) para vigilar." };
  const langCode = input.lang && /^[a-z]{2}$/i.test(input.lang.trim()) ? input.lang.trim().toLowerCase() : null;
  const query = monitorQuery({ keywords, handles, lang: langCode });
  if (!query) return { ok: false as const, error: "Esas palabras clave no forman una búsqueda válida en X." };

  const limit = monitorCap(user, env);
  const existing = await prisma.vegaTask.count({ where: { userId: user.id, kind: "x_monitor", status: { in: ["active", "paused"] } } });
  if (existing >= limit) {
    return {
      ok: false as const,
      error: limit === 0 ? "Los monitores de X están incluidos en los planes Inicio, Negocio y Pro." : `Tu plan permite ${limit} monitor${limit === 1 ? "" : "es"} de X. Borra uno o sube de plan para agregar otro.`,
    };
  }

  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const schedule = monitorSchedule(input.frequency, env);
  const title = input.title.trim().slice(0, 100) || `Monitor de X: ${[...keywords, ...handles.map((handle) => `@${handle}`)].slice(0, 3).join(", ")}`;
  const created = await createTask(
    user.id,
    {
      title,
      instruction: `Vigilar en X: ${query}`.slice(0, 1000),
      kind: "x_monitor",
      repeat: schedule.id === "diario" ? "daily" : "custom",
      useWeb: false,
      date: localDate(now, timezone),
      time: "09:00",
      timezone,
      cron: schedule.id === "diario" ? undefined : schedule.cron,
    },
    now,
  );
  if (!created.ok) return { ok: false as const, error: created.error };
  try {
    await prisma.vegaXMonitor.create({ data: { userId: user.id, taskId: created.task.id, keywords, handles, lang: langCode } });
  } catch (error) {
    await deleteTask(user.id, created.task.id).catch(() => false);
    console.error("[Vega X] no se pudo crear el monitor", error instanceof Error ? error.message : typeof error);
    return { ok: false as const, error: "No pude guardar el monitor. Intenta de nuevo." };
  }

  let report: { id: string; label: string } | null = null;
  let reportError: string | null = null;
  const reportRepeat = input.report === "diario" ? "daily" : input.report === "semanal" ? "weekly" : null;
  if (reportRepeat) {
    const time = /^\d{2}:\d{2}$/.test(input.reportTime ?? "") ? input.reportTime! : "09:00";
    const task = await createTask(
      user.id,
      {
        title: `Reporte de X: ${title}`.slice(0, 120),
        instruction: reportInstruction(title, keywords, handles),
        kind: "task",
        repeat: reportRepeat,
        useWeb: false,
        date: localDate(now, timezone),
        time,
        timezone,
      },
      now,
    );
    if (task.ok) report = { id: task.task.id, label: task.task.label };
    else reportError = task.error;
  }
  return { ok: true as const, monitor: { taskId: created.task.id, title, query, keywords, handles, frequency: schedule.label, adjusted: schedule.adjusted, nextRun: created.task.runAt }, report, reportError };
}

export type MonitorOutcome =
  | { status: "alert"; heading: string; text: string; result: string }
  | { status: "quiet"; result: string }
  | { status: "skipped"; result: string };

const pct = (value: number) => `${Math.round(value * 100)} %`;
const clip = (text: string, max = 180) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/** Un sondeo del monitor: lee lo nuevo desde el último post visto y decide si hay crisis. */
export async function runXMonitor(
  user: XUserCtx,
  task: { id: string; title: string },
  now: Date,
  deps?: XServiceDeps,
  env: Env = process.env,
): Promise<MonitorOutcome> {
  const prisma = getPrisma();
  const monitor = await prisma.vegaXMonitor.findUnique({ where: { taskId: task.id } });
  if (!monitor) return { status: "skipped", result: "Omitida: el monitor ya no existe." };
  const keywords = Array.isArray(monitor.keywords) ? (monitor.keywords as string[]) : [];
  const handles = Array.isArray(monitor.handles) ? (monitor.handles as string[]) : [];
  const query = monitorQuery({ keywords, handles, lang: monitor.lang });
  if (!query) return { status: "skipped", result: "Omitida: el monitor no tiene palabras clave válidas." };

  const found = await xSearch(
    user,
    query,
    {
      kind: "monitor",
      maxResults: xSettings(env).monitorMaxPosts,
      sinceId: monitor.sinceId,
      // Primer sondeo: últimas 24 h para tener una línea base.
      startTime: monitor.sinceId ? undefined : new Date(now.getTime() - 24 * 3_600_000),
      cache: false,
      // Sin autores: la mitad del costo; los enlaces de los ejemplos siguen funcionando.
      withUsers: false,
    },
    deps,
  );
  if (!found.ok) return { status: "skipped", result: `Omitida: ${found.error}` };

  const posts = found.data.posts;
  const labels = posts.map((post) => classifyPost(post.text));
  const config = crisisConfig(env);
  const decision = evaluateCrisis({
    labels,
    baseline: monitor.baseline,
    lastAlertAt: monitor.lastAlertAt,
    lastAlertNegativity: monitor.lastAlertNegativity,
    now,
    config,
  });
  const summary = summarizeSentiment(labels);
  await prisma.vegaXMonitor.update({
    where: { id: monitor.id },
    data: {
      sinceId: found.data.newestId ?? monitor.sinceId,
      baseline: nextBaseline(monitor.baseline, summary.negativity, summary.total, config.minPosts),
      lastNegativity: summary.total ? summary.negativity : monitor.lastNegativity,
      polls: { increment: 1 },
      ...(decision.alert ? { lastAlertAt: now, lastAlertNegativity: decision.negativity, alerts: { increment: 1 } } : {}),
    },
  });

  const counts = `${summary.total} post${summary.total === 1 ? "" : "s"} nuevo${summary.total === 1 ? "" : "s"}: ${summary.negative} negativos, ${summary.positive} positivos, ${summary.neutral} neutros`;
  if (!decision.alert) return { status: "quiet", result: `Sin alerta. ${counts}.` };

  const negatives = posts
    .map((post, index) => ({ post, label: labels[index] }))
    .filter((item) => item.label === "negative")
    .sort((a, b) => interactions(b.post) - interactions(a.post))
    .slice(0, 3);
  const why =
    decision.reason === "pico" && decision.baseline !== null
      ? `subió de ${pct(decision.baseline)} (lo normal) a ${pct(decision.negativity)}`
      : `llegó a ${pct(decision.negativity)}`;
  const examples = negatives.map(({ post }) => `• @${post.author}: «${clip(post.text)}» ${postUrl(post)}`);
  const text = [
    `La negatividad en X sobre «${task.title}» ${why}. ${counts}.`,
    ...(examples.length ? ["", "Ejemplos:", ...examples] : []),
    "",
    "Revisa si hace falta responder. Pídele a Vega «analiza la crisis en X» para un resumen y una propuesta de respuesta (no publica nada sin tu confirmación).",
  ].join("\n");
  return { status: "alert", heading: `Alerta en X: ${task.title}`, text, result: `Alerta enviada: negatividad ${pct(decision.negativity)} (${counts}).` };
}
