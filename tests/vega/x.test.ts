import { beforeEach, describe, expect, it, vi } from "vitest";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));

const { cleanHandle, monitorQuery, userQuery, X_QUERY_MAX } = await import("@/lib/vega/x/query");
const { classifyPost, evaluateCrisis, crisisConfig, nextBaseline, summarizeSentiment } = await import("@/lib/vega/x/sentiment");
const { competitorSummary, topicSummary, volumeTrend, acceleratingHashtags } = await import("@/lib/vega/x/analysis");
const { parseRecentSearch } = await import("@/lib/vega/x/client");
const { dailyPostCap, monitorCap, xCallCost, xDay } = await import("@/lib/vega/x/limits");
const { xSearch, xCounts } = await import("@/lib/vega/x/service");
const { runXTool } = await import("@/lib/vega/x/tools");
const { createXMonitor, monitorSchedule, runXMonitor } = await import("@/lib/vega/x/monitor");
const { classifyTool, externalContentTools, isClassified } = await import("@/lib/vega/policy");

const now = new Date("2026-11-12T18:00:00Z");
const ENV = { X_BEARER_TOKEN: "test-token", VEGA_X_CACHE_MINUTES: "15" };

type Tables = Record<string, ReturnType<typeof table>>;
let t: Tables;

beforeEach(() => {
  t = {
    user: table(),
    vegaXCall: table(),
    vegaXCache: table(),
    vegaUsageLog: table(),
    vegaXMonitor: table(() => ({ sinceId: null, baseline: null, lastNegativity: null, lastAlertAt: null, lastAlertNegativity: null, polls: 0, alerts: 0 })),
    vegaTask: table(() => ({ status: "active", runCount: 0, failCount: 0, lastRunAt: null, lastResult: null, useWeb: false })),
  };
  t.user.rows.push({ id: "u1", package: "STARTED", role: "MEMBER" }, { id: "u2", package: "FOUNDER", role: "MEMBER" }, { id: "u0", package: "NONE", role: "MEMBER" });
  db.current = t;
});

function tweet(id: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    text,
    author_id: "a1",
    created_at: "2026-11-12T17:00:00.000Z",
    public_metrics: { like_count: 4, retweet_count: 1, reply_count: 1, quote_count: 0, impression_count: 200 },
    entities: { hashtags: [{ tag: "Lyra" }] },
    ...extra,
  };
}

function body(tweets: unknown[], users = [{ id: "a1", username: "Marca", name: "Marca MX", public_metrics: { followers_count: 1000 } }]) {
  return { data: tweets, includes: { users }, meta: { newest_id: (tweets[0] as { id?: string } | undefined)?.id, result_count: tweets.length } };
}

