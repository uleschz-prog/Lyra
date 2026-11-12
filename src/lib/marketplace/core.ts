// PR H: Marketplace de plantillas. Lógica sin Next (la base y los créditos se inyectan para probarla).
// Reglas de Ule: comisión de la plataforma 10%; sin Bono Órbita en ventas de plantillas; el vendedor
// gana solo créditos (sin retiro en efectivo) que se liberan 7 días después de la venta.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { cleanProjectFiles, isProjectKind, maxProjectVersionBytes } from "@/lib/projects/store";
import type { ProjectFile, ProjectKind } from "@/lib/vega/build-project";
import { findSecret } from "@/lib/vega/secret-filter";

export type MarketDb = Pick<
  PrismaClient,
  "marketplaceTemplate" | "marketplacePurchase" | "marketplaceEarning" | "marketplaceUse" | "project" | "projectVersion" | "vegaAgent"
>;

export const marketplaceRules = {
  feeRate: 0.1,
  holdDays: 7,
  minPrice: 5,
  maxPrice: 5000,
  maxTags: 6,
} as const;

export const templateStatuses = ["pending", "approved", "rejected", "unpublished"] as const;
export type TemplateStatus = (typeof templateStatuses)[number];

export type AgentConfig = { name: string; specialty: string; instructions: string; avatar: string };

/** Comisión de la plataforma (10%, redondeada hacia arriba) y lo que recibe el vendedor. */
export function splitSale(price: number) {
  const fee = Math.ceil(price * marketplaceRules.feeRate);
  return { fee, sellerAmount: Math.max(0, price - fee) };
}

export function validPrice(value: unknown): number | null {
  const price = typeof value === "string" ? Number(value) : value;
  if (price === 0) return 0;
  if (typeof price !== "number" || !Number.isInteger(price)) return null;
  return price >= marketplaceRules.minPrice && price <= marketplaceRules.maxPrice ? price : null;
}

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function cleanTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const tags = raw
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 24))
    .filter((tag) => tag.length >= 2);
  return [...new Set(tags)].slice(0, marketplaceRules.maxTags);
}

export function agentConfigOf(value: unknown): AgentConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof row[key] === "string" ? (row[key] as string).trim().slice(0, max) : "");
  const config = { name: text("name", 40), specialty: text("specialty", 80), instructions: text("instructions", 2000), avatar: text("avatar", 8) || "✦" };
  return config.name && config.specialty ? config : null;
}

/** Configuración de agente (forma de VegaAgent) a partir del agente.json que entrega Vega. */
export function agentConfigFromFiles(files: ProjectFile[], fallbackName: string): AgentConfig | null {
  const spec = files.find((file) => file.path === "agente.json");
  if (!spec) return null;
  try {
    const data = JSON.parse(spec.content) as { nombre?: string; mision?: string; reglas?: string[] };
    const reglas = Array.isArray(data.reglas) ? data.reglas.filter((rule) => typeof rule === "string") : [];
    return agentConfigOf({
      name: data.nombre || fallbackName,
      specialty: (data.mision || fallbackName).slice(0, 80),
      instructions: [data.mision ? `Misión: ${data.mision}` : "", reglas.length ? `Reglas:\n${reglas.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}` : ""]
        .filter(Boolean)
        .join("\n\n"),
      avatar: "✦",
    });
  } catch {
    return null;
  }
}

// ---------- Listado ----------

export type TemplateFilters = { kind?: string; price?: string; q?: string };

export type TemplateCard = {
  id: string;
  slug: string;
  kind: ProjectKind;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  price: number;
  official: boolean;
  usesCount: number;
  authorName: string;
};

const cardSelect = {
  id: true,
  slug: true,
  kind: true,
  title: true,
  summary: true,
  category: true,
  tags: true,
  price: true,
  official: true,
  usesCount: true,
  authorId: true,
  author: { select: { name: true, username: true } },
} as const;

type CardRow = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  price: number;
  official: boolean;
  usesCount: number;
  author?: { name: string | null; username: string | null } | null;
};

export function authorLabel(row: { official: boolean; author?: { name: string | null; username: string | null } | null }) {
  if (row.official) return "LYRA (oficial)";
  return row.author?.name || (row.author?.username ? `@${row.author.username}` : "Socio de LYRA");
}

