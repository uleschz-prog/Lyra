import { randomUUID, timingSafeEqual } from "node:crypto";
import { get, put } from "@vercel/blob";
import { Prisma } from "@/generated/prisma/client";

import {
  higgsfieldApiBase,
  higgsfieldAuthHeaders,
  higgsfieldGenerationRequest,
  extractHiggsfieldOutputUrls,
  parseSoul2ImageOptions,
  parseWanVideoOptions,
  higgsfieldPublicError,
  higgsfieldOutputContentType,
  type Soul2ImageOptions,
  type WanVideoOptions,
} from "@/lib/ai/higgsfield-api";
import { creditPrices, chargeCredits, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import { videoQuotaReservationSeconds } from "@/lib/studio/video-quota-shared";

const terminalStatuses = new Set(["completed", "failed", "nsfw", "canceled"]);
const maxOutputBytes = 150 * 1024 * 1024;

export type HiggsfieldKind = "image" | "video";
type GenerationRow = {
  id: string;
  userId: string;
  requestKey: string;
  idempotencyKey: string;
  requestId: string | null;
  kind: string;
  prompt: string;
  imageParameters: Prisma.JsonValue;
  videoParameters: Prisma.JsonValue;
  status: string;
  statusUrl: string | null;
  webhookToken: string;
  sourceUrls: Prisma.JsonValue;
  storedUrls: Prisma.JsonValue;
  chargeId: string | null;
  quotaCycleId: string | null;
  quotaReservedSeconds: number;
  error: string | null;
};

function urlValues(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function publicStatus(row: GenerationRow) {
  const outputs = urlValues(row.storedUrls).map(
    (_, index) => `/api/higgsfield/output/${encodeURIComponent(row.id)}?index=${index}`,
  );
  return {
    id: row.id,
    request_id: row.requestId,
    kind: row.kind,
    status: row.status,
    outputs,
  };
}

function callbackUrl(row: Pick<GenerationRow, "id" | "webhookToken">) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredOrigin) throw new Error("Falta configurar la URL pública de Lyra.");
  const origin = new URL(configuredOrigin);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
    throw new Error("La URL pública de Lyra debe usar HTTPS.");
  }
  const url = new URL("/api/higgsfield/webhook", origin);
  url.searchParams.set("generationId", row.id);
  url.searchParams.set("token", row.webhookToken);
  return url.toString();
}

function safeStatusUrl(value: unknown, requestId: string) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.origin !== higgsfieldApiBase || url.pathname !== `/requests/${requestId}/status`) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeRequestId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : null;
}

function safeError(status: string) {
  if (status === "nsfw") return "Higgsfield bloqueó el contenido por sus políticas. No se cobraron créditos.";
  if (status === "canceled") return "La generación fue cancelada.";
  if (status === "failed") return "Higgsfield no pudo completar la generación.";
  return "No se pudieron guardar los archivos generados.";
}

