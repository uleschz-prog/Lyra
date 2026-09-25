import assert from "node:assert/strict";
import test from "node:test";

import { isProviderEmailVerified, pickGithubEmail } from "./oauth-email";

test("solo un correo marcado como verificado por el proveedor se acepta", () => {
  assert.equal(isProviderEmailVerified(true), true);
  assert.equal(isProviderEmailVerified("true"), true);
  assert.equal(isProviderEmailVerified(false), false);
  assert.equal(isProviderEmailVerified("false"), false);
  assert.equal(isProviderEmailVerified(undefined), false);
  assert.equal(isProviderEmailVerified(1), false);
});

test("GitHub solo aporta un correo con verified true, priorizando el primario", () => {
  assert.equal(
    pickGithubEmail([
      { email: "otro@ejemplo.com", primary: false, verified: true },
      { email: "dueño@ejemplo.com", primary: true, verified: true },
      { email: "falso@ejemplo.com", primary: true, verified: false },
    ]),
    "dueño@ejemplo.com",
  );
  assert.equal(pickGithubEmail([{ email: "sin-verificar@ejemplo.com", primary: true, verified: false }]), null);
  assert.equal(pickGithubEmail(null), null);
});
