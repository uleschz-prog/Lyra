import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runDueWhatsappMessages: vi.fn(),
  dispatchRoutines: vi.fn(),
  closeMonth: vi.fn(),
  resumeJobs: vi.fn(),
  resumeBuilds: vi.fn(),
}));

vi.mock("@/lib/whatsapp/scheduled", () => ({ runDueWhatsappMessages: mocks.runDueWhatsappMessages }));
vi.mock("@/lib/vega/routine-runner", () => ({ dispatchRoutines: mocks.dispatchRoutines }));
vi.mock("@/lib/compensation/close", () => ({ closeMonth: mocks.closeMonth }));
vi.mock("@/lib/builder/runner", () => ({ resumeBuilds: mocks.resumeBuilds }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/vega/jobs", () => ({ resumeJobs: mocks.resumeJobs, defaultJobDeps: vi.fn(), kickJobDispatch: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));

const { checkCronAuth } = await import("@/lib/cron/auth");
const { authorizedCron } = await import("@/lib/vega/dispatch-http");
const whatsapp = await import("@/app/api/whatsapp/scheduled/run/route");
const routines = await import("@/app/api/vega/routines/dispatch/route");
const daily = await import("@/app/api/vega/tasks/run/route");
const commissions = await import("@/app/api/commissions/close/route");
const jobs = await import("@/app/api/vega/jobs/dispatch/route");

const SECRET = "a".repeat(64);
const req = (path: string, init: { method?: string; auth?: string } = {}) =>
  new Request(`https://lyra.test${path}`, { method: init.method ?? "GET", headers: init.auth === undefined ? {} : { authorization: init.auth } });

let logs: string[] = [];

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  logs = [];
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
  }
  mocks.runDueWhatsappMessages.mockResolvedValue({ due: 2, staleMarkedFailed: 0, connectedNumbers: 1, sent: 2 });
  mocks.dispatchRoutines.mockResolvedValue({ stale: 0, claimed: 1, done: 1 });
  mocks.closeMonth.mockResolvedValue({ ok: true });
  mocks.resumeBuilds.mockResolvedValue({ resumed: 0 });
  mocks.resumeJobs.mockResolvedValue({ resumed: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mocks.runDueWhatsappMessages.mockReset();
  mocks.dispatchRoutines.mockReset();
  mocks.closeMonth.mockReset();
});

describe("checkCronAuth", () => {
  it("acepta solo el Bearer exacto", () => {
    expect(checkCronAuth(req("/x", { auth: `Bearer ${SECRET}` }), SECRET)).toEqual({ ok: true });
    for (const auth of [undefined, "", `Bearer ${SECRET}x`, `bearer ${SECRET}`, SECRET, `Bearer ${SECRET.slice(1)}`, "Bearer ", `Basic ${SECRET}`]) {
      expect(checkCronAuth(req("/x", { auth }), SECRET)).toEqual({ ok: false, status: 401, error: "No autorizado." });
    }
  });

  it("da 500 claro si CRON_SECRET no está configurado (aunque manden 'Bearer ')", () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const secret of [undefined, "", "   "]) {
      const result = checkCronAuth(req("/x", { auth: "Bearer " }), secret);
      expect(result).toMatchObject({ ok: false, status: 500 });
      expect(result.ok ? "" : result.error).toMatch(/CRON_SECRET no está configurado/);
    }
  });

  it("ignora espacios accidentales al final del secreto configurado", () => {
    expect(checkCronAuth(req("/x", { auth: `Bearer ${SECRET}` }), `${SECRET}\n`).ok).toBe(true);
  });

  it("authorizedCron conserva su contrato", () => {
    expect(authorizedCron(req("/x", { auth: "Bearer s3cret" }), "s3cret")).toBe(true);
    expect(authorizedCron(req("/x", { auth: "Bearer otro" }), "s3cret")).toBe(false);
    expect(authorizedCron(req("/x"), undefined)).toBe(false);
  });
});

