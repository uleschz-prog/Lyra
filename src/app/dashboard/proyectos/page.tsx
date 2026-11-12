import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppWindow, Bot, Download, Globe, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { ProjectActions } from "@/components/projects/project-actions";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";
import { listProjects } from "@/lib/projects/queries";
import { formatProjectDate, importPastDeliveries, projectKindLabels } from "@/lib/projects/store";
import type { ProjectKind } from "@/lib/vega/build-project";

export const metadata: Metadata = { title: "Proyectos" };

const kindIcons: Record<ProjectKind, typeof Globe> = { sitio: Globe, app: AppWindow, agente: Bot };

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  // Las entregas anteriores a esta sección se traen una vez (idempotente por entrega).
  await importPastDeliveries(getPrisma(), user.id).catch(() => 0);
  const projects = await listProjects(user.id).catch(() => []);

  return (
    <>
      <PageHeader
        eyebrow="Crear"
        title="Proyectos"
        description="Los sitios web, apps y agentes que Vega crea para ti quedan aquí, con todas sus versiones."
      />

      {projects.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#D9D3CA] bg-white px-6 py-12 text-center dark:border-white/12 dark:bg-[#181625]">
          <Sparkles className="mx-auto size-6 text-[#7C3AED]" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">Todavía no tienes proyectos</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#5C5854] dark:text-[#C8C4D4]">
            Pídele a Vega un sitio web, una app o un agente para tu negocio. Cada entrega se guarda aquí automáticamente.
          </p>
          <Link href="/dashboard/super-agent" className="mt-5 inline-flex rounded-full bg-[#7C3AED] px-5 py-2.5 text-sm font-medium text-white">
            Crear con Vega
          </Link>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const Icon = kindIcons[project.kind];
            return (
              <li key={project.id} className="flex flex-col rounded-2xl border border-[#E7E2DA] bg-white p-5 dark:border-white/12 dark:bg-[#181625]">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDE9FE] px-2.5 py-1 text-[11px] font-medium text-[#5B21B6] dark:bg-[#2B2740] dark:text-[#C4B5FD]">
                    <Icon className="size-3.5" aria-hidden />
                    {projectKindLabels[project.kind]}
                  </span>
                  <span className="text-xs text-[#8A8680]">
                    {project.versionCount === 1 ? "1 versión" : `${project.versionCount} versiones`}
                  </span>
                </div>
                <Link href={`/dashboard/proyectos/${project.id}`} className="mt-4 block">
                  <h2 className="line-clamp-2 text-base font-semibold text-[#1E1E24] hover:text-[#7C3AED] dark:text-[#F2F0F7]">{project.title}</h2>
                  <p className="mt-1.5 line-clamp-3 text-sm text-[#5C5854] dark:text-[#C8C4D4]">{project.summary}</p>
                </Link>
                <p className="mt-3 text-xs text-[#8A8680]">Actualizado {formatProjectDate(project.updatedAt)}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[#F0ECE6] pt-4 dark:border-white/10">
                  <Link
                    href={`/dashboard/proyectos/${project.id}`}
                    className="inline-flex items-center rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Abrir
                  </Link>
                  <a
                    href={`/api/proyectos/${project.id}/zip`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E1E24] hover:border-[#C4B5FD] dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]"
                    aria-label={`Descargar el código de ${project.title}`}
                  >
                    <Download className="size-3.5" />
                    ZIP
                  </a>
                  <div className="ml-auto">
                    <ProjectActions id={project.id} title={project.title} compact />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
