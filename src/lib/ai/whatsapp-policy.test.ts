import assert from "node:assert/strict";
import test from "node:test";

import { whatsappSendPolicy } from "./whatsapp-policy";

test("WhatsApp permanece apagado si la bandera no es exactamente true", () => {
  assert.equal(whatsappSendPolicy("ADMIN", undefined).allowed, false);
  assert.equal(whatsappSendPolicy("ADMIN", "1").allowed, false);
  assert.equal(whatsappSendPolicy("ADMIN", "TRUE").reason, "disabled");
});

test("con la bandera activa solo la cuenta administradora puede enviar", () => {
  assert.deepEqual(whatsappSendPolicy("MEMBER", "true"), { allowed: false, reason: "admin" });
  assert.deepEqual(whatsappSendPolicy("ADMIN", "true"), { allowed: true, reason: "ok" });
  assert.equal(whatsappSendPolicy(null, "true").allowed, false);
});
