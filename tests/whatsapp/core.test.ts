import { describe, expect, it } from "vitest";

import { metaSignature, newVerifyToken, normalizePhone, verifyMetaSignature } from "@/lib/whatsapp/crypto";
import { isWhatsappOptOut, parseMetaWebhook } from "@/lib/whatsapp/parse";
import { splitWhatsappText } from "@/lib/whatsapp/send";

const webhookPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5215511111111", phone_number_id: "PNID1" },
            contacts: [{ profile: { name: "Ana" }, wa_id: "5215522222222" }],
            messages: [
              { from: "5215522222222", id: "wamid.A", timestamp: "1700000000", text: { body: "Hola, qué es LYRA?" }, type: "text" },
              { from: "5215522222222", id: "wamid.B", image: { id: "img1" }, type: "image" },
              { from: "5215522222222", id: "wamid.C", text: { body: "stop" }, type: "text" },
            ],
            statuses: [{ id: "wamid.OUT1", status: "delivered", timestamp: "1700000001" }],
          },
        },
      ],
    },
  ],
};

describe("webhook de Meta", () => {
  it("extrae los mensajes entrantes con su nombre y phone_number_id", () => {
    const { messages, statuses } = parseMetaWebhook(webhookPayload);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ waMessageId: "wamid.A", phoneNumberId: "PNID1", from: "5215522222222", name: "Ana", text: "Hola, qué es LYRA?", hasMedia: false });
    expect(messages[1]).toMatchObject({ waMessageId: "wamid.B", hasMedia: true, text: "" });
    expect(statuses).toEqual([{ waMessageId: "wamid.OUT1", phoneNumberId: "PNID1", status: "delivered" }]);
  });

  it("ignora cuerpos vacíos o inválidos", () => {
    expect(parseMetaWebhook(null)).toEqual({ messages: [], statuses: [] });
    expect(parseMetaWebhook({})).toEqual({ messages: [], statuses: [] });
    expect(parseMetaWebhook({ entry: "no" })).toEqual({ messages: [], statuses: [] });
  });

  it("verifica la firma de Meta en tiempo constante", () => {
    const secret = "app-secret";
    const raw = JSON.stringify(webhookPayload);
    expect(verifyMetaSignature(secret, raw, metaSignature(secret, raw))).toBe(true);
    expect(verifyMetaSignature(secret, raw, "sha256=deadbeef")).toBe(false);
    expect(verifyMetaSignature(secret, `${raw} `, metaSignature(secret, raw))).toBe(false);
    expect(verifyMetaSignature(secret, raw, null)).toBe(false);
  });

  it("detecta la baja y normaliza teléfonos", () => {
    expect(isWhatsappOptOut("stop")).toBe(true);
    expect(isWhatsappOptOut("No quiero recibir más mensajes")).toBe(true);
    expect(isWhatsappOptOut("hola")).toBe(false);
    expect(normalizePhone("+52 155 1234 5678")).toBe("5215512345678");
  });

  it("divide textos largos en burbujas", () => {
    expect(splitWhatsappText("corto")).toEqual(["corto"]);
    const chunks = splitWhatsappText("a".repeat(10_000));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(4096);
    expect(newVerifyToken()).toMatch(/^lyra_[a-f0-9]{32}$/);
  });
});