async function submitGeneration(row: GenerationRow) {
  const headers = higgsfieldAuthHeaders();
  if (!headers) return { ok: false as const, status: 503, error: "Higgsfield no está configurado en el servidor." };
  if (row.kind !== "image" && row.kind !== "video") {
    return { ok: false as const, retryable: false as const, status: 400, error: "Tipo de generación no válido." };
  }
  const videoOptions = parseWanVideoOptions(row.videoParameters);
  const imageOptions = parseSoul2ImageOptions(row.imageParameters);
  if (!videoOptions || !imageOptions) {
    return { ok: false as const, retryable: false as const, status: 400, error: "Los parámetros guardados de generación no son válidos." };
  }

  const { endpoint, body } = higgsfieldGenerationRequest(row.kind, row.prompt, videoOptions, imageOptions);
  const url = new URL(endpoint, higgsfieldApiBase);
  if (row.kind === "video") {
    try {
      url.searchParams.set("hf_webhook", callbackUrl(row));
    } catch {
      return { ok: false as const, retryable: false as const, status: 503, error: "No está configurada la URL pública para recibir notificaciones." };
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": row.idempotencyKey },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return {
      ok: false as const,
      retryable: true as const,
      status: 504,
      error: "La solicitud tardó demasiado. Reintenta con el mismo identificador para no duplicar la generación.",
    };
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const requestId = safeRequestId(payload?.request_id);
  const statusUrl = requestId ? safeStatusUrl(payload?.status_url, requestId) : null;
  const providerStatus = payload?.status;
  if (!response.ok || !requestId || !statusUrl || (providerStatus !== "queued" && providerStatus !== "in_progress")) {
    const error = higgsfieldPublicError(response.status, payload, "Higgsfield no aceptó la generación.");
    return { ok: false as const, retryable: false as const, status: response.status || 502, error };
  }

  const updated = await getPrisma().higgsfieldGeneration.update({
    where: { id: row.id },
    data: { requestId, status: providerStatus, statusUrl, error: null },
  });
  return { ok: true as const, generation: updated };
}

export async function beginHiggsfieldGeneration(input: {
  userId: string;
  requestKey: string;
  prompt: string;
  kind: HiggsfieldKind;
  imageOptions: Soul2ImageOptions;
  videoOptions: WanVideoOptions;
}) {
  if (!higgsfieldAuthHeaders()) {
    return { ok: false as const, httpStatus: 503, error: "Higgsfield no está configurado en el servidor." };
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return { ok: false as const, httpStatus: 503, error: "El almacenamiento de resultados no está configurado." };
  }
  const prisma = getPrisma();
  let row = await prisma.higgsfieldGeneration.findUnique({
    where: { userId_requestKey: { userId: input.userId, requestKey: input.requestKey } },
  });
  let credits: number | undefined;

  if (!row) {
    const webhookToken = randomUUID();
    const reservedVideoSeconds =
      input.kind === "video" ? videoQuotaReservationSeconds(input.videoOptions.duration, "wan-3.0-prime") : 0;
    try {
      row = await prisma.$transaction(async (tx) => {
        const active = await tx.higgsfieldGeneration.findFirst({
          where: { activeUserId: input.userId },
          select: { id: true },
        });
        if (active) throw new Error("HIGGSFIELD_ACTIVE_GENERATION");

        let quotaCycleId: string | null = null;
        if (input.kind === "video") {
          const user = await tx.user.findUnique({
            where: { id: input.userId },
            select: { videoQuotaSeconds: true, videoQuotaExpiresAt: true, videoQuotaCycleId: true },
          });
          if (!user || !user.videoQuotaCycleId || !user.videoQuotaExpiresAt || user.videoQuotaExpiresAt <= new Date()) {
            throw new Error("HIGGSFIELD_VIDEO_QUOTA");
          }
          const claimed = await tx.user.updateMany({
            where: {
              id: input.userId,
              videoQuotaCycleId: user.videoQuotaCycleId,
              videoQuotaExpiresAt: { gt: new Date() },
              videoQuotaSeconds: { gte: reservedVideoSeconds },
            },
            data: { videoQuotaSeconds: { decrement: reservedVideoSeconds } },
          });
          if (claimed.count !== 1) throw new Error("HIGGSFIELD_VIDEO_QUOTA");
          quotaCycleId = user.videoQuotaCycleId;
        }

        return tx.higgsfieldGeneration.create({
          data: {
            userId: input.userId,
            activeUserId: input.userId,
            requestKey: input.requestKey,
            idempotencyKey: input.requestKey,
            kind: input.kind,
            prompt: input.prompt,
            imageParameters: (input.kind === "image" ? input.imageOptions : {}) as Prisma.InputJsonValue,
            videoParameters: (input.kind === "video" ? input.videoOptions : {}) as Prisma.InputJsonValue,
            webhookToken,
            quotaCycleId,
            quotaReservedSeconds: reservedVideoSeconds,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "HIGGSFIELD_VIDEO_QUOTA") {
        return { ok: false as const, httpStatus: 402, error: "No tienes segundos suficientes para generar un video." };
      }
      const active = await prisma.higgsfieldGeneration.findFirst({
        where: { activeUserId: input.userId },
      });
      if (active) {
        const recovered = await reconcileActiveGeneration(active);
        if (terminalStatuses.has(recovered.generation.status)) {
          return beginHiggsfieldGeneration(input);
        }
        return {
          ok: false as const,
          httpStatus: 409,
          error: "Ya tienes una generación en curso. La estamos recuperando; no vuelvas a enviar el prompt.",
          generation: { ...recovered.generation, prompt: active.prompt },
        };
      }
      throw error;
    }

  }

  const savedVideoOptions = parseWanVideoOptions(row.videoParameters);
  const savedImageOptions = parseSoul2ImageOptions(row.imageParameters);
  if (
    row.kind !== input.kind ||
    row.prompt !== input.prompt ||
    !savedVideoOptions ||
    JSON.stringify(savedVideoOptions) !== JSON.stringify(input.videoOptions) ||
    !savedImageOptions ||
    JSON.stringify(savedImageOptions) !== JSON.stringify(input.imageOptions)
  ) {
    return { ok: false as const, httpStatus: 409, error: "Este identificador ya pertenece a otra generación." };
  }
  if (row.kind === "image" && !row.chargeId) {
    const imageCreditCost = creditPrices.image * input.imageOptions.batch_size;
    const charge = await chargeCredits(
      input.userId,
      imageCreditCost,
      `Soul 2 · ${input.imageOptions.batch_size} imagen${input.imageOptions.batch_size === 1 ? "" : "es"}`,
      `higgsfield:${input.requestKey}`,
    );
    if (!charge.ok) {
      await prisma.higgsfieldGeneration.update({
        where: { id: row.id },
        data: { status: "failed", activeUserId: null, error: charge.error },
      });
      return { ok: false as const, httpStatus: 402, error: charge.error, credits: charge.balance };
    }
    credits = charge.balance;
    row = await prisma.higgsfieldGeneration.update({
      where: { id: row.id },
      data: { chargeId: charge.chargeId },
    });
  }
  if (row.requestId || terminalStatuses.has(row.status)) {
    return { ok: true as const, generation: publicStatus(row), ...(credits === undefined ? {} : { credits }) };
  }

  const submitted = await submitGeneration(row);
  if (!submitted.ok) {
    if (!submitted.retryable) {
      await settleGeneration(row, "failed", submitted.error, []);
      return { ok: false as const, httpStatus: submitted.status >= 500 ? 502 : submitted.status, error: submitted.error };
    }
    return { ok: false as const, httpStatus: submitted.status, error: submitted.error, retryable: true };
  }
  return {
    ok: true as const,
    generation: publicStatus(submitted.generation),
    ...(credits === undefined ? {} : { credits }),
  };
}

async function settleGeneration(
  row: GenerationRow,
  status: string,
  error: string | null,
  storedUrls: string[],
  sourceUrls: string[] = [],
) {
  const prisma = getPrisma();
  const settled = await prisma.$transaction(async (tx) => {
    const claim = await tx.higgsfieldGeneration.updateMany({
      where: { id: row.id, status: { notIn: [...terminalStatuses] } },
      data: {
        status,
        activeUserId: null,
        error,
        storedUrls: storedUrls as Prisma.InputJsonValue,
        ...(status === "completed" ? { sourceUrls: sourceUrls as Prisma.InputJsonValue } : {}),
      },
    });
    if (claim.count === 0) return false;
    if (status !== "completed" && row.quotaCycleId && row.quotaReservedSeconds > 0) {
      await tx.user.updateMany({
        where: {
          id: row.userId,
          videoQuotaCycleId: row.quotaCycleId,
          videoQuotaExpiresAt: { gt: new Date() },
        },
        data: { videoQuotaSeconds: { increment: row.quotaReservedSeconds } },
      });
    }
    return true;
  });
  if (settled && status !== "completed" && row.chargeId) {
    await refundCharge(row.chargeId, status === "nsfw" ? "Reembolso: Higgsfield bloqueó la generación" : "Reembolso: la generación de Higgsfield falló");
  }
}

async function storeOutput(row: GenerationRow, sourceUrl: string, index: number) {
  const response = await fetch(sourceUrl, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || !response.body) throw new Error("No se pudo descargar el archivo generado.");
  if (contentLength > maxOutputBytes) throw new Error("El archivo generado supera el límite permitido.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxOutputBytes) {
      await reader.cancel();
      throw new Error("El archivo generado supera el límite permitido.");
    }
    chunks.push(value);
  }
  const file = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const contentType = higgsfieldOutputContentType(
    row.kind as HiggsfieldKind,
    file,
    response.headers.get("content-type") ?? "",
  );
  if (!contentType) throw new Error("Higgsfield entregó un archivo no compatible.");
  const extension = contentType.split("/")[1].replace("jpeg", "jpg").replace("quicktime", "mov");
  const blob = await put(
    `lyra-higgsfield/${row.userId}/${row.id}-${index}.${extension}`,
    file,
    { access: "private", contentType, allowOverwrite: true },
  );
  return blob.url;
}

async function reconcileActiveGeneration(row: GenerationRow) {
  if (!row.requestId && !terminalStatuses.has(row.status)) {
    const submitted = await submitGeneration(row);
    if (!submitted.ok) {
      if (!submitted.retryable) await settleGeneration(row, "failed", submitted.error, []);
      const current = await getPrisma().higgsfieldGeneration.findUniqueOrThrow({ where: { id: row.id } });
      return {
        generation: publicStatus(current),
        error: submitted.error,
      };
    }
    row = submitted.generation;
  }
  const refreshed = await refreshGeneration(row);
  if (refreshed.ok) return { generation: publicStatus(refreshed.generation) };
  const current = await getPrisma().higgsfieldGeneration.findUniqueOrThrow({ where: { id: row.id } });
  return { generation: publicStatus(current), error: refreshed.error };
}

export async function getActiveHiggsfieldGeneration(userId: string) {
  const row = await getPrisma().higgsfieldGeneration.findFirst({
    where: { activeUserId: userId },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    ...await reconcileActiveGeneration(row),
    prompt: row.prompt,
  };
}

async function refreshGeneration(row: GenerationRow) {
  if (terminalStatuses.has(row.status)) return { ok: true as const, generation: row };
  if (!row.requestId || !row.statusUrl) return { ok: false as const, error: "La generación todavía se está enviando." };
  const auth = higgsfieldAuthHeaders();
  if (!auth) return { ok: false as const, error: "Higgsfield no está configurado en el servidor." };

  let response: Response;
  try {
    response = await fetch(row.statusUrl, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    return { ok: false as const, error: "No se pudo consultar el estado en Higgsfield." };
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.status !== "string") {
    return {
      ok: false as const,
      error: higgsfieldPublicError(response.status, payload, "No se pudo consultar el estado en Higgsfield."),
    };
  }
  const status = payload.status;
  if (!["queued", "in_progress", ...terminalStatuses].includes(status)) {
    return { ok: false as const, error: "Higgsfield devolvió un estado de generación desconocido." };
  }
  if (status === "failed" || status === "nsfw" || status === "canceled") {
    await settleGeneration(row, status, safeError(status), []);
    const updated = await getPrisma().higgsfieldGeneration.findUniqueOrThrow({ where: { id: row.id } });
    return { ok: true as const, generation: updated };
  }
  if (status === "queued" || status === "in_progress") {
    const updated = await getPrisma().higgsfieldGeneration.update({
      where: { id: row.id },
      data: { status, error: null },
    });
    return { ok: true as const, generation: updated };
  }

  const sourceUrls = extractHiggsfieldOutputUrls(row.kind as HiggsfieldKind, payload);
  if (sourceUrls.length === 0) {
    const error = "Higgsfield completó la generación sin devolver archivos.";
    await settleGeneration(row, "failed", error, []);
    const updated = await getPrisma().higgsfieldGeneration.findUniqueOrThrow({ where: { id: row.id } });
    return { ok: true as const, generation: updated };
  }
  const stored = urlValues(row.storedUrls);
  const prisma = getPrisma();
  try {
    for (let index = 0; index < sourceUrls.length; index += 1) {
      if (!stored[index]) {
        stored[index] = await storeOutput(row, sourceUrls[index], index);
        await prisma.higgsfieldGeneration.updateMany({
          where: { id: row.id, status: { notIn: [...terminalStatuses] } },
          data: {
            sourceUrls: sourceUrls as Prisma.InputJsonValue,
            storedUrls: stored as Prisma.InputJsonValue,
          },
        });
      }
      const title = row.prompt.trim().slice(0, 120) || (row.kind === "video" ? "Video de Higgsfield" : "Imagen de Higgsfield");
      await prisma.mediaPiece.upsert({
        where: {
          higgsfieldGenerationId_higgsfieldOutputIndex: {
            higgsfieldGenerationId: row.id,
            higgsfieldOutputIndex: index,
          },
        },
        create: {
          userId: row.userId,
          area: "studio",
          kind: row.kind,
          title: sourceUrls.length > 1 ? `${title} · ${index + 1}` : title,
          body: row.prompt,
          media: stored[index],
          higgsfieldGenerationId: row.id,
          higgsfieldOutputIndex: index,
        },
        update: {
          media: stored[index],
        },
      });
    }
  } catch (error) {
    await prisma.higgsfieldGeneration.updateMany({
      where: { id: row.id, status: { notIn: [...terminalStatuses] } },
      data: {
        status: "in_progress",
        sourceUrls: sourceUrls as Prisma.InputJsonValue,
        storedUrls: stored as Prisma.InputJsonValue,
        error: error instanceof Error ? error.message : safeError("failed"),
      },
    });
    return { ok: false as const, error: "La generación terminó, pero no se pudo guardar el archivo. Se reintentará automáticamente." };
  }

  await settleGeneration(
    row,
    "completed",
    null,
    stored,
    sourceUrls,
  );
  const updated = await getPrisma().higgsfieldGeneration.findUniqueOrThrow({ where: { id: row.id } });
  return { ok: true as const, generation: updated };
}

export async function getHiggsfieldGeneration(userId: string, id: string) {
  const row = await getPrisma().higgsfieldGeneration.findFirst({ where: { id, userId } });
  if (!row) return null;
  const refreshed = await refreshGeneration(row);
  if (!refreshed.ok) return { ok: false as const, error: refreshed.error, generation: publicStatus(row) };
  return { ok: true as const, generation: publicStatus(refreshed.generation) };
}

export async function receiveHiggsfieldWebhook(id: string, token: string) {
  const row = await getPrisma().higgsfieldGeneration.findUnique({ where: { id } });
  if (!row || !safeTokenEqual(row.webhookToken, token)) return false;
  const refreshed = await refreshGeneration(row);
  return refreshed.ok;
}

function safeTokenEqual(expected: string, actual: string) {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export async function readHiggsfieldOutput(userId: string, id: string, index: number) {
  const row = await getPrisma().higgsfieldGeneration.findFirst({ where: { id, userId, status: "completed" } });
  const blobUrl = row ? urlValues(row.storedUrls)[index] : undefined;
  if (!blobUrl || !blobUrl.startsWith("https://") || !blobUrl.includes(".private.blob.vercel-storage.com/")) return null;
  return get(blobUrl, { access: "private" });
}
