import assert from "node:assert/strict";
import test from "node:test";

import { BudgetExceededError } from "../llm-gateway/errors";
import { composeCompetitorAnalysis, parseNarrative, renderCompetitorHtml } from "./competitor";
import { buildDigest } from "./digest";
import { sendOwnReportEmail } from "./email";
import { isReportDue, runScheduledReports, type ScheduleSnapshot } from "./schedule";

const now = new Date("2026-10-14T15:00:00.000Z");

test("el comparativo queda en JSON y no llama al modelo si aún no hay posts", async () => {
  let calls = 0;
  const result = await composeCompetitorAnalysis({
    usernames: ["acme", "beta"],
    posts: [],
    now,
    summarize: async () => {
      calls += 1;
      return "";
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.report.status, "pending");
  assert.equal(result.report.competitors[0]?.coverage, "pending_ingest");
  assert.equal(renderCompetitorHtml(result.report).includes("<script>"), false);
});

test("con posts, el HTML escapa el texto y un presupuesto agotado deja el heurístico", async () => {
  const posts = [
    {
      author: "acme",
      text: "<script>alert(1)</script> excelente",
      hashtags: ["lyra"],
      postedAt: now,
      sentiment: "positive" as const,
    },
  ];
  const blocked = await composeCompetitorAnalysis({
    usernames: ["acme"],
    posts,
    now,
    summarize: async () => {
      throw new BudgetExceededError(0, 1);
    },
  });
  assert.equal(blocked.llmBudgetExceeded, true);
  assert.equal(blocked.report.generatedBy, "heuristic");
  const html = renderCompetitorHtml({
    ...blocked.report,
    competitors: blocked.report.competitors.map((item) => ({ ...item, weeklyStrategy: "<script>alert(1)</script>" })),
  });
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);

  const narrated = await composeCompetitorAnalysis({
    usernames: ["acme"],
    posts,
    now,
    summarize: async () => JSON.stringify({ strategies: { acme: "Publica ofertas los lunes." }, comparison: "Acme lleva la voz." }),
  });
  assert.equal(narrated.report.generatedBy, "llm");
  assert.match(narrated.report.competitors[0]?.weeklyStrategy ?? "", /lunes/);
  assert.equal(parseNarrative("sin json"), null);
});

test("las tendencias del reporte comparan dos ventanas", () => {
  const digest = buildDigest({
    cadence: "DAILY",
    now,
    alerts: [{ keyword: "lyra", negativity: 0.8 }],
    posts: [
      { text: "a", author: "a", hashtags: ["lyra", "lyra", "lyra", "lyra"], postedAt: now, sentiment: "negative" },
      { text: "b", author: "b", hashtags: ["lyra"], postedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000), sentiment: "neutral" },
    ],
  });
  assert.equal(digest.posts, 1);
  assert.equal(digest.trends[0]?.tag, "lyra");
  assert.equal(digest.alerts.length, 1);
});

test("un reporte diario no se repite el mismo día UTC y el semanal espera siete días", () => {
  assert.equal(isReportDue({ cadence: "DAILY", lastSentAt: null, now }), true);
  assert.equal(isReportDue({ cadence: "DAILY", lastSentAt: new Date("2026-10-14T01:00:00.000Z"), now }), false);
  assert.equal(isReportDue({ cadence: "DAILY", lastSentAt: new Date("2026-10-13T23:00:00.000Z"), now }), true);
  assert.equal(isReportDue({ cadence: "WEEKLY", lastSentAt: new Date("2026-10-10T15:00:00.000Z"), now }), false);
  assert.equal(isReportDue({ cadence: "WEEKLY", lastSentAt: new Date("2026-10-01T15:00:00.000Z"), now }), true);
});

test("el correo programado solo sale al dueño y sin proveedor queda en el dashboard", async () => {
  let calls = 0;
  const missing = await sendOwnReportEmail({
    apiKey: undefined,
    from: undefined,
    to: "ana@lyra.dev",
    ownerEmail: "ana@lyra.dev",
    subject: "Vega",
    html: "<p>hola</p>",
    scheduled: true,
    fetch: async () => {
      calls += 1;
      return new Response("ok");
    },
  });
  assert.equal(missing.reason, "not_configured");
  assert.equal(calls, 0);

  const foreign = await sendOwnReportEmail({
    apiKey: "test-key",
    from: "Vega <vega@lyra.dev>",
    to: "otro@lyra.dev",
    ownerEmail: "ana@lyra.dev",
    subject: "Vega",
    html: "<p>hola</p>",
    scheduled: true,
    fetch: async () => {
      calls += 1;
      return new Response("ok");
    },
  });
  assert.equal(foreign.reason, "confirmation_required");
  assert.equal(calls, 0);
});

test("el cron de reportes omite lo que no toca y cuenta fallos", async () => {
  const due: ScheduleSnapshot = {
    id: "s1",
    profileId: "p1",
    userId: "u1",
    packageId: "FOUNDER",
    email: "ana@lyra.dev",
    cadence: "DAILY",
    enabled: true,
    lastSentAt: null,
  };
  const fresh: ScheduleSnapshot = { ...due, id: "s2", lastSentAt: now };
  const result = await runScheduledReports({
    schedules: [due, fresh],
    now,
    canSend: (schedule) => schedule.packageId === "FOUNDER",
    build: async () => ({ html: "<p>ok</p>", useLlm: false }),
    summarize: async () => null,
    save: async () => undefined,
    send: async () => ({ delivered: false, reason: "not_configured" }),
    markSent: async () => undefined,
  });
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
});
