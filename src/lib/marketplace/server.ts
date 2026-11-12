// Conexión del Marketplace con la base, el libro de créditos y Proyectos (solo servidor).
import { chargeCredits, refundCharge } from "@/lib/credits";
import { creditCredits } from "@/lib/credits/ledger";
import { getPrisma } from "@/lib/prisma";
import { getProjectVersionFiles, getProjectVersionPreview } from "@/lib/projects/queries";
import { isProjectKind } from "@/lib/projects/store";
import { authorLabel, seedOfficialTemplates, type Credits, type MarketDb, type VersionSnapshot } from "@/lib/marketplace/core";

export function marketDb(): MarketDb {
  return getPrisma();
}

export const ledgerCredits: Credits = {
  charge: chargeCredits,
  refund: refundCharge,
  async credit(input) {
    // ADJUSTMENT con motivo propio: no es compra de paquete ni recarga, así que no genera Bono Órbita.
    const result = await creditCredits({
      userId: input.userId,
      credits: input.credits,
      kind: "ADJUSTMENT",
      reason: "marketplace.earning",
      externalRef: input.externalRef,
      description: input.description,
      metadata: input.metadata,
    });
    return result.ok ? { ok: true, transactionId: result.transactionId } : { ok: false };
  },
};

let seeded = false;

/** Siembra perezosa e idempotente de las 6 plantillas oficiales (una vez por instancia). */
export async function ensureOfficialTemplates() {
  if (seeded) return;
  try {
    const { officialTemplates } = await import("@/lib/marketplace/official");
    await seedOfficialTemplates(getPrisma(), officialTemplates);
    seeded = true;
  } catch (error) {
    console.error("[Marketplace] no se pudieron sembrar las plantillas oficiales", { errorType: error instanceof Error ? error.name : typeof error });
  }
}

/** Copia fija de una versión de un proyecto propio (archivos de la base o de Blob y su vista previa). */
export async function readOwnVersion(userId: string, projectId: string, number?: number): Promise<VersionSnapshot | null> {
  const project = await getPrisma().project.findFirst({ where: { id: projectId, userId, deletedAt: null }, select: { kind: true, summary: true } });
  if (!project || !isProjectKind(project.kind)) return null;
  const files = await getProjectVersionFiles(userId, projectId, number);
  if (!files) return null;
  const preview = await getProjectVersionPreview(userId, projectId, files.number).catch(() => null);
  const stored = files.generator === "vega-v2" ? (preview?.html ?? null) : null;
  return { files: files.files, previewHtml: stored, generator: files.generator, number: files.number, kind: project.kind, summary: project.summary };
}

export type TemplateDetail = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  status: string;
  rejectReason: string | null;
  official: boolean;
  authorId: string | null;
  authorName: string;
  usesCount: number;
  salesCount: number;
  generator: string;
  paths: string[];
  sizeBytes: number;
  createdAt: string;
};

export async function getTemplateBySlug(slug: string): Promise<TemplateDetail | null> {
  const row = await getPrisma().marketplaceTemplate.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      kind: true,
      title: true,
      summary: true,
      description: true,
      category: true,
      tags: true,
      price: true,
      status: true,
      rejectReason: true,
      official: true,
      authorId: true,
      usesCount: true,
      salesCount: true,
      generator: true,
      files: true,
      sizeBytes: true,
      createdAt: true,
      author: { select: { name: true, username: true } },
    },
  });
  if (!row) return null;
  const files = Array.isArray(row.files) ? (row.files as { path?: unknown }[]) : [];
  return {
    ...row,
    authorName: authorLabel(row),
    paths: files.flatMap((file) => (typeof file.path === "string" ? [file.path] : [])).sort(),
    createdAt: row.createdAt.toISOString(),
  };
}
