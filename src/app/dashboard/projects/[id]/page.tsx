import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AgentStudio } from "@/components/projects/agent-studio";
import { ProjectApp } from "@/components/projects/project-app";
import { SiteStudio } from "@/components/projects/site-studio";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/profile";
import { openProject } from "@/lib/project-ui";

export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Interfaz",
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(brand.links.login);

  const { id } = await params;
  const opened = await openProject(user.id, id);
  if (!opened) notFound();

  if (opened.kind === "site" && opened.site) {
    return <SiteStudio projectId={id} site={opened.site} published={opened.published} />;
  }

  if (opened.kind === "agent" && opened.agent) {
    return <AgentStudio projectId={id} agent={opened.agent} />;
  }

  return <ProjectApp projectId={id} spec={opened.spec} records={opened.records} runs={opened.runs} />;
}
