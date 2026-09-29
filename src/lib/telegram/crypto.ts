import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

function key() {
  const raw = process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const decoded = /^[A-Fa-f0-9]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : null;
}

export function encryptionConfigured() {
  return key() !== null;
}

/** AES-256-GCM. Formato: v1.iv.tag.datos (base64url). */
export function encryptSecret(plain: string) {
  const secret = key();
  if (!secret) throw new Error("TELEGRAM_TOKEN_ENCRYPTION_KEY no está configurada.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string) {
  const secret = key();
  if (!secret) throw new Error("TELEGRAM_TOKEN_ENCRYPTION_KEY no está configurada.");
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Token cifrado con formato desconocido.");
  const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Telegram acepta secret_token de 1 a 256 caracteres A-Z, a-z, 0-9, _ y -. */
export function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sameHash(value: string, expectedHash: string) {
  const actual = Buffer.from(sha256(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