function toCard(row: CardRow): TemplateCard | null {
  if (!isProjectKind(row.kind)) return null;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: row.tags ?? [],
    price: row.price,
    official: row.official,
    usesCount: row.usesCount,
    authorName: authorLabel(row),
  };
}

/** Filtro de Prisma para el catálogo público (solo aprobadas). */
export function catalogWhere(filters: TemplateFilters): Prisma.MarketplaceTemplateWhereInput {
  const where: Prisma.MarketplaceTemplateWhereInput = { status: "approved" };
  if (filters.kind && isProjectKind(filters.kind)) where.kind = filters.kind;
  if (filters.price === "free") where.price = 0;
  if (filters.price === "paid") where.price = { gt: 0 };
  const q = filters.q?.replace(/\s+/g, " ").trim().slice(0, 60);
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  return where;
}

export async function listTemplates(db: MarketDb, filters: TemplateFilters = {}, take = 60): Promise<TemplateCard[]> {
  const rows = (await db.marketplaceTemplate.findMany({
    where: catalogWhere(filters),
    orderBy: [{ official: "desc" }, { usesCount: "desc" }, { createdAt: "desc" }],
    take,
    select: cardSelect,
  })) as CardRow[];
  return rows.flatMap((row) => toCard(row) ?? []);
}

// ---------- Siembra de oficiales ----------

export type OfficialSeed = {
  slug: string;
  kind: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  generator: string;
  files: ProjectFile[];
  previewHtml: string | null;
  agentConfig: AgentConfig | null;
};

/**
 * Siembra idempotente de las plantillas oficiales: `createMany` con `skipDuplicates`
 * (INSERT … ON CONFLICT DO NOTHING por slug). No pisa cambios ni borra nada.
 */
export async function seedOfficialTemplates(db: Pick<MarketDb, "marketplaceTemplate">, seeds: OfficialSeed[], now = new Date()) {
  const slugs = seeds.map((seed) => seed.slug);
  const present = await db.marketplaceTemplate.count({ where: { slug: { in: slugs } } });
  if (present >= seeds.length) return { inserted: 0 };
  const result = await db.marketplaceTemplate.createMany({
    data: seeds.map((seed) => ({
      slug: seed.slug,
      official: true,
      authorId: null,
      kind: seed.kind,
      title: seed.title,
      summary: seed.summary,
      description: seed.description,
      category: seed.category,
      tags: seed.tags,
      price: 0,
      status: "approved",
      generator: seed.generator,
      files: seed.files as unknown as Prisma.InputJsonValue,
      previewHtml: seed.previewHtml,
      ...(seed.agentConfig ? { agentConfig: seed.agentConfig as unknown as Prisma.InputJsonValue } : {}),
      sizeBytes: seed.files.reduce((total, file) => total + Buffer.byteLength(file.content), 0),
      approvedAt: now,
    })),
    skipDuplicates: true,
  });
  return { inserted: result.count };
}

// ---------- Usar plantilla ----------

type Viewer = { id: string; role?: string | null };

export type UseResult =
  | { ok: true; projectId: string; agentId: string | null; already: boolean }
  | { ok: false; error: string; needsPurchase?: boolean };

type TemplateRow = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  summary: string;
  price: number;
  status: string;
  authorId: string | null;
  generator: string;
  files: unknown;
  previewHtml: string | null;
  agentConfig: unknown;
};

const templateSelect = {
  id: true,
  slug: true,
  kind: true,
  title: true,
  summary: true,
  price: true,
  status: true,
  authorId: true,
  generator: true,
  files: true,
  previewHtml: true,
  agentConfig: true,
} as const;

export function canView(template: { status: string; authorId: string | null }, viewer: Viewer | null) {
  if (template.status === "approved") return true;
  if (!viewer) return false;
  return viewer.role === "ADMIN" || (template.authorId !== null && template.authorId === viewer.id);
}

export async function ownsTemplate(db: MarketDb, template: { id: string; price: number; authorId: string | null }, userId: string) {
  if (template.price === 0 || template.authorId === userId) return true;
  const purchase = await db.marketplacePurchase.findFirst({ where: { templateId: template.id, buyerId: userId, status: "paid" }, select: { id: true } });
  return Boolean(purchase);
}

/**
 * Copia la plantilla a Proyectos (proyecto nuevo, versión 1) y, si es agente, crea el agente en Vega.
 * Idempotente por `requestKey` (un doble clic no crea dos proyectos).
 */