const endpoints = [
  { name: "whatsapp GET", call: (r: Request) => whatsapp.GET(r), path: "/api/whatsapp/scheduled/run" },
  { name: "whatsapp POST", call: (r: Request) => whatsapp.POST(r), path: "/api/whatsapp/scheduled/run", method: "POST" },
  { name: "rutinas GET", call: (r: Request) => routines.GET(r), path: "/api/vega/routines/dispatch" },
  { name: "rutinas POST", call: (r: Request) => routines.POST(r), path: "/api/vega/routines/dispatch", method: "POST" },
  { name: "cron diario", call: (r: Request) => daily.GET(r), path: "/api/vega/tasks/run" },
  { name: "comisiones", call: (r: Request) => commissions.GET(r), path: "/api/commissions/close" },
  { name: "trabajos", call: (r: Request) => jobs.POST(r), path: "/api/vega/jobs/dispatch", method: "POST" },
];

describe.each(endpoints)("$name", ({ call, path, method }) => {
  it("401 sin header o con header incorrecto, sin ejecutar nada", async () => {
    for (const auth of [undefined, "Bearer nope"]) {
      const response = await call(req(path, { method, auth }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "No autorizado." });
    }
    expect(mocks.runDueWhatsappMessages).not.toHaveBeenCalled();
    expect(mocks.dispatchRoutines).not.toHaveBeenCalled();
    expect(mocks.closeMonth).not.toHaveBeenCalled();
  });

  it("500 si CRON_SECRET falta en el servidor", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await call(req(path, { method, auth: "Bearer " }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/CRON_SECRET/);
  });

  it("2xx con el secreto correcto y nunca lo escribe en logs", async () => {
    const response = await call(req(path, { method, auth: `Bearer ${SECRET}` }));
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    await call(req(path, { method, auth: "Bearer otro-valor" }));
    expect(logs.join("\n")).not.toContain(SECRET);
    expect(logs.join("\n")).not.toContain("otro-valor");
  });
});

describe("logs y resúmenes", () => {
  it("WhatsApp registra inicio, conteos y duración", async () => {
    const response = await whatsapp.POST(req("/api/whatsapp/scheduled/run", { method: "POST", auth: `Bearer ${SECRET}` }));
    expect(await response.json()).toEqual({ due: 2, staleMarkedFailed: 0, connectedNumbers: 1, sent: 2 });
    expect(logs.some((line) => line.startsWith("[cron:whatsapp-scheduled] inicio (POST)"))).toBe(true);
    expect(logs.some((line) => /\[cron:whatsapp-scheduled\] fin en \d+ ms · due=2 .*sent=2/.test(line))).toBe(true);
  });

  it("WhatsApp responde 500 y registra el error si falla", async () => {
    mocks.runDueWhatsappMessages.mockRejectedValue(new Error("db caída"));
    const response = await whatsapp.GET(req("/api/whatsapp/scheduled/run", { auth: `Bearer ${SECRET}` }));
    expect(response.status).toBe(500);
    expect(logs.some((line) => line.includes("[cron:whatsapp-scheduled] error") && line.includes("db caída"))).toBe(true);
  });

  it("rutinas con ?wait=1 devuelven el resumen y lo registran", async () => {
    const response = await routines.POST(req("/api/vega/routines/dispatch?wait=1", { method: "POST", auth: `Bearer ${SECRET}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ claimed: 1, done: 1 });
    expect(logs.some((line) => /\[cron:vega-routines\] fin en \d+ ms · stale=0 claimed=1 done=1 builds=\{resumed:0\} jobs=\{resumed:0\}/.test(line))).toBe(true);
  });

  it("rutinas sin wait responden 202 de inmediato", async () => {
    const response = await routines.GET(req("/api/vega/routines/dispatch", { auth: `Bearer ${SECRET}` }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
  });

  it("rutinas con ?wait=1 dan 500 si el despachador falla", async () => {
    mocks.dispatchRoutines.mockRejectedValue(new Error("boom"));
    const response = await routines.GET(req("/api/vega/routines/dispatch?wait=1", { auth: `Bearer ${SECRET}` }));
    expect(response.status).toBe(500);
    expect(logs.some((line) => line.includes("[cron:vega-routines] error") && line.includes("boom"))).toBe(true);
  });
});