function fakeFetch(responses: Array<{ status?: number; json: unknown }>) {
  const calls: URL[] = [];
  const fn = vi.fn(async (url: URL | string) => {
    calls.push(new URL(String(url)));
    const next = responses.shift() ?? { json: body([]) };
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const deps = (fetchFn: typeof fetch, env: Record<string, string> = ENV) => ({ fetch: fetchFn, env, now: () => now });
const inicio = { id: "u1", package: "STARTED", role: "MEMBER" };

describe("consultas de X", () => {
  it("limpia usuarios, arma consultas OR y respeta el largo máximo", () => {
    expect(cleanHandle("@Competidor_1")).toBe("competidor_1");
    expect(cleanHandle("https://x.com/marca/status/1")).toBe("marca");
    expect(cleanHandle("no válido!")).toBeNull();
    expect(userQuery("tacos pachuca", { lang: "es" })).toBe("tacos pachuca lang:es -is:retweet");
    expect(userQuery("#lyra is:retweet")).toBe("#lyra is:retweet");
    expect(userQuery("x".repeat(600))).toBeNull();
    expect(monitorQuery({ keywords: ["mi marca", "#Lyra"], handles: ["@lyra_mx"], lang: "es" })).toBe('("mi marca" OR Lyra OR @lyra_mx) lang:es -is:retweet');
    const long = monitorQuery({ keywords: Array.from({ length: 40 }, (_, index) => `palabra${index} larga${index}`), handles: [] })!;
    expect(long.length).toBeLessThanOrEqual(X_QUERY_MAX);
  });
});

describe("sentimiento y crisis", () => {
  it("clasifica español e inglés con negación", () => {
    expect(classifyPost("Excelente servicio, muy recomendado")).toBe("positive");
    expect(classifyPost("Es una estafa, pésimo servicio")).toBe("negative");
    expect(classifyPost("No es malo")).toBe("positive");
    expect(classifyPost("This is the worst scam ever")).toBe("negative");
    expect(classifyPost("Hoy abrimos a las 9")).toBe("neutral");
  });

  it("alerta por umbral o por pico sobre la línea base, con enfriamiento", () => {
    const config = crisisConfig({});
    const bad = Array(6).fill("negative").concat(["neutral", "positive"]) as Array<"negative" | "neutral" | "positive">;
    expect(evaluateCrisis({ labels: bad, baseline: null, lastAlertAt: null, lastAlertNegativity: null, now, config })).toMatchObject({ alert: true, reason: "umbral" });
    expect(evaluateCrisis({ labels: bad.slice(0, 3), baseline: null, lastAlertAt: null, lastAlertNegativity: null, now, config }).alert).toBe(false);
    const spike = ["negative", "negative", "negative", "neutral", "neutral", "neutral", "positive", "neutral"] as const;
    expect(evaluateCrisis({ labels: [...spike], baseline: 0.05, lastAlertAt: null, lastAlertNegativity: null, now, config })).toMatchObject({ alert: true, reason: "pico" });
    const recent = new Date(now.getTime() - 3_600_000);
    expect(evaluateCrisis({ labels: bad, baseline: null, lastAlertAt: recent, lastAlertNegativity: 0.75, now, config })).toMatchObject({ alert: false, reason: "enfriamiento" });
    expect(nextBaseline(null, 0.2, 10, 5)).toBe(0.2);
    expect(nextBaseline(0.2, 0.5, 10, 5)).toBe(0.29);
    expect(nextBaseline(0.2, 1, 1, 5)).toBe(0.2);
    expect(summarizeSentiment(["negative", "positive"]).negativity).toBe(0.5);
  });
});

describe("análisis sin modelo", () => {
  it("resume competidor, tendencias y volumen", () => {
    const parsed = parseRecentSearch(body([tweet("2", "Gran lanzamiento #Lyra excelente"), tweet("1", "Servicio lento y caro #Lyra", { public_metrics: { like_count: 50, retweet_count: 5, reply_count: 9, quote_count: 1 } })]));
    expect(parsed.posts[0]).toMatchObject({ id: "2", author: "marca", hashtags: ["lyra"] });
    const summary = competitorSummary("marca", parsed.posts, parsed.users, now);
    expect(summary).toMatchObject({ cuenta: "@marca", posts_analizados: 2, perfil: { seguidores: 1000 }, sentimiento: { positive: 1, negative: 1 } });
    expect(summary.mejores_posts[0].url).toBe("https://x.com/marca/status/1");
    expect(topicSummary(parsed.posts, now).hashtags[0]).toEqual({ tag: "lyra", count: 2 });
    const hour = 3_600_000;
    const buckets = [
      { start: new Date(now.getTime() - 30 * hour), end: new Date(now.getTime() - 29 * hour), count: 10 },
      { start: new Date(now.getTime() - 2 * hour), end: new Date(now.getTime() - hour), count: 25 },
    ];
    expect(volumeTrend(buckets, now)).toMatchObject({ ultimas_24h: 25, previas_24h: 10, cambio_pct: 150, total_7_dias: 35 });
    expect(acceleratingHashtags({ recent: [{ tag: "a", count: 4 }], previous: [{ tag: "a", count: 1 }] })[0]).toMatchObject({ tag: "a", acceleration: 3 });
  });
});

describe("topes y precios", () => {
  it("topes por plan, admin y sin plan", () => {
    expect(dailyPostCap({ id: "x", package: "STARTED" }, {})).toBe(50);
    expect(dailyPostCap({ id: "x", package: "PRO" }, {})).toBe(150);
    expect(dailyPostCap({ id: "x", package: "FOUNDER" }, {})).toBe(400);
    expect(dailyPostCap({ id: "x", package: "POLARIS" }, {})).toBe(150);
    expect(dailyPostCap({ id: "x", package: "NONE" }, {})).toBeNull();
    expect(dailyPostCap({ id: "x", package: "NONE", role: "ADMIN" }, {})).toBe(1000);
    expect(dailyPostCap({ id: "x", package: "STARTED" }, { VEGA_X_DAILY_POSTS_INICIO: "80" })).toBe(80);
    expect(monitorCap({ id: "x", package: "STARTED" }, {})).toBe(1);
    expect(monitorCap({ id: "x", package: "FOUNDER" }, {})).toBe(5);
    expect(xCallCost({ posts: 20, users: 10, counts: 1 }, {})).toBe(0.205);
    expect(xDay(new Date("2026-11-13T03:00:00Z"))).toBe("2026-11-12");
  });
});

describe("servicio de X", () => {
  it("sin credencial responde con un aviso claro y no llama a X", async () => {
    const { fn } = fakeFetch([]);
    const result = await xSearch(inicio, "lyra -is:retweet", { kind: "search", maxResults: 20 }, deps(fn, {}));
    expect(result).toMatchObject({ ok: false, code: "not_configured" });
    expect(fn).not.toHaveBeenCalled();
    expect((await xSearch(inicio, "q", { kind: "search", maxResults: 20 }, deps(fn, { ...ENV, VEGA_X: "off" }))).ok).toBe(false);
  });

  it("registra costo, cuenta contra el tope mensual y reutiliza la caché", async () => {
    const { fn, calls } = fakeFetch([{ json: body([tweet("2", "hola"), tweet("1", "adiós")]) }]);
    const first = await xSearch(inicio, "lyra -is:retweet", { kind: "search", maxResults: 20 }, deps(fn));
    expect(first).toMatchObject({ ok: true, cached: false, remainingPosts: 48 });
    expect(calls[0].pathname).toBe("/2/tweets/search/recent");
    expect(calls[0].searchParams.get("max_results")).toBe("20");
    expect(t.vegaXCall.rows[0]).toMatchObject({ userId: "u1", posts: 2, users: 1, costUsd: 0.02, day: "2026-11-12", status: "ok" });
    expect(t.vegaUsageLog.rows[0]).toMatchObject({ userId: "u1", source: "x", costUsd: 0.02, costSource: "x_api", month: "2026-11" });
    const again = await xSearch(inicio, "lyra -is:retweet", { kind: "search", maxResults: 20 }, deps(fn));
    expect(again).toMatchObject({ ok: true, cached: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(t.vegaXCall.rows).toHaveLength(1);
  });

  it("aplica el tope diario por socio y recorta max_results a lo que queda", async () => {
    t.vegaXCall.rows.push({ userId: "u1", day: "2026-11-12", posts: 35, status: "ok", kind: "search" });
    const { fn, calls } = fakeFetch([{ json: body([]) }]);
    await xSearch(inicio, "a", { kind: "search", maxResults: 50, cache: false }, deps(fn));
    expect(calls[0].searchParams.get("max_results")).toBe("15");
    t.vegaXCall.rows.push({ userId: "u1", day: "2026-11-12", posts: 10, status: "ok", kind: "search" });
    const blocked = await xSearch(inicio, "b", { kind: "search", maxResults: 50, cache: false }, deps(fn));
    expect(blocked).toMatchObject({ ok: false, code: "daily_cap" });
    expect((blocked as { error: string }).error).toMatch(/límite diario/);
  });

  it("respeta el tope global, el tope de costo y los errores de X", async () => {
    const { fn } = fakeFetch([{ status: 429, json: {} }, { status: 401, json: {} }]);
    t.vegaXCall.rows.push({ userId: "otro", day: "2026-11-12", posts: 2995, status: "ok", kind: "search" });
    expect(await xSearch(inicio, "a", { kind: "search", maxResults: 10 }, deps(fn))).toMatchObject({ ok: false, code: "global_cap" });
    t.vegaXCall.rows.length = 0;
    expect(await xSearch(inicio, "a", { kind: "search", maxResults: 10 }, deps(fn))).toMatchObject({ ok: false, code: "rate_limit" });
    expect(await xSearch(inicio, "b", { kind: "search", maxResults: 10 }, deps(fn))).toMatchObject({ ok: false, code: "auth" });
    expect(t.vegaXCall.rows.every((row) => row.costUsd === 0)).toBe(true);
    t.vegaUsageLog.rows.push({ userId: "u1", month: "2026-11", costUsd: 1 });
    expect(await xSearch(inicio, "c", { kind: "search", maxResults: 10 }, deps(fn))).toMatchObject({ ok: false, code: "cost_cap" });
  });

  it("conteos por hora y sin plan", async () => {
    const { fn, calls } = fakeFetch([{ json: { data: [{ start: "2026-11-12T16:00:00.000Z", end: "2026-11-12T17:00:00.000Z", tweet_count: 7 }] } }]);
    const counts = await xCounts(inicio, "lyra", deps(fn));
    expect(counts).toMatchObject({ ok: true, data: [{ count: 7 }] });
    expect(calls[0].searchParams.get("granularity")).toBe("hour");
    expect(t.vegaXCall.rows[0]).toMatchObject({ kind: "counts", costUsd: 0.005 });
    expect(await xCounts({ id: "u0", package: "NONE" }, "lyra", deps(fn))).toMatchObject({ ok: false, code: "no_plan" });
  });
});

describe("herramientas de Vega para X", () => {
  it("son de lectura (y su contenido es externo); el monitor es interno", () => {
    for (const name of ["buscar_en_x", "analizar_competidor", "tendencias_x"]) {
      expect(isClassified(name)).toBe(true);
      expect(classifyTool(name)).toBe("read");
      expect(externalContentTools.has(name)).toBe(true);
    }
    expect(classifyTool("configurar_monitor_x")).toBe("internal");
  });

  it("sin credencial no se caen: devuelven un aviso en español", async () => {
    const outcome = await runXTool("u1", "buscar_en_x", { consulta: "lyra" }, deps(fakeFetch([]).fn, {}), now);
    expect(outcome.kind).toBe("invalid");
    expect(JSON.stringify(outcome.response)).toMatch(/todavía no está activada/);
  });

  it("analizar_competidor y tendencias_x devuelven métricas", async () => {
    const { fn, calls } = fakeFetch([{ json: body([tweet("2", "Excelente día #Lyra"), tweet("1", "Nuevo producto")]) }]);
    const competitor = await runXTool("u1", "analizar_competidor", { cuenta: "@Marca" }, deps(fn), now);
    expect(competitor.kind).toBe("result");
    expect(calls[0].searchParams.get("query")).toBe("from:marca -is:retweet");
    expect(competitor.response).toMatchObject({ cuenta: "@marca", posts_analizados: 2 });

    const trends = fakeFetch([
      { json: { data: [{ start: "2026-11-12T16:00:00.000Z", end: "2026-11-12T17:00:00.000Z", tweet_count: 12 }] } },
      { json: { data: [tweet("5", "malo #Lyra")] } },
    ]);
    const outcome = await runXTool("u2", "tendencias_x", { palabras_clave: ["lyra"] }, deps(trends.fn), now);
    expect(outcome.kind).toBe("result");
    expect(outcome.response).toMatchObject({ volumen: { ultimas_24h: 12 }, muestra: { posts_muestra: 1 } });
    const search = trends.calls.find((url) => url.pathname.endsWith("/search/recent"))!;
    expect(search.searchParams.get("expansions")).toBeNull();
  });
});

describe("monitores de X", () => {
  it("ajusta la frecuencia al mínimo permitido", () => {
    expect(monitorSchedule("cada_hora", {})).toMatchObject({ id: "cada_hora", adjusted: false });
    expect(monitorSchedule("cada_hora", { VEGA_X_MONITOR_MIN_MINUTES: "120" })).toMatchObject({ id: "cada_3_horas", adjusted: true });
    expect(monitorSchedule(undefined, {})).toMatchObject({ id: "cada_3_horas", adjusted: false });
  });

  it("crea la rutina del monitor (y el reporte) con tope por plan", async () => {
    const created = await createXMonitor(inicio, { title: "Mi marca", keywords: ["lyra"], handles: ["@lyra_mx"], report: "semanal" }, now, ENV);
    expect(created.ok).toBe(true);
    expect(t.vegaTask.rows.map((row) => row.kind)).toEqual(["x_monitor", "task"]);
    expect(t.vegaTask.rows[0]).toMatchObject({ schedule: "0 */3 * * *", title: "Mi marca" });
    expect(String(t.vegaTask.rows[1].instruction)).toMatch(/tendencias_x.*analizar_competidor/);
    expect(t.vegaXMonitor.rows[0]).toMatchObject({ userId: "u1", keywords: ["lyra"], handles: ["lyra_mx"] });
    const second = await createXMonitor(inicio, { title: "Otra", keywords: ["otra"], handles: [] }, now, ENV);
    expect(second).toMatchObject({ ok: false });
    expect((second as { error: string }).error).toMatch(/1 monitor/);
    expect(await createXMonitor(inicio, { title: "x", keywords: [], handles: [] }, now, ENV)).toMatchObject({ ok: false });
  });

  it("sondea desde el último post visto y alerta ante un pico negativo", async () => {
    await createXMonitor(inicio, { title: "Mi marca", keywords: ["lyra"], handles: [] }, now, ENV);
    const task = { id: String(t.vegaTask.rows[0].id), title: "Mi marca" };
    const quiet = fakeFetch([{ json: { data: [tweet("10", "buen servicio"), tweet("9", "hola")], meta: { newest_id: "10" } } }]);
    const first = await runXMonitor(inicio, task, now, deps(quiet.fn), ENV);
    expect(first.status).toBe("quiet");
    expect(quiet.calls[0].searchParams.get("start_time")).toBe("2026-11-11T18:00:00Z");
    expect(t.vegaXMonitor.rows[0]).toMatchObject({ sinceId: "10", polls: 1 });

    const angry = Array.from({ length: 6 }, (_, index) => tweet(String(20 + index), "Qué estafa, pésimo servicio"));
    const bad = fakeFetch([{ json: { data: angry, meta: { newest_id: "25" } } }]);
    const second = await runXMonitor(inicio, task, new Date(now.getTime() + 3 * 3_600_000), deps(bad.fn), ENV);
    expect(bad.calls[0].searchParams.get("since_id")).toBe("10");
    expect(second.status).toBe("alert");
    if (second.status === "alert") {
      expect(second.heading).toBe("Alerta en X: Mi marca");
      expect(second.text).toMatch(/100 %/);
      expect(second.text).toMatch(/https:\/\/x\.com\/i\/status\/2/);
    }
    expect(t.vegaXMonitor.rows[0]).toMatchObject({ sinceId: "25", alerts: 1, polls: 2 });
  });

  it("sin credencial el sondeo queda omitido sin romper", async () => {
    await createXMonitor(inicio, { title: "Mi marca", keywords: ["lyra"], handles: [] }, now, ENV);
    const outcome = await runXMonitor(inicio, { id: String(t.vegaTask.rows[0].id), title: "Mi marca" }, now, deps(fakeFetch([]).fn, {}), {});
    expect(outcome).toMatchObject({ status: "skipped" });
  });
});
