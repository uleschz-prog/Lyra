import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Autorización de los endpoints de cron (Vercel Cron, GitHub Actions o un pinger externo):
 * todos mandan `Authorization: Bearer $CRON_SECRET`.
 *
 * - Compara en tiempo constante: hashea ambos lados con SHA-256 para que ni el contenido
 *   ni la longitud del header filtren información por tiempo.
 * - Nunca registra el header ni el secreto.
 */
export type CronAuthResult = { ok: true } | { ok: false; status: 401 | 500; error: string };

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function checkCronAuth(request: Request, secret: string | undefined = process.env.CRON_SECRET): CronAuthResult {
  const expected = secret?.trim();
  if (!expected) return { ok: false, status: 500, error: "CRON_SECRET no está configurado en el servidor." };
  const given = request.headers.get("authorization") ?? "";
  const match = timingSafeEqual(digest(given), digest(`Bearer ${expected}`));
  return match ? { ok: true } : { ok: false, status: 401, error: "No autorizado." };
}

/** Devuelve la respuesta de error (401/500) o `null` si el disparo está autorizado. */
export function cronAuthError(request: Request, label: string, secret: string | undefined = process.env.CRON_SECRET): NextResponse | null {
  const auth = checkCronAuth(request, secret);
  if (auth.ok) return null;
  if (auth.status === 500) console.error(`[cron:${label}] CRON_SECRET no está configurado; disparo rechazado.`);
  else console.warn(`[cron:${label}] disparo rechazado: ${request.headers.has("authorization") ? "header incorrecto" : "sin header Authorization"}.`);
  return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });
}

/** Mensaje de error sin stack ni datos sensibles, recortado para logs. */
export function cronErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
