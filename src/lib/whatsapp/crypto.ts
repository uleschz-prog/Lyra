import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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
