import { beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, encryptionConfigured, randomSecret, sameHash, sha256 } from "@/lib/telegram/crypto";
import {
  createTelegramDeepLink,
  isOptOut,
  maskChatId,
  parseUpdate,
  redactToken,
  safeButtonUrl,
  sanitizeCampaign,
  splitMessage,
  tokenPattern,
} from "@/lib/telegram/parse";
import { proactiveBlock, withinSendingWindow } from "@/lib/telegram/rules";

const TOKEN = "123456789:AAHfakefakefakefakefakefakefakefake1";

describe("cifrado del token", () => {
  beforeEach(() => {
    process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("cifra y descifra sin guardar el token en claro", () => {
    const sealed = encryptSecret(TOKEN);
    expect(sealed).not.toContain(TOKEN);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptSecret(sealed)).toBe(TOKEN);
  });

  it("usa un IV distinto cada vez", () => {
    expect(encryptSecret(TOKEN)).not.toBe(encryptSecret(TOKEN));
  });

  it("rechaza un texto cifrado alterado", () => {
    const [v, iv, tag, data] = encryptSecret(TOKEN).split(".");
    const tampered = [v, iv, tag, `${data.slice(0, -2)}AA`].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("falla de forma explícita sin clave", () => {
    delete process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY;
    expect(encryptionConfigured()).toBe(false);
    expect(() => encryptSecret(TOKEN)).toThrow(/TELEGRAM_TOKEN_ENCRYPTION_KEY/);
  });

  it("compara secretos por hash en tiempo constante", () => {
    const secret = randomSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(sameHash(secret, sha256(secret))).toBe(true);
    expect(sameHash(`${secret}x`, sha256(secret))).toBe(false);
    expect(sameHash(secret, "")).toBe(false);
  });
});

describe("lectura de updates", () => {
  it("valida el formato del token", () => {
    expect(tokenPattern.test(TOKEN)).toBe(true);
    expect(tokenPattern.test("hola")).toBe(false);
  });

  it("extrae /start con campaña", () => {
    const inbound = parseUpdate({
      update_id: 10,
      message: { message_id: 5, chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Ana", is_bot: false }, text: "/start campana_fb_001" },
    });
    expect(inbound).toMatchObject({ kind: "message", chatId: "555", command: "start", payload: "campana_fb_001", updateId: 10 });
    expect(inbound?.from?.firstName).toBe("Ana");
  });

  it("acepta comandos con @bot", () => {
    const inbound = parseUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 1, type: "private" }, text: "/stop@mi_bot" } });
    expect(inbound?.command).toBe("stop");
  });

  it("no rompe con mensajes sin texto", () => {
    const inbound = parseUpdate({ update_id: 2, message: { message_id: 2, chat: { id: 9, type: "private" }, photo: [{}] } });
    expect(inbound).toMatchObject({ kind: "message", text: "", hasMedia: true });
  });

  it("usa el caption como texto", () => {
    const inbound = parseUpdate({ update_id: 3, message: { message_id: 3, chat: { id: 9, type: "private" }, photo: [{}], caption: "precio?" } });
    expect(inbound?.text).toBe("precio?");
  });

  it("reconoce callback_query y bloqueos", () => {
    expect(parseUpdate({ update_id: 4, callback_query: { id: "q", data: "va:abc:1", message: { message_id: 7, chat: { id: 2, type: "private" } }, from: { id: 2 } } })).toMatchObject({
      kind: "callback",
      callbackData: "va:abc:1",
      chatId: "2",
    });
    expect(parseUpdate({ update_id: 5, my_chat_member: { chat: { id: 3, type: "private" }, new_chat_member: { status: "kicked" } } })?.kind).toBe("blocked");
  });

  it("ignora remitentes que son bots y updates inválidos", () => {
    expect(parseUpdate({ update_id: 6, message: { message_id: 1, chat: { id: 1, type: "private" }, from: { id: 1, is_bot: true }, text: "x" } })?.from).toBeNull();
    expect(parseUpdate({ foo: 1 })).toBeNull();
    expect(parseUpdate(null)).toBeNull();
  });
});

