import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, FileCode2, Users } from "lucide-react";

import { ModerationButtons, UnpublishButton } from "@/components/marketplace/moderation-buttons";
import { TemplateActions } from "@/components/marketplace/template-actions";
import { PriceTag } from "@/components/marketplace/template-card";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { canView, ownsTemplate } from "@/lib/marketplace/core";
import { ensureOfficialTemplates, getTemplateBySlug, marketDb } from "@/lib/marketplace/server";
import { formatProjectDate, projectKindLabels, isProjectKind } from "@/lib/projects/store";

export const metadata: Metadata = { title: "Plantilla" };
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = { pending: "En revisión", approved: "Publicada", rejected: "Rechazada", unpublished: "Retirada" };

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) notFound();
  await ensureOfficialTemplates();
  const template = await getTemplateBySlug(slug).catch(() => null);
  const viewer = { id: user.id, role: user.role };
  if (!template || !canView(template, viewer)) notFound();
  const owned = await ownsTemplate(marketDb(), template, user.id);
  const mine = template.authorId === user.id;
  const kindLabel = isProjectKind(template.kind) ? projectKindLabels[template.kind] : template.kind;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/marketplace" className="inline-flex items-center gap-1.5 text-sm text-[#5C5854] hover:text-[#1E1E24] dark:text-[#C8C4D4]">
        <ArrowLeft className="size-4" aria-hidden />
        Marketplace
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Vista previa" className="overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white dark:border-white/12">
          <div className="flex items-center justify-between border-b border-[#F0ECE6] px-4 py-2.5 text-xs text-[#5C5854] dark:border-white/10 dark:text-[#C8C4D4]">
            <span>Vista previa en vivo</span>
            <a href={`/api/marketplace/${template.id}/preview`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[#7C3AED]">
              <ExternalLink className="size-3.5" /> Abrir en pestaña
            </a>
          </div>
          <iframe
            title={`Vista previa de ${template.title}`}
            src={`/api/marketplace/${template.id}/preview`}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            className="h-[72dvh] min-h-[480px] w-full bg-white"
          />
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#E7E2DA] bg-white p-5 dark:border-white/12 dark:bg-[#181625]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[#8A8680]">{kindLabel}{template.category ? ` · ${template.category}` : ""}</span>
              <PriceTag price={template.price} />
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#1E1E24] dark:text-[#F2F0F7]">{template.title}</h1>
            <p className="mt-1 text-sm text-[#5C5854] dark:text-[#C8C4D4]">por {template.authorName}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#8A8680]">
              <Users className="size-3.5" /> {template.usesCount} {template.usesCount === 1 ? "persona la usó" : "personas la usaron"}
            </p>
            {template.status !== "approved" ? (
              <p className="mt-3 rounded-xl bg-[#FEF3C7] px-3 py-2 text-xs text-[#92400E]">
                {statusLabels[template.status] ?? template.status}
                {template.rejectReason ? `: ${template.rejectReason}` : ""}
              </p>
            ) : null}
            <div className="mt-5">
              {template.status === "approved" || mine ? <TemplateActions templateId={template.id} kind={template.kind} price={template.price} owned={owned} /> : null}
            </div>
            <p className="mt-3 text-xs text-[#8A8680]">
              {template.kind === "agente"
                ? "Se crea el agente en Vega con su configuración y un proyecto con su especificación."
                : "Se copia a tus Proyectos como un proyecto nuevo. Después pídele a Vega los cambios."}
            </p>
            {mine && template.status !== "unpublished" ? (
              <div className="mt-4 border-t border-[#F0ECE6] pt-4 dark:border-white/10">
                <UnpublishButton id={template.id} />
              </div>
            ) : null}
            {user.role === "ADMIN" && !template.official && template.status === "pending" ? (
              <div className="mt-4 border-t border-[#F0ECE6] pt-4 dark:border-white/10">
                <ModerationButtons id={template.id} />
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[#E7E2DA] bg-white p-5 dark:border-white/12 dark:bg-[#181625]">
            <h2 className="text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">Descripción</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#5C5854] dark:text-[#C8C4D4]">{template.description}</p>
            {template.tags.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {template.tags.map((tag) => (
                  <li key={tag}>
                    <Link href={`/dashboard/marketplace?q=${encodeURIComponent(tag)}`} className="rounded-full bg-[#F6F4F1] px-2.5 py-1 text-xs text-[#5C5854] hover:text-[#7C3AED] dark:bg-[#221F30] dark:text-[#C8C4D4]">
                      #{tag}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <details className="rounded-2xl border border-[#E7E2DA] bg-white p-5 dark:border-white/12 dark:bg-[#181625]">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">
              <FileCode2 className="size-4 text-[#7C3AED]" /> {template.paths.length} archivos
              {template.generator === "vega-v2" ? <span className="rounded-full bg-[#EDE9FE] px-1.5 py-0.5 text-[10px] font-semibold text-[#6D28D9]">React + Tailwind</span> : null}
            </summary>
            <ul className="mt-3 max-h-60 space-y-0.5 overflow-auto font-mono text-[11px] text-[#5C5854] dark:text-[#C8C4D4]">
              {template.paths.map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[#8A8680]">Publicada {formatProjectDate(template.createdAt)}</p>
          </details>
        </aside>
      </div>
    </div>
  );
}
