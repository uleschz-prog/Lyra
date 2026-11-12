import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Store } from "lucide-react";

import { ProjectActions } from "@/components/projects/project-actions";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { getProject, parseVersionParam } from "@/lib/projects/queries";
import { formatProjectDate, projectKindLabels } from "@/lib/projects/store";

export const metadata: Metadata = { title: "Proyecto" };

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const project = await getProject(user.id, id).catch(() => null);
  if (!project || project.versions.length === 0) notFound();

  const requested = parseVersionParam(v);
  const current = project.versions.find((version) => version.number === requested) ?? project.versions[0];
  const query = `?v=${current.number}`;
  const button =
    "inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-xs font-medium text-[#1E1E24] hover:border-[#C4B5FD] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]";

  return (
    <div className="space-y-6">
      <Link href="/dashboard/proyectos" className="inline-flex items-center gap-1.5 text-sm text-[#5C5854] hover:text-[#1E1E24] dark:text-[#C8C4D4]">
        <ArrowLeft className="size-4" aria-hidden />
        Proyectos
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-[#8A8680]">{projectKindLabels[project.kind]}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1E1E24] sm:text-3xl dark:text-[#F2F0F7]">{project.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5C5854] dark:text-[#C8C4D4]">{current.summary || project.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/proyectos/${project.id}/preview${query}`} target="_blank" rel="noopener noreferrer" className={button}>
            <ExternalLink className="size-3.5" />
            Abrir en pestaña
          </a>
          <a href={`/api/proyectos/${project.id}/zip${query}`} className={`${button} border-[#7C3AED] bg-[#7C3AED] text-white hover:border-[#6D28D9] dark:bg-[#7C3AED]`}>
            <Download className="size-3.5" />
            Descargar ZIP
          </a>
          <Link href={`/dashboard/marketplace/publicar?proyecto=${project.id}`} className={button}>
            <Store className="size-3.5" />
            Publicar en Marketplace
          </Link>
          <ProjectActions id={project.id} title={project.title} afterDelete="/dashboard/proyectos" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section aria-label="Vista previa" className="overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white dark:border-white/12">
          <div className="flex items-center justify-between border-b border-[#F0ECE6] px-4 py-2.5 text-xs text-[#5C5854] dark:border-white/10 dark:text-[#C8C4D4]">
            <span>Versión {current.number}</span>
            <span>{formatProjectDate(current.createdAt)}</span>
          </div>
          <iframe
            key={current.number}
            title={`Vista previa de ${project.title}, versión ${current.number}`}
            src={`/api/proyectos/${project.id}/preview${query}`}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            className="h-[70dvh] min-h-[480px] w-full bg-white"
          />
        </section>

        <aside aria-label="Versiones" className="rounded-2xl border border-[#E7E2DA] bg-white p-4 dark:border-white/12 dark:bg-[#181625]">
          <h2 className="text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">Versiones</h2>
          <p className="mt-1 text-xs text-[#8A8680]">Cada vez que Vega entrega cambios se guarda una versión nueva.</p>
          <ol className="mt-3 space-y-1.5">
            {project.versions.map((version) => {
              const active = version.number === current.number;
              return (
                <li key={version.number}>
                  <Link
                    href={`/dashboard/proyectos/${project.id}?v=${version.number}`}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-[#EDE9FE] text-[#1E1E24] dark:bg-[#2B2740] dark:text-[#F2F0F7]"
                        : "text-[#5C5854] hover:bg-[#F6F4F1] dark:text-[#C8C4D4] dark:hover:bg-[#221F30]"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        v{version.number}
                        {version.generator === "vega-v2" ? (
                          <span className="ml-1.5 rounded-full bg-[#EDE9FE] px-1.5 py-0.5 text-[10px] font-semibold text-[#6D28D9]">Premium</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-[#8A8680]">{size(version.sizeBytes)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-[#8A8680]">{formatProjectDate(version.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
