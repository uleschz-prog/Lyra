import { masterPrompt } from "@/config/constellation";

import { runVegaAgent, type VegaAgentResult } from "./agent/react";
import { buildDecisionPrompt, parseDecision } from "./agent/prompt";
import { logVega, safeErrorMessage } from "./log";
import { createGatewayFromEnv, LlmGateway } from "./llm-gateway";
import { historyPoint, qdrantMemoryFromEnv, type VectorMemory } from "./memory/qdrant";
import { embedText } from "./memory/embed";
import { buildDigest, digestHasSignal, renderDigestHtml, reportWindowMs } from "./reports/digest";
import { sendOwnReportEmail } from "./reports/email";
import { runScheduledReports } from "./reports/schedule";
import { readCrisisConfig } from "./sentiment/crisis";
import {
  addListening,
  alertsForProfile,
  createAlert,
  ensureProfile,
  existingExternalIds,
  hasOpenAlert,
  listListeners,
  listSchedules,
  markScheduleSent,
  postsForProfile,
  readUserBudgetUsd,
  recentSentiments,
  saveIngest,
  saveReport,
  searchUserPosts,
  setAlertSummary,
} from "./store";
import { searchRecent } from "./x/client";
import { runSharedIngest, type IngestRunResult } from "./x/ingest";
import { runWorkerLoop } from "./x/worker-loop";

let gateway: LlmGateway | null = null;

export function getGateway(): LlmGateway {
  gateway ??= createGatewayFromEnv();
  return gateway;
}

export async function runProductionIngest(): Promise<IngestRunResult> {
  const token = process.env.X_BEARER_TOKEN?.trim();
  const listeners = await listListeners();
  const memory = qdrantMemoryFromEnv();
  return runSharedIngest({
    listeners,
    search: token
      ? (query) => searchRecent(query, { fetch, token, baseUrl: process.env.X_API_BASE })
      : null,
    existingExternalIds,
    save: saveIngest,
    recentSentiments,
    hasOpenAlert,
    createAlert,
    setAlertSummary,
    explain: explainCrisis,
    remember: memory
      ? async (points) => {
          await memory.upsert(points.map((point) => historyPoint(point)));
        }
      : undefined,
    now: new Date(),
    crisis: readCrisisConfig(),
    pack: { maxQueries: readMaxQueries() },
  });
}

export async function runProductionReports() {
  const now = new Date();
  const schedules = await listSchedules();
  return runScheduledReports({
    schedules,
    now,
    canSend: (schedule) => schedule.packageId === "FOUNDER" || schedule.packageId === "CORPORATE",
    build: async (schedule) => ({ html: await renderSchedule(schedule, now), useLlm: false }),
    summarize: async () => null,
    save: async (schedule, html) => {
      await saveReport({
        profileId: schedule.profileId,
        kind: schedule.cadence === "DAILY" ? "daily" : "weekly",
        title: schedule.cadence === "DAILY" ? "Reporte diario" : "Reporte semanal",
        payload: { cadence: schedule.cadence, generatedAt: now.toISOString() },
        html,
        periodEnd: now,
      });
    },
    send: (schedule, html) =>
      sendOwnReportEmail({
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.VEGA_REPORT_FROM,
        to: schedule.email,
        ownerEmail: schedule.email,
        subject: schedule.cadence === "DAILY" ? "Vega · reporte diario" : "Vega · reporte semanal",
        html,
        scheduled: true,
        fetch,
      }),
    markSent: (schedule, sentAt) => markScheduleSent(schedule.id, sentAt),
  });
}

