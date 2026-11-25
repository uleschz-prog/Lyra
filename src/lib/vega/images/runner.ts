/**
 * Imágenes de Vega: cobrar, generar, guardar y devolver.
 *
 * 1. startImageGeneration (dentro del turno): revisa topes, cobra VEGA_IMAGE_PRICE_CREDITS y crea la fila.
 * 2. advanceImageGeneration (POST /api/vega/images/[id], lo llama la tarjeta del chat): toma un candado,
 *    llama al proveedor (≤ 50 s, cabe en Vercel Hobby), guarda en Blob privado y marca la entrega.
 *    Si falla: reintenta una vez los errores pasajeros; si no, marca «failed» y devuelve los créditos.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { builderDayStart } from "@/lib/builder/config";
import {
  type AspectRatio,
  blobConfigured,
  estimateImageCostUsd,
  type ImageQuality,
  imageModel,
  imageProvider,
  imageQuality,
  imageSettings,
  MAX_REFERENCES,
} from "@/lib/vega/images/config";
import { classifyImageError, friendlyImageError, type ImageErrorKind, ImageProviderError, retryable } from "@/lib/vega/images/errors";
import { buildImagePrompt } from "@/lib/vega/images/prompt";
import { type ImageProvider, selectImageProvider } from "@/lib/vega/images/providers";
import { blobImageStore, extensionFor, type ImageStore, isImageBlobUrl } from "@/lib/vega/images/storage";
import { checkImageText, type TextCheck } from "@/lib/vega/images/text-check";
import { DEFAULT_TIMEZONE, zonedParts, zonedToUtc } from "@/lib/vega/schedule";

export type ImagesDb = Pick<PrismaClient, "vegaImageGeneration" | "vegaAction">;
type Env = Record<string, string | undefined>;
type Charge = { ok: true; chargeId: string | null; duplicate: boolean } | { ok: false; error: string };

export type ImageDeps = {
  db: ImagesDb;
  env?: Env;
  now?: () => Date;
  /** null = sin proveedor configurado. Por defecto, el de VEGA_IMAGE_PROVIDER. */
  provider?: ImageProvider | null;
  store?: ImageStore;
  charge?: (userId: string, amount: number, description: string, key: string) => Promise<Charge>;
  refund?: (chargeId: string | null, reason: string) => Promise<void>;
  checkText?: (data: Uint8Array, mediaType: string, exactText: string) => Promise<TextCheck | null>;
  log?: Pick<Console, "info" | "warn" | "error">;
};

export type ImageStatus = "queued" | "running" | "done" | "failed";

export type ImageView = {
  id: string;
  status: ImageStatus;
  aspectRatio: AspectRatio;
  /** Ruta propia (autenticada) para ver o descargar la imagen; null hasta que esté lista. */
  url: string | null;
  error: string | null;
  credits: number;
  refunded: boolean;
  /** Líneas del texto pedido que no se leyeron en la imagen (solo con VEGA_IMAGE_TEXT_CHECK=on). */
  missingText: string[] | null;
};

/** Lo que guarda la entrega (VegaAction.payload.image). */
export type ImageRef = { generationId: string; status: ImageStatus; url?: string | null; error?: string | null; missingText?: string[] | null };

const select = {
  id: true,
  userId: true,
  conversationId: true,
  actionId: true,
  prompt: true,
  exactText: true,
  aspectRatio: true,
  quality: true,
  provider: true,
  model: true,
  status: true,
  attempts: true,
  errorKind: true,
  credits: true,
  chargeId: true,
  refunded: true,
  estimatedCostUsd: true,
  blobUrl: true,
  mediaType: true,
  referenceUrls: true,
  textCheck: true,
} as const;

type Row = {
  id: string;
  userId: string;
  conversationId: string | null;
  actionId: string | null;
  prompt: string;
  exactText: string | null;
  aspectRatio: string;
  quality: string;
  provider: string;
  model: string;
  status: string;
  attempts: number;
  errorKind: string | null;
  credits: number;
  chargeId: string | null;
  refunded: boolean;
  estimatedCostUsd: number;
  blobUrl: string | null;
  mediaType: string | null;
  referenceUrls: string[];
  textCheck: unknown;
};

const json = (value: unknown) => value as Prisma.InputJsonValue;

function asAspect(value: string): AspectRatio {
  return value === "2:3" || value === "3:2" ? value : "1:1";
}

function asStatus(value: string): ImageStatus {
  return value === "running" || value === "done" || value === "failed" ? value : "queued";
}

export function imageFileUrl(id: string) {
  return `/api/vega/images/${encodeURIComponent(id)}/file`;
}

