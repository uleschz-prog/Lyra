import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

import { liveAppLimits } from "@/lib/liveapps/config";

function serverSecret(env: Record<string, string | undefined> = process.env) {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET no está configurada.");
  return secret;
}

/**
 * Huella del PIN: HMAC con el secreto del servidor y el espacio. Es determinista (el PIN identifica
 * a la persona dentro de su app) y, sin el secreto, una copia de la base no permite adivinar PINs.
 */
export function pinDigest(spaceId: string, pin: string, env?: Record<string, string | undefined>) {
  return createHmac("sha256", serverSecret(env)).update(`lyra-app-pin:${spaceId}:${pin}`).digest("hex");
}

export function isPin(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^\\d{${liveAppLimits.pinLength}}$`).test(value);
}

/** PIN aleatorio sin patrones obvios (repetidos o consecutivos). */
export function randomPin(length: number = liveAppLimits.pinLength) {
  for (;;) {
    const pin = Array.from({ length }, () => randomInt(0, 10)).join("");
    if (!isWeakPin(pin)) return pin;
  }
}

export function isWeakPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((digit, index) => digit - digits[index]);
  return steps.every((step) => step === 1) || steps.every((step) => step === -1);
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string) {
  return createHash("sha256").update(`lyra-app-session:${token}`).digest("hex");
}

export function attemptKey(scope: "ip" | "app", slug: string, ip = "") {
  return createHash("sha256").update(`lyra-app-pin:${scope}:${slug}:${scope === "ip" ? ip : ""}`).digest("hex");
}
