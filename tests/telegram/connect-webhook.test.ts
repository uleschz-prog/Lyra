import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchLike } from "@/lib/telegram/client";
import { sha256 } from "@/lib/telegram/crypto";

const db = vi.hoisted(() => ({
  telegramConnection: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  telegramMessage: { create: vi.fn() },
}));
const afterTasks = vi.hoisted(() => [] as Array<() => Promise<void>>);
const processUpdate = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));
vi.mock("@/lib/telegram/process", () => ({ processUpdate }));
vi.mock("@/lib/telegram/followups", () => ({ runDueFollowups: vi.fn(async () => undefined) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => afterTasks.push(task),
}));

const { connectBot } = await import("@/lib/telegram/connections");
const { POST } = await import("@/app/api/telegram/webhook/[connectionId]/route");

const TOKEN = "123456789:AAHfakefakefakefakefakefakefakefake1";
const CONNECTION_ID = "cm1234567890abcdefghijklm";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function savedRow(status: string) {
  return {
    id: CONNECTION_ID,
    botId: "42",
    botUsername: "ana_bot",
    botName: "Ana",
    status,
    automation: true,
    followups: true,
    instructions: "",
    ownerChatId: null,
    createdAt: new Date("2026-09-25T00:00:00Z"),
    lastVerifiedAt: null,
    lastWebhookAt: null,
    lastError: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  delete process.env.TELEGRAM_WEBHOOK_BASE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("conectar bot", () => {
  it("rechaza tokens mal formados sin llamar a Telegram", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const result = await connectBot("user_a", "hola", "https://lyra.test", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rechaza tokens que Telegram no reconoce", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(reply({ ok: false, error_code: 401, description: "Unauthorized" }, 401));
    const result = await connectBot("user_a", TOKEN, "https://lyra.test", fetchImpl);
    expect(result.ok).toBe(false);
    expect(db.telegramConnection.upsert).not.toHaveBeenCalled();
  });

  it("impide conectar el bot de otro socio", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(reply({ ok: true, result: { id: 42, is_bot: true, username: "ana_bot", first_name: "Ana" } }));
    db.telegramConnection.findFirst.mockResolvedValue({ status: "active" });
    const result = await connectBot("user_b", TOKEN, "https://lyra.test", fetchImpl);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/otra cuenta/) });
    expect(db.telegramConnection.upsert).not.toHaveBeenCalled();
  });

  it("guarda el token cifrado, registra el webhook con secreto y no devuelve el token", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn<FetchLike>(async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return String(url).endsWith("/getMe")
        ? reply({ ok: true, result: { id: 42, is_bot: true, username: "ana_bot", first_name: "Ana" } })
        : reply({ ok: true, result: true });
    });
    db.telegramConnection.findFirst.mockResolvedValue(null);
    db.telegramConnection.upsert.mockResolvedValue({ id: CONNECTION_ID });
    db.telegramConnection.update.mockResolvedValue(savedRow("active"));

    const result = await connectBot("user_a", TOKEN, "https://lyra.test", fetchImpl);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    const stored = db.telegramConnection.upsert.mock.calls[0][0].create;
    expect(stored.userId).toBe("user_a");
    expect(stored.tokenEnc).not.toContain(TOKEN);
    expect(stored.tokenHash).toBe(sha256(TOKEN));
    const hook = calls.find((call) => call.url.endsWith("/setWebhook"));
    expect(hook?.body.url).toBe(`https://lyra.test/api/telegram/webhook/${CONNECTION_ID}`);
    expect(String(hook?.body.url)).not.toContain(TOKEN);
    expect(stored.secretHash).toBe(sha256(String(hook?.body.secret_token)));
  });
});

function webhookRequest(body: unknown, secret = "s3cret") {
  return new Request(`https://lyra.test/api/telegram/webhook/${CONNECTION_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(body),
  });
}

const update = { update_id: 77, message: { message_id: 1, chat: { id: 555, type: "private" }, from: { id: 555 }, text: "hola" } };
const params = { params: Promise.resolve({ connectionId: CONNECTION_ID }) };

describe("webhook", () => {
  beforeEach(() => {
    db.telegramConnection.findUnique.mockResolvedValue({ id: CONNECTION_ID, userId: "user_a", status: "active", secretHash: sha256("s3cret") });
  });

  it("rechaza un secreto inválido", async () => {
    const response = await POST(webhookRequest(update, "otro"), params);
    expect(response.status).toBe(401);
    expect(db.telegramMessage.create).not.toHaveBeenCalled();
  });

  it("rechaza conexiones desconectadas", async () => {
    db.telegramConnection.findUnique.mockResolvedValue({ id: CONNECTION_ID, userId: "user_a", status: "disconnected", secretHash: "" });
    expect((await POST(webhookRequest(update), params)).status).toBe(401);
  });

  it("guarda el update, responde rápido y procesa después", async () => {
    db.telegramMessage.create.mockResolvedValue({ id: "msg_1" });
    const response = await POST(webhookRequest(update), params);
    expect(response.status).toBe(200);
    expect(db.telegramMessage.create.mock.calls[0][0].data).toMatchObject({ userId: "user_a", connectionId: CONNECTION_ID, updateId: BigInt(77) });
    expect(processUpdate).not.toHaveBeenCalled();
    await afterTasks[0]();
    expect(processUpdate).toHaveBeenCalledWith(CONNECTION_ID, expect.objectContaining({ updateId: 77, chatId: "555" }), "msg_1");
  });

  it("ignora updates duplicados", async () => {
    db.telegramMessage.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
    const response = await POST(webhookRequest(update), params);
    expect(response.status).toBe(200);
    expect(afterTasks).toHaveLength(0);
  });

  it("acepta cuerpos inválidos sin procesarlos", async () => {
    const response = await POST(webhookRequest({ nada: true }), params);
    expect(response.status).toBe(200);
    expect(db.telegramMessage.create).not.toHaveBeenCalled();
  });
});