function missingOf(textCheck: unknown): string[] | null {
  const missing = (textCheck as { missing?: unknown } | null)?.missing;
  return Array.isArray(missing) ? missing.filter((item): item is string => typeof item === "string") : null;
}

function friendlyFor(kind: string | null) {
  if (!kind) return null;
  if (kind === "cap") return "Las imágenes llegaron a su tope de este mes. Intenta el próximo mes o pide a soporte que lo amplíe.";
  return friendlyImageError(kind as ImageErrorKind);
}

export function imageView(row: Row): ImageView {
  const status = asStatus(row.status);
  return {
    id: row.id,
    status,
    aspectRatio: asAspect(row.aspectRatio),
    url: status === "done" && row.blobUrl ? imageFileUrl(row.id) : null,
    error: status === "failed" ? friendlyFor(row.errorKind) ?? friendlyImageError("provider") : null,
    credits: row.credits,
    refunded: row.refunded,
    missingText: missingOf(row.textCheck),
  };
}

export function imageRefOf(payload: unknown): ImageRef | null {
  const image = (payload as { image?: unknown } | null)?.image;
  if (!image || typeof image !== "object" || typeof (image as ImageRef).generationId !== "string") return null;
  return image as ImageRef;
}

async function defaultCharge(userId: string, amount: number, description: string, key: string): Promise<Charge> {
  const { chargeCredits } = await import("@/lib/credits");
  return chargeCredits(userId, amount, description, key);
}

async function defaultRefund(chargeId: string | null, reason: string) {
  const { refundCharge } = await import("@/lib/credits");
  await refundCharge(chargeId, reason);
}

function monthStart(now: Date) {
  const parts = zonedParts(now, DEFAULT_TIMEZONE);
  return zonedToUtc(parts.year, parts.month, 1, 0, 0, DEFAULT_TIMEZONE);
}

/** Gasto del proveedor este mes (CDMX): costo real cuando existe; si no, la estimación. Las reembolsadas no cuentan. */
export async function monthSpendUsd(db: ImagesDb, now: Date) {
  const since = monthStart(now);
  const [real, estimated] = await Promise.all([
    db.vegaImageGeneration.aggregate({ where: { createdAt: { gte: since }, refunded: false, costUsd: { not: null } }, _sum: { costUsd: true } }),
    db.vegaImageGeneration.aggregate({ where: { createdAt: { gte: since }, refunded: false, costUsd: null }, _sum: { estimatedCostUsd: true } }),
  ]);
  return Number(real._sum.costUsd ?? 0) + Number(estimated._sum.estimatedCostUsd ?? 0);
}

export type StartImageResult =
  | { ok: true; image: ImageView; duplicate: boolean }
  | { ok: false; reason: "off" | "limit" | "cap" | "credits" | "storage" | "invalid"; message: string };

export type ReferenceInput = { data: Uint8Array; mediaType: string };

const referenceMimes = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