export async function askVega(input: { userId: string; packageId: string; goal: string }): Promise<VegaAgentResult> {
  const profile = await ensureProfile(input.userId);
  const memory = qdrantMemoryFromEnv();
  const budgetUsd = await readUserBudgetUsd(input.userId, input.packageId);
  return runVegaAgent({
    goal: input.goal,
    decide: async (state) => {
      const result = await getGateway().complete({
        userId: input.userId,
        feature: "vega.agent",
        tier: "balanced",
        budgetUsd,
        maxTokens: 180,
        messages: [
          { role: "system", content: "Responde solo con el JSON pedido." },
          { role: "user", content: buildDecisionPrompt(state.goal, state.observations) },
        ],
      });
      const parsed = parseDecision(result.text);
      return parsed ?? { action: "finish", input: "", invalid: true };
    },
    tools: {
      searchX: async (query) => {
        const posts = await searchUserPosts(profile.id, query);
        if (posts.length === 0) {
          const keyword = query.trim().slice(0, 80);
          if (keyword.length >= 2) {
            try {
              await addListening(input.userId, { keywords: [keyword.toLowerCase()], competitors: [] });
            } catch (error) {
              logVega("warn", "vega.agent.enqueue_skipped", { userId: input.userId, message: safeErrorMessage(error) });
            }
          }
          return "Sin posts en la ingesta compartida. La búsqueda quedó en la cola común; no se consultó la X API para este usuario.";
        }
        return posts.map((post) => `${post.author}: ${post.text}`).join("\n");
      },
      queryHistory: (query) => queryHistory(memory, input.userId, query),
      generateReport: async (brief) => {
        const result = await getGateway().complete({
          userId: input.userId,
          feature: "vega.agent.report",
          tier: "balanced",
          budgetUsd,
          maxTokens: 700,
          messages: [
            { role: "system", content: `${masterPrompt}\n\nRedacta el informe en español, en JSON breve, sin prometer ingresos.` },
            { role: "user", content: brief.slice(0, 4000) },
          ],
        });
        return result.text;
      },
    },
  });
}

export async function runIngestWorker(signal: AbortSignal) {
  const raw = Number(process.env.VEGA_INGEST_INTERVAL_MS ?? 300_000);
  const intervalMs = Number.isFinite(raw) && raw >= 10_000 ? raw : 300_000;
  await runWorkerLoop({
    intervalMs,
    signal,
    run: () => runProductionIngest().then(() => undefined),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onError: (error) => logVega("error", "vega.worker.turn_failed", { message: safeErrorMessage(error) }),
  });
}

async function explainCrisis(input: {
  userId: string;
  packageId: string;
  keyword: string;
  excerpts: string[];
  negativity: number;
}): Promise<string | null> {
  try {
    const result = await getGateway().complete({
      userId: input.userId,
      feature: "vega.crisis",
      tier: "cheap",
      budgetUsd: await readUserBudgetUsd(input.userId, input.packageId),
      maxTokens: 280,
      messages: [
        { role: "system", content: `${masterPrompt}\n\nResume la crisis en un párrafo, sin prometer resultados.` },
        { role: "user", content: `Keyword: ${input.keyword}. Índice: ${input.negativity}.\n${input.excerpts.join("\n")}` },
      ],
    });
    return result.text;
  } catch (error) {
    logVega("warn", "vega.crisis.llm_skipped", { userId: input.userId, message: safeErrorMessage(error) });
    return null;
  }
}

async function renderSchedule(schedule: { profileId: string; userId: string; packageId: string; cadence: "DAILY" | "WEEKLY" }, now: Date) {
  const since = new Date(now.getTime() - reportWindowMs(schedule.cadence) * 2);
  const [posts, alerts] = await Promise.all([postsForProfile(schedule.profileId, since), alertsForProfile(schedule.profileId, since)]);
  const digest = buildDigest({ cadence: schedule.cadence, now, alerts, posts });
  let summary = digest.summary;
  if (digestHasSignal(digest)) {
    try {
      const result = await getGateway().complete({
        userId: schedule.userId,
        feature: "vega.digest",
        tier: "cheap",
        budgetUsd: await readUserBudgetUsd(schedule.userId, schedule.packageId),
        maxTokens: 400,
        messages: [
          { role: "system", content: `${masterPrompt}\n\nResume el reporte en un párrafo, sin prometer ingresos.` },
          { role: "user", content: JSON.stringify(digest).slice(0, 4000) },
        ],
      });
      summary = result.text;
    } catch (error) {
      logVega("warn", "vega.digest.llm_skipped", { userId: schedule.userId, message: safeErrorMessage(error) });
    }
  }
  return renderDigestHtml(digest, summary);
}

async function queryHistory(memory: VectorMemory | null, userId: string, query: string) {
  if (!memory) return "El histórico en Qdrant no está configurado.";
  try {
    const hits = await memory.search(embedText(query), 5, userId);
    if (hits.length === 0) return "El histórico no tiene coincidencias.";
    return hits.map((hit) => `${hit.author}: ${hit.text.slice(0, 240)}`).join("\n");
  } catch (error) {
    logVega("warn", "vega.history.failed", { userId, message: safeErrorMessage(error) });
    return "El histórico no respondió.";
  }
}

function readMaxQueries(): number {
  const raw = Number(process.env.VEGA_INGEST_MAX_QUERIES ?? 8);
  if (!Number.isInteger(raw) || raw < 1 || raw > 20) return 8;
  return raw;
}
