import { describe, expect, it } from "vitest";

import { findSecret, redactSecrets } from "@/lib/vega/secret-filter";

// Llaves falsas armadas por partes para que ningún escáner las confunda con reales.
const fakeOpenRouter = ["sk", "or", "v1", "x".repeat(24)].join("-");
const fakeGoogle = "AI" + "za" + "Q".repeat(35);
const fakeGithub = "gh" + "p_" + "Z".repeat(36);
const fakePem = ["-----BEGIN RSA", "PRIVATE KEY-----"].join(" ");

describe("filtro de datos sensibles", () => {
  it.each([
    ["Mi tarjeta es 4111 1111 1111 1111", "tarjeta"],
    ["amex 3782-822463-10005", "tarjeta"],
    ["mi contraseña es Gato123!", "contraseña"],
    ["password: hunter22", "contraseña"],
    ["el cvv es 123", "código de seguridad"],
    [`usa la llave ${fakeOpenRouter}`, "llave"],
    [fakeGoogle, "llave"],
    [fakeGithub, "llave"],
    [fakePem, "llave"],
    ["mi CLABE: 012180001234567897", "cuenta bancaria"],
    ["api key = abcd1234efgh5678", "llave"],
  ])("detecta «%s»", (text, kind) => {
    expect(findSecret(text)).toBe(kind);
  });

  it.each([
    "Vende seguros de vida en Pachuca",
    "Su teléfono es +52 1 771 123 4567",
    "Meta: 20 socios antes de diciembre 2026",
    "Recuérdale cambiar su contraseña cada mes",
    "El folio del pedido es 1234567890123456", // no pasa Luhn
    "Prefiere mensajes cortos y sin emojis",
  ])("deja pasar «%s»", (text) => {
    expect(findSecret(text)).toBeNull();
  });

  it("oculta los datos sensibles en un resumen", () => {
    const clean = redactSecrets("Pagó con 4111 1111 1111 1111 y su password: hunter22. Quiere 3 citas.");
    expect(clean).not.toContain("4111");
    expect(clean).not.toContain("hunter22");
    expect(clean).toContain("Quiere 3 citas.");
  });
});