export async function startImageGeneration(
  input: {
    user: { id: string };
    conversationId: string | null;
    actionId: string;
    description: string;
    exactText?: string;
    aspect: AspectRatio;
    references?: ReferenceInput[];
  },
  deps: ImageDeps,
): Promise<StartImageResult> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console;
  const providerId = imageProvider(env);
  if (!providerId || !blobConfigured(env)) return { ok: false, reason: "off", message: "La creación de imágenes no está activada en este servidor." };
  const db = deps.db;
  const existing = await db.vegaImageGeneration.findUnique({ where: { actionId: input.actionId }, select });
  if (existing) return { ok: true, image: imageView(existing as Row), duplicate: true };

  const settings = imageSettings(env);
  const now = deps.now?.() ?? new Date();
  const references = (input.references ?? []).filter((item) => referenceMimes.has(item.mediaType) && item.data.byteLength <= MAX_REFERENCE_BYTES).slice(0, MAX_REFERENCES);
  if ((input.references?.length ?? 0) > references.length) {
    return { ok: false, reason: "invalid", message: `Las imágenes de referencia deben ser PNG, JPG o WebP de hasta 8 MB (máximo ${MAX_REFERENCES}).` };
  }

  const active = { userId: input.user.id, refunded: false };
  const [lastHour, today] = await Promise.all([
    db.vegaImageGeneration.count({ where: { ...active, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } }),
    db.vegaImageGeneration.count({ where: { ...active, createdAt: { gte: builderDayStart(now) } } }),
  ]);
  if (lastHour >= settings.perHour) return { ok: false, reason: "limit", message: `Llegaste al límite de ${settings.perHour} imágenes por hora. Intenta un poco más tarde.` };
  if (today >= settings.perDay) return { ok: false, reason: "limit", message: `Llegaste al límite de ${settings.perDay} imágenes por día. Mañana se reinicia (hora CDMX).` };

  const model = imageModel(providerId, env);
  const quality: ImageQuality = imageQuality(env);
  const estimate = estimateImageCostUsd(model, input.aspect, quality, env);
  const spent = await monthSpendUsd(db, now);
  if (spent + estimate > settings.monthlyCapUsd) {
    log.warn("[Vega imágenes] tope mensual alcanzado", { spentUsd: Number(spent.toFixed(4)), capUsd: settings.monthlyCapUsd });
    return { ok: false, reason: "cap", message: friendlyFor("cap")! };
  }

  const charge = await (deps.charge ?? defaultCharge)(input.user.id, settings.priceCredits, "Vega · imagen", `image:${input.actionId}`);
  if (!charge.ok) return { ok: false, reason: "credits", message: charge.error };
  const undo = async (reason: string) => {
    if (!charge.duplicate) await (deps.refund ?? defaultRefund)(charge.chargeId, reason);
  };

  const store = deps.store ?? blobImageStore;
  let referenceUrls: string[] = [];
  try {
    referenceUrls = await Promise.all(
      references.map((item, index) => store.put(`vega-imagenes/${input.user.id}/referencias/${input.actionId}-${index + 1}.${extensionFor(item.mediaType)}`, item.data, item.mediaType)),
    );
  } catch (error) {
    log.error("[Vega imágenes] no se pudieron guardar las referencias", { errorType: error instanceof Error ? error.name : typeof error });
    await undo("Reembolso: no se pudo preparar la imagen");
    return { ok: false, reason: "storage", message: friendlyImageError("storage") };
  }

  try {
    const row = await db.vegaImageGeneration.create({
      data: {
        userId: input.user.id,
        conversationId: input.conversationId,
        actionId: input.actionId,
        prompt: input.description.slice(0, 4000),
        exactText: input.exactText?.slice(0, 1000) || null,
        aspectRatio: input.aspect,
        quality,
        provider: providerId,
        model,
        credits: settings.priceCredits,
        chargeId: charge.chargeId,
        estimatedCostUsd: estimate,
        referenceUrls,
      },
      select,
    });
    log.info("[Vega imágenes] en cola", { id: row.id, provider: providerId, model, aspect: input.aspect, quality, references: referenceUrls.length, estimatedCostUsd: estimate });
    return { ok: true, image: imageView(row as Row), duplicate: false };
  } catch (error) {
    const again = await db.vegaImageGeneration.findUnique({ where: { actionId: input.actionId }, select });
    if (again) return { ok: true, image: imageView(again as Row), duplicate: true };
    await undo("Reembolso: no se pudo preparar la imagen");
    throw error;
  }
}

async function updateAction(db: ImagesDb, actionId: string | null, view: ImageView, result: string) {
  if (!actionId) return;
  const action = await db.vegaAction.findUnique({ where: { id: actionId }, select: { payload: true } });
  if (!action) return;
  const payload = (action.payload && typeof action.payload === "object" ? action.payload : {}) as Record<string, unknown>;
  const image: ImageRef = { generationId: view.id, status: view.status, url: view.url, error: view.error, missingText: view.missingText };
  await db.vegaAction.update({
    where: { id: actionId },
    data: { status: view.status === "done" || view.status === "failed" ? "done" : "running", result, payload: json({ ...payload, image }) },
    select: { id: true },
  });
}

async function fail(db: ImagesDb, row: Row, kind: ImageErrorKind, detail: string, deps: ImageDeps, now: Date) {
  const updated = (await db.vegaImageGeneration.update({
    where: { id: row.id },
    data: { status: "failed", errorKind: kind, error: detail.slice(0, 500), lockedUntil: null, finishedAt: now },
    select,
  })) as Row;
  // Un solo reembolso aunque dos solicitudes lleguen a la vez.
  const first = await db.vegaImageGeneration.updateMany({ where: { id: row.id, refunded: false }, data: { refunded: true } });
  if (first.count === 1) {
    await (deps.refund ?? defaultRefund)(row.chargeId, "Reembolso: Vega no pudo crear la imagen").catch((error: unknown) =>
      (deps.log ?? console).error("[Vega imágenes] no se pudo reembolsar", { id: row.id, errorType: error instanceof Error ? error.name : typeof error }),
    );
  }
  const view = imageView({ ...updated, refunded: true });
  await updateAction(db, row.actionId, view, `No se pudo crear la imagen: ${view.error} Te devolvimos los créditos.`);
  return view;
}

