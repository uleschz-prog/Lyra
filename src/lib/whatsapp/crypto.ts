import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Firma que Meta envía en x-hub-signature-256 para cada webhook. */
export function metaSignature(secret: string, rawBody: string) {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/** Verifica la firma de Meta contra el cuerpo crudo. Comparación a tiempo constante. */
export function verifyMetaSignature(secret: string, rawBody: string, header: string | null) {
  if (!secret || !header) return false;
  const expected = Buffer.from(metaSignature(secret, rawBody));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function newVerifyToken() {
  return `lyra_${randomBytes(16).toString("hex")}`;
}

export function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 16) : "";
}

function tokenEncryptionKey() {
  const raw = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  const key = /^[\da-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY debe ser una clave de 32 bytes en hex o base64.");
  return key;
}

export function encryptWhatsappToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptWhatsappToken(value: string) {
  const [version, ivText, tagText, encryptedText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) throw new Error("El token de WhatsApp guardado no es válido.");
  const decipher = createDecipheriv("aes-256-gcm", tokenEncryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}
