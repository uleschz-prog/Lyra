"use client";

import { Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { projectHtml, projectZip, type ProjectDraft } from "@/lib/vega/build-project";

const labels: Record<ProjectDraft["kind"], string> = {
  app: "App",
  sitio: "Sitio web",
  agente: "Agente",
};

function save(name: string, bytes: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function ProjectCard({
  project,
  onSuggest,
}: {
  project: ProjectDraft;
  onSuggest?: (text: string) => void;
}) {
  const html = projectHtml(project);
  const fileName = `${project.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "lyra"}.zip`;

  function download() {
    const zip = projectZip(project);
    save(fileName, zip, "application/zip");
  }

  function openPreview() {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const tab = window.open(url, "_blank");
    if (!tab) {
      URL.revokeObjectURL(url);
      toast.error("Permite las ventanas emergentes para ver la vista previa en una pestaña.");
      return;
    }
    window.setTimeout(() => {
      try {
        tab.opener = null;
      } catch {
        /* la pestaña ya quedó aparte */
      }
    }, 400);
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9]">
      <div className="flex items-center justify-between gap-3 border-b border-[#F0ECE6] px-4 py-2.5">
        <p className="text-xs font-medium text-[#5C5854]">
          {labels[project.kind]} · {project.title}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openPreview}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E1E24]"
            aria-label={`Vista previa de ${project.title} en una pestaña nueva`}
          >
            <ExternalLink className="size-3.5" />
            Vista previa
          </button>
          <button type="button" onClick={download} className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-2.5 py-1.5 text-xs font-medium text-white">
            <Download className="size-3.5" />
            Descargar código
          </button>
        </div>
      </div>
      <p className="px-4 pt-3 text-sm text-[#1E1E24]">{project.summary}</p>
      <div className="px-4 py-3">
        <iframe
          title={`Vista previa de ${project.title}`}
          sandbox="allow-scripts allow-forms"
          srcDoc={html}
          className="h-[420px] w-full rounded-xl border border-[#E7E2DA] bg-white"
        />
      </div>
      {project.suggestions.length ? (
        <div className="border-t border-[#F0ECE6] px-4 py-3">
          <p className="text-xs text-[#8A8680]">Vega sugiere</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {project.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggest?.(suggestion)}
                className="rounded-full border border-[#E7E2DA] bg-white px-3 py-1.5 text-left text-xs text-[#1E1E24] hover:border-[#C4B5FD]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
