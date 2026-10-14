import assert from "node:assert/strict";
import test from "node:test";

import { deliveryDecision } from "./send-policy";

test("solo el reporte programado al correo de la propia cuenta sale sin confirmación", () => {
  assert.deepEqual(
    deliveryDecision({
      channel: "email",
      scheduled: true,
      recipient: "Ana@Lyra.dev",
      ownerEmail: "ana@lyra.dev",
    }),
    { allowed: true, reason: "own_scheduled_email" },
  );
});

test("cualquier otro envío espera confirmación", () => {
  assert.equal(
    deliveryDecision({ channel: "email", scheduled: true, recipient: "otro@lyra.dev", ownerEmail: "ana@lyra.dev" }).allowed,
    false,
  );
  assert.equal(
    deliveryDecision({ channel: "email", scheduled: false, recipient: "ana@lyra.dev", ownerEmail: "ana@lyra.dev" }).reason,
    "confirmation_required",
  );
  assert.equal(
    deliveryDecision({ channel: "whatsapp", scheduled: true, recipient: "ana@lyra.dev", ownerEmail: "ana@lyra.dev" }).allowed,
    false,
  );
});