/** Avanza (genera) una imagen. Idempotente: si ya terminó o la está generando otra solicitud, solo devuelve el estado. */
export async function advanceImageGeneration(id: string, deps: ImageDeps): Promise<ImageView | null> {
  const db = deps.db;
  const env = deps.env ?? process.env;
  const log = deps.log ?? console;
  const settings = imageSettings(env);
  const now = deps.now?.() ?? new Date();
  const row = (await db.vegaImageGeneration.findUnique({ where: { id }, select })) as Row | null;
  if (!row) return null;
  if (row.status === "done" || row.status === "failed") return imageView(row);

  const claimed = await db.vegaImageGeneration.updateMany({
    where: { id, status: { in: ["queued", "running"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { status: "running", lockedUntil: new Date(now.getTime() + settings.leaseMs), attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return imageView(row);
  const attempt = row.attempts + 1;

  const provider = deps.provider === undefined ? selectImageProvider(env) : deps.provider;
  if (!provider) return fail(db, row, "auth", "sin proveedor configurado", deps, now);
  const store = deps.store ?? blobImageStore;
  const started = Date.now();
  const aspect = asAspect(row.aspectRatio);

  try {
    const references = await Promise.all(
      row.referenceUrls.filter(isImageBlobUrl).map(async (url) => {
        const found = await store.get(url);
        if (!found) throw new ImageProviderError("storage", "referencia no disponible");
        return { data: found.data, mediaType: found.contentType };
      }),
    );
    const prompt = buildImagePrompt({ description: row.prompt, exactText: row.exactText ?? undefined, aspect });
    const result = await provider.generate({
      prompt,
      aspect,
      quality: row.quality === "low" || row.quality === "high" ? row.quality : "medium",
      references,
      abortSignal: AbortSignal.timeout(settings.timeoutMs),
    });
    if (!result.data.byteLength) throw new ImageProviderError("empty", "imagen vacía");
    let blobUrl: string;
    try {
      blobUrl = await store.put(`vega-imagenes/${row.userId}/${row.id}.${extensionFor(result.mediaType)}`, result.data, result.mediaType);
    } catch (error) {
      throw new ImageProviderError("storage", error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "blob");
    }
    const textCheck = settings.textCheck && row.exactText ? await (deps.checkText ?? checkImageText)(result.data, result.mediaType, row.exactText).catch(() => null) : null;
    const updated = (await db.vegaImageGeneration.update({
      where: { id: row.id },
      data: {
        status: "done",
        servedModel: result.model,
        costUsd: result.costUsd,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        blobUrl,
        mediaType: result.mediaType,
        bytes: result.data.byteLength,
        ...(textCheck ? { textCheck: json(textCheck) } : {}),
        errorKind: null,
        error: null,
        lockedUntil: null,
        finishedAt: deps.now?.() ?? new Date(),
      },
      select,
    })) as Row;
    const view = imageView(updated);
    log.info("[Vega imágenes] lista", {
      id: row.id,
      provider: provider.id,
      model: result.model,
      attempt,
      ms: Date.now() - started,
      bytes: result.data.byteLength,
      costUsd: result.costUsd,
      estimatedCostUsd: row.estimatedCostUsd,
      textOk: textCheck ? textCheck.ok : null,
    });
    await updateAction(db, row.actionId, view, view.missingText?.length ? "Imagen lista (revisa el texto)" : "Imagen lista");
    return view;
  } catch (error) {
    const classified = classifyImageError(error);
    log.warn("[Vega imágenes] falló el proveedor", {
      id: row.id,
      provider: provider.id,
      model: provider.model,
      attempt,
      kind: classified.kind,
      status: classified.status ?? null,
      ms: Date.now() - started,
      detail: classified.detail,
    });
    if (retryable(classified.kind) && attempt < settings.maxAttempts) {
      const updated = (await db.vegaImageGeneration.update({
        where: { id: row.id },
        data: { status: "queued", errorKind: classified.kind, error: classified.detail.slice(0, 500), lockedUntil: null },
        select,
      })) as Row;
      return imageView(updated);
    }
    return fail(db, row, classified.kind, classified.detail, deps, deps.now?.() ?? new Date());
  }
}

export async function getImageForUser(db: ImagesDb, userId: string, id: string) {
  const row = (await db.vegaImageGeneration.findFirst({ where: { id, userId }, select })) as Row | null;
  return row ? imageView(row) : null;
}

/** Bytes de la imagen para su dueño (nunca se expone la URL del Blob). */
export async function readImageFile(db: ImagesDb, userId: string, id: string, store: ImageStore = blobImageStore) {
  const row = (await db.vegaImageGeneration.findFirst({ where: { id, userId, status: "done" }, select })) as Row | null;
  if (!row?.blobUrl || !isImageBlobUrl(row.blobUrl)) return null;
  const found = await store.get(row.blobUrl).catch(() => null);
  return found ? { ...found, contentType: row.mediaType ?? found.contentType } : null;
}
