"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { publishProject } from "@/app/dashboard/projects/actions";
import { SiteView } from "@/components/projects/site-view";
import { brand } from "@/config/brand";
import type { SiteDocument } from "@/lib/site-document";

export function SiteStudio({
  projectId,
  site,
  published,
}: {
  projectId: string;
  site: SiteDocument;
  published: boolean;
}) {
  const [live, setLive] = useState(published);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const href = `/s/${projectId}`;

  function publish() {
    setError("");
    startTransition(async () => {
      const result = await publishProject(projectId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLive(true);
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#8A8680]">Sitio</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1E1E24] sm:text-4xl">{site.title}</h1>
        </div>
        <Link href={brand.links.dashboard} className="text-sm text-[#7C3AED]">
          Volver
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {live ? (
          <a href={href} className="text-sm text-[#7C3AED]" target="_blank" rel="noreferrer">
            Ver sitio publicado
          </a>
        ) : (
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className="rounded-lg bg-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Publicando" : "Publicar sitio"}
          </button>
        )}
        {error ? <p className="text-sm text-[#9A3B2F]">{error}</p> : null}
      </div>
      <SiteView site={site} />
    </div>
  );
}
