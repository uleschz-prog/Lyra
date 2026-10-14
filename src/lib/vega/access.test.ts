import assert from "node:assert/strict";
import test from "node:test";

import { canUseVega } from "./access";

test("Vega queda en Founder y Corporate", () => {
  assert.equal(canUseVega("FOUNDER"), true);
  assert.equal(canUseVega("CORPORATE"), true);
  assert.equal(canUseVega("PRO"), false);
  assert.equal(canUseVega("STARTED"), false);
  assert.equal(canUseVega("NONE"), false);
  assert.equal(canUseVega(null), false);
});

test("el paquete de compensación VEGA no habilita al superagente", () => {
  assert.equal(canUseVega("VEGA"), false);
  assert.equal(canUseVega("POLARIS"), false);
  assert.equal(canUseVega("LYRA_MASTER"), false);
});