export async function cloneTemplate(db: MarketDb, input: { user: Viewer; templateId: string; requestKey: string }): Promise<UseResult> {
  const requestKey = `${input.user.id}:${input.requestKey}`.slice(0, 160);
  const previous = await db.marketplaceUse.findUnique({ where: { requestKey }, select: { projectId: true, agentId: true } });
  if (previous?.projectId) return { ok: true, projectId: previous.projectId, agentId: previous.agentId ?? null, already: true };

  const template = (await db.marketplaceTemplate.findUnique({ where: { id: input.templateId }, select: templateSelect })) as TemplateRow | null;
  if (!template || !canView(template, input.user) || !isProjectKind(template.kind)) return { ok: false, error: "Esa plantilla no está disponible." };
  if (!(await ownsTemplate(db, template, input.user.id))) {
    return { ok: false, error: `Esta plantilla cuesta ${template.price} créditos. Cómprala para usarla.`, needsPurchase: true };
  }
  const cleaned = cleanProjectFiles(template.files);
  if (!cleaned) return { ok: false, error: "Los archivos de la plantilla no son válidos." };

  const project = await db.project.create({
    data: {
      userId: input.user.id,
      kind: template.kind,
      title: template.title,
      summary: template.summary,
      groupKey: `marketplace:${requestKey}`,
      conversationId: null,
      versionCount: 1,
    },
    select: { id: true },
  });
  await db.projectVersion.create({
    data: {
      projectId: project.id,
      number: 1,
      title: template.title,
      summary: template.summary,
      files: cleaned.files as unknown as Prisma.InputJsonValue,
      suggestions: ["Pídele a Vega que cambie textos, colores y datos por los de tu negocio"] as unknown as Prisma.InputJsonValue,
      sizeBytes: cleaned.bytes,
      generator: template.generator,
      sourceActionId: `marketplace:${requestKey}`,
      ...(template.previewHtml ? { previewHtml: template.previewHtml } : {}),
    },
    select: { id: true },
  });

  let agentId: string | null = null;
  const config = template.kind === "agente" ? agentConfigOf(template.agentConfig) : null;
  if (config) {
    const agent = await db.vegaAgent.create({
      data: { userId: input.user.id, name: config.name, specialty: config.specialty, instructions: config.instructions, avatar: config.avatar },
      select: { id: true },
    });
    agentId = agent.id;
  }

  await db.marketplaceUse.create({ data: { requestKey, templateId: template.id, userId: input.user.id, projectId: project.id, agentId }, select: { id: true } });
  await db.marketplaceTemplate.update({ where: { id: template.id }, data: { usesCount: { increment: 1 } }, select: { id: true } });
  return { ok: true, projectId: project.id, agentId, already: false };
}

// ---------- Comprar ----------

export type Credits = {
  charge: (userId: string, amount: number, description: string, key: string) => Promise<
    { ok: true; chargeId: string | null; balance: number; duplicate: boolean } | { ok: false; error: string; balance: number }
  >;
  refund: (chargeId: string | null, reason?: string) => Promise<void>;
  /** Abona créditos ganados (ADJUSTMENT, motivo marketplace.earning; no cuenta para Bono Órbita). */
  credit: (input: { userId: string; credits: number; externalRef: string; description: string; metadata?: Prisma.InputJsonValue }) => Promise<
    { ok: true; transactionId: string } | { ok: false }
  >;
};

export type PurchaseResult =
  | { ok: true; purchaseId: string; already: boolean; balance: number | null }
  | { ok: false; error: string; balance?: number };

function isUnique(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "P2002");
}

