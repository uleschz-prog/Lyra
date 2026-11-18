import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { LeadsInbox } from "@/components/projects/leads-inbox";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { listLeads } from "@/lib/leads/queries";
import { getProject } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Contactos" };

export default async function ProjectLeadsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);
  const { id } = await params;
  const project = await getProject(user.id, id).catch(() => null);
  if (!project || project.kind !== "sitio") notFound();
  const leads = await listLeads(user.id, project.id);

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/proyectos/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-[#5C5854] hover:text-[#1E1E24] dark:text-[#C8C4D4]">
        <ArrowLeft className="size-4" aria-hidden />
        {project.title}
      </Link>
      <header>
        <p className="text-sm text-[#8A8680]">Sitio web</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1E1E24] sm:text-3xl dark:text-[#F2F0F7]">Contactos</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#5C5854] dark:text-[#C8C4D4]">
          Lo que la gente escribe en los formularios de tu sitio publicado. Solo tú lo ves. Por ahora no te avisamos por correo: revisa esta bandeja.
        </p>
      </header>
      <LeadsInbox projectId={project.id} initial={leads} />
    </div>
  );
}
