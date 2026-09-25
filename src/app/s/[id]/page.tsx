import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteView } from "@/components/projects/site-view";
import { getPrisma } from "@/lib/prisma";
import { parseSite } from "@/lib/site-document";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!process.env.DATABASE_URL) return { title: "Sitio" };
  const project = await getPrisma().project.findFirst({
    where: { id, kind: "site", published: true },
    select: { title: true },
  });
  return { title: project?.title ?? "Sitio" };
}

export default async function PublicSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.DATABASE_URL) notFound();

  const project = await getPrisma().project.findFirst({
    where: { id, kind: "site", published: true },
    select: { ui: true },
  });
  const site = parseSite(project?.ui);
  if (!site) notFound();

  return (
    <main className="min-h-screen bg-[#F6F4F1] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <SiteView site={site} />
      </div>
    </main>
  );
}