/** Compra con créditos: cobra una vez (llave por plantilla y comprador), registra la venta y retiene la ganancia 7 días. */
export async function purchaseTemplate(
  db: MarketDb,
  credits: Credits,
  input: { user: Viewer; templateId: string; now?: Date },
): Promise<PurchaseResult> {
  const now = input.now ?? new Date();
  const template = (await db.marketplaceTemplate.findUnique({ where: { id: input.templateId }, select: templateSelect })) as TemplateRow | null;
  if (!template || template.status !== "approved") return { ok: false, error: "Esa plantilla no está a la venta." };
  if (template.price <= 0) return { ok: false, error: "Esta plantilla es gratis: úsala directamente." };
  if (template.authorId === input.user.id) return { ok: false, error: "Es tu plantilla: puedes usarla sin comprarla." };

  const existing = await db.marketplacePurchase.findFirst({ where: { templateId: template.id, buyerId: input.user.id, status: "paid" }, select: { id: true } });
  if (existing) return { ok: true, purchaseId: existing.id, already: true, balance: null };

  const key = `market:${template.id}:${input.user.id}`;
  const charge = await credits.charge(input.user.id, template.price, `Marketplace · ${template.title}`.slice(0, 120), key);
  if (!charge.ok) return { ok: false, error: charge.error, balance: charge.balance };

  const { fee, sellerAmount } = splitSale(template.price);
  try {
    const purchase = await db.marketplacePurchase.create({
      data: {
        templateId: template.id,
        buyerId: input.user.id,
        sellerId: template.authorId,
        price: template.price,
        fee,
        sellerAmount,
        chargeId: charge.chargeId,
        status: "paid",
      },
      select: { id: true },
    });
    if (template.authorId && sellerAmount > 0) {
      await db.marketplaceEarning.create({
        data: {
          purchaseId: purchase.id,
          sellerId: template.authorId,
          templateId: template.id,
          amount: sellerAmount,
          status: "held",
          releaseAt: new Date(now.getTime() + marketplaceRules.holdDays * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });
    }
    await db.marketplaceTemplate.update({ where: { id: template.id }, data: { salesCount: { increment: 1 } }, select: { id: true } });
    return { ok: true, purchaseId: purchase.id, already: false, balance: charge.balance };
  } catch (error) {
    if (isUnique(error)) {
      // Otra petición registró la misma compra: el cobro con la misma llave no se repitió.
      const again = await db.marketplacePurchase.findFirst({ where: { templateId: template.id, buyerId: input.user.id }, select: { id: true } });
      if (again) return { ok: true, purchaseId: again.id, already: true, balance: charge.balance };
    }
    if (!charge.duplicate) await credits.refund(charge.chargeId, "Reembolso: no se pudo completar la compra de la plantilla");
    console.error("[Marketplace] compra fallida", { errorType: error instanceof Error ? error.name : typeof error });
    return { ok: false, error: "No se pudo completar la compra. Te devolvimos tus créditos." };
  }
}

/**
 * Libera las ganancias retenidas que ya cumplieron 7 días (perezoso al leer o en el cron diario).
 * Idempotente: el abono usa `externalRef` por ganancia y el estado solo pasa de held a released.
 */
export async function releaseDueEarnings(db: MarketDb, credits: Credits, options: { now?: Date; sellerId?: string; take?: number } = {}) {
  const now = options.now ?? new Date();
  const due = await db.marketplaceEarning.findMany({
    where: { status: "held", releaseAt: { lte: now }, ...(options.sellerId ? { sellerId: options.sellerId } : {}) },
    orderBy: { releaseAt: "asc" },
    take: options.take ?? 50,
    select: { id: true, sellerId: true, amount: true, templateId: true },
  });
  let released = 0;
  for (const earning of due) {
    const paid = await credits.credit({
      userId: earning.sellerId,
      credits: earning.amount,
      externalRef: `market-earning:${earning.id}`,
      description: "Marketplace · venta de plantilla",
      metadata: { earningId: earning.id, templateId: earning.templateId },
    });
    if (!paid.ok) continue;
    const updated = await db.marketplaceEarning.updateMany({
      where: { id: earning.id, status: "held" },
      data: { status: "released", releasedAt: now, transactionId: paid.transactionId },
    });
    released += updated.count;
  }
  return { released };
}

export async function earningsSummary(db: MarketDb, sellerId: string) {
  const [held, released] = await Promise.all([
    db.marketplaceEarning.aggregate({ where: { sellerId, status: "held" }, _sum: { amount: true } }),
    db.marketplaceEarning.aggregate({ where: { sellerId, status: "released" }, _sum: { amount: true } }),
  ]);
  return { held: held._sum.amount ?? 0, released: released._sum.amount ?? 0 };
}

// ---------- Publicar y moderar ----------

export type PublishInput = {
  user: Viewer;
  projectId: string;
  versionNumber?: number;
  title: string;
  description: string;
  category: string;
  tags: unknown;
  price: unknown;
};

export type VersionSnapshot = { files: ProjectFile[]; previewHtml: string | null; generator: string; number: number; kind: ProjectKind; summary: string };

export type PublishResult = { ok: true; id: string; slug: string; status: TemplateStatus } | { ok: false; error: string };

/** Publica una copia fija de una versión del proyecto. Las de socios quedan pendientes de revisión. */
export async function publishTemplate(
  db: MarketDb,
  input: PublishInput,
  readVersion: (userId: string, projectId: string, number?: number) => Promise<VersionSnapshot | null>,
  random: () => string = () => Math.random().toString(36).slice(2, 8),
): Promise<PublishResult> {
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 80);
  const description = input.description.trim().slice(0, 2000);
  const category = input.category.replace(/\s+/g, " ").trim().slice(0, 40);
  if (title.length < 4) return { ok: false, error: "Escribe un título de al menos 4 letras." };
  if (description.length < 30) return { ok: false, error: "Describe la plantilla en al menos 30 caracteres: qué incluye y para quién es." };
  const price = validPrice(input.price);
  if (price === null) return { ok: false, error: `El precio debe ser 0 (gratis) o de ${marketplaceRules.minPrice} a ${marketplaceRules.maxPrice} créditos.` };

  const version = await readVersion(input.user.id, input.projectId, input.versionNumber);
  if (!version) return { ok: false, error: "No encontramos ese proyecto o versión." };
  const bytes = version.files.reduce((total, file) => total + Buffer.byteLength(file.content), 0) + Buffer.byteLength(version.previewHtml ?? "");
  if (bytes > maxProjectVersionBytes + 1_000_000) return { ok: false, error: "El proyecto es demasiado grande para publicarse." };
  const leaked = version.files.find((file) => findSecret(file.content));
  if (leaked) return { ok: false, error: `El archivo ${leaked.path} parece contener una llave o contraseña. Quítala antes de publicar.` };

  const agentConfig = version.kind === "agente" ? agentConfigFromFiles(version.files, title) : null;
  const admin = input.user.role === "ADMIN";
  const status: TemplateStatus = admin ? "approved" : "pending";
  const slug = `${slugify(title) || "plantilla"}-${random()}`;
  const row = await db.marketplaceTemplate.create({
    data: {
      slug,
      authorId: input.user.id,
      official: false,
      kind: version.kind,
      title,
      summary: version.summary.slice(0, 280) || title,
      description,
      category,
      tags: cleanTags(input.tags),
      price,
      status,
      generator: version.generator,
      // Copia fija: se guardan los textos, no una referencia a la versión del proyecto.
      files: version.files.map((file) => ({ path: file.path, content: file.content })) as unknown as Prisma.InputJsonValue,
      previewHtml: version.previewHtml,
      ...(agentConfig ? { agentConfig: agentConfig as unknown as Prisma.InputJsonValue } : {}),
      sizeBytes: bytes,
      sourceProjectId: input.projectId,
      sourceVersionNumber: version.number,
      ...(admin ? { approvedAt: new Date() } : {}),
    },
    select: { id: true, slug: true },
  });
  return { ok: true, id: row.id, slug: row.slug, status };
}

export async function moderateTemplate(db: MarketDb, input: { admin: Viewer; id: string; decision: "approve" | "reject"; reason?: string }) {
  if (input.admin.role !== "ADMIN") return { ok: false as const, error: "Solo un administrador puede revisar plantillas." };
  const data =
    input.decision === "approve"
      ? { status: "approved", approvedAt: new Date(), rejectReason: null }
      : { status: "rejected", rejectReason: (input.reason ?? "").trim().slice(0, 300) || "No cumple las reglas del Marketplace." };
  const updated = await db.marketplaceTemplate.updateMany({ where: { id: input.id, official: false, status: { in: ["pending", "approved", "rejected"] } }, data });
  return updated.count ? { ok: true as const } : { ok: false as const, error: "No encontramos esa plantilla." };
}

/** El autor retira su plantilla del catálogo (quien ya la compró o usó conserva su copia). */
export async function unpublishTemplate(db: MarketDb, input: { user: Viewer; id: string }) {
  const updated = await db.marketplaceTemplate.updateMany({
    where: { id: input.id, authorId: input.user.id, status: { in: ["pending", "approved", "rejected"] } },
    data: { status: "unpublished" },
  });
  return updated.count ? { ok: true as const } : { ok: false as const, error: "No encontramos esa plantilla." };
}