describe("campañas y enlaces", () => {
  it("sanea el código de campaña", () => {
    expect(sanitizeCampaign("campana_facebook_001")).toBe("campana_facebook_001");
    expect(sanitizeCampaign("<script>")).toBeNull();
    expect(sanitizeCampaign("a".repeat(65))).toBe("a".repeat(64));
    expect(sanitizeCampaign(undefined)).toBeNull();
  });

  it("crea deep links válidos", () => {
    expect(createTelegramDeepLink("mi_bot", "campana_facebook_001")).toBe("https://t.me/mi_bot?start=campana_facebook_001");
    expect(createTelegramDeepLink("x", "ok")).toBeNull();
    expect(createTelegramDeepLink("mi_bot", "no válido")).toBeNull();
  });
});

describe("baja y seguridad", () => {
  it("detecta comandos y palabras de baja", () => {
    for (const command of ["stop", "unsubscribe", "cancelar", "baja"]) expect(isOptOut({ command, text: `/${command}` })).toBe(true);
    expect(isOptOut({ command: null, text: "STOP" })).toBe(true);
    expect(isOptOut({ command: null, text: "Baja." })).toBe(true);
    expect(isOptOut({ command: null, text: "no me escribas más" })).toBe(true);
    expect(isOptOut({ command: null, text: "quiero cancelar mi pedido de ayer" })).toBe(false);
  });

  it("divide mensajes de más de 4096 caracteres", () => {
    const long = `${"palabra ".repeat(700)}\n\n${"otra ".repeat(400)}`;
    const chunks = splitMessage(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 4096)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(long.replace(/\s+/g, " ").trim());
  });

  it("quita tokens de cualquier texto de log", () => {
    const line = `fallo https://api.telegram.org/bot${TOKEN}/getMe con ${TOKEN}`;
    expect(redactToken(line)).not.toContain(TOKEN);
    expect(redactToken(line)).not.toContain("AAHfake");
  });

  it("oculta el chat id", () => {
    expect(maskChatId("123456789")).toBe("*****6789");
  });

  it("solo permite enlaces https públicos en botones", () => {
    expect(safeButtonUrl("https://lyyra.vercel.app/r/ana")).toBe("https://lyyra.vercel.app/r/ana");
    expect(safeButtonUrl("http://ejemplo.com")).toBeNull();
    expect(safeButtonUrl("https://127.0.0.1/admin")).toBeNull();
    expect(safeButtonUrl("https://localhost:3000")).toBeNull();
    expect(safeButtonUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("reglas de mensajes proactivos", () => {
  const ok = {
    optedIn: true,
    isBlocked: false,
    automation: "active",
    autoSent: 0,
    connectionStatus: "active",
    connectionAutomation: true,
    connectionFollowups: true,
    hasChatId: true,
  };

  it("permite escribir solo con consentimiento y sin bloqueos", () => {
    expect(proactiveBlock(ok)).toBeNull();
    expect(proactiveBlock({ ...ok, hasChatId: false })).toMatch(/nunca inició/);
    expect(proactiveBlock({ ...ok, optedIn: false })).toMatch(/no recibir/);
    expect(proactiveBlock({ ...ok, isBlocked: true })).toMatch(/bloqueó/);
    expect(proactiveBlock({ ...ok, automation: "paused_by_contact" })).toMatch(/pausada/);
    expect(proactiveBlock({ ...ok, autoSent: 3 })).toMatch(/límite/);
    expect(proactiveBlock({ ...ok, connectionFollowups: false })).toMatch(/desactivó/);
  });

  it("mueve los envíos a la ventana de 9:00 a 21:00 de Ciudad de México", () => {
    const noon = new Date("2026-09-25T18:00:00Z");
    expect(withinSendingWindow(noon).toISOString()).toBe(noon.toISOString());
    expect(withinSendingWindow(new Date("2026-09-26T04:30:00Z")).toISOString()).toBe("2026-09-26T15:00:00.000Z");
    expect(withinSendingWindow(new Date("2026-09-26T12:10:00Z")).toISOString()).toBe("2026-09-26T15:00:00.000Z");
  });
});
