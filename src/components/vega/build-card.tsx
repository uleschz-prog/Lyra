"use client";

import { Download, ExternalLink, FolderOpen, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { BuildView } from "@/lib/builder/runner";
import type { ProjectDraft } from "@/lib/vega/build-project";
import type { VegaActionView } from "@/lib/vega/events";

/** Lo que guarda la entrega (VegaAction.payload.build) sobre su construcción v2. */
export type BuildRef = {
  buildId: string;
  status: BuildView["status"];
  projectId?: string | null;
  versionNumber?: number | null;
  title?: string;
  designSystem?: string;
  files?: number;
  error?: string;
};

export function buildRefOf(payload: unknown): BuildRef | null {
  if (!payload || typeof payload !== "object") return null;
  const build = (payload as { build?: unknown }).build;
  if (!build || typeof build !== "object" || typeof (build as BuildRef).buildId !== "string") return null;
  return build as BuildRef;
}

const systemLabels: Record<string, string> = {
  aurora: "Aurora",
  editorial: "Editorial",
  clinic: "Clínica",
  noir: "Noir",
  atelier: "Atelier",
  playful: "Vibrante",
  corporate: "Corporativo",
  organic: "Orgánico",
};

/** Tarjeta del generador v2: avanza el trabajo por pasos cortos y al final abre el proyecto. */
export function BuildCard({
  action,
  onChange,
  onSuggest,
}: {
  action: VegaActionView;
  onChange: (action: VegaActionView, message: string) => void;
  onSuggest?: (text: string) => void;
}) {
  const ref = buildRefOf(action.payload)!;
  const project = action.payload as ProjectDraft;
  const [view, setView] = useState<BuildView | null>(null);
  const onChangeRef = useRef(onChange);
  const running = ref.status === "queued" || ref.status === "running";

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const tick = async () => {
      try {
        // POST avanza un paso corto (≤ 48 s); la respuesta trae el avance.
        const response = await fetch(`/api/proyectos/builds/${encodeURIComponent(ref.buildId)}`, { method: "POST", cache: "no-store" });
        if (cancelled) return;
        const payload = (await response.json().catch(() => ({}))) as { build?: BuildView; error?: string };
        if (!response.ok || !payload.build) throw new Error(payload.error ?? "sin respuesta");
        failures = 0;
        const build = payload.build;
        setView(build);
        if (build.status === "done" || build.status === "failed") {
          const next: VegaActionView = {
            ...action,
            status: "done",
            result:
              build.status === "done"
                ? `${build.kind === "app" ? "App" : "Sitio"} listo: ${build.title ?? project.title}. Ya está en Proyectos con vista previa y ZIP.`
                : "El generador premium no pudo terminar: te dejé la versión básica y te devolvimos los créditos.",
            payload: {
              ...(action.payload as object),
              build: {
                buildId: build.id,
                status: build.status,
                projectId: build.projectId,
                versionNumber: build.versionNumber,
                title: build.title ?? undefined,
                designSystem: build.designSystem ?? undefined,
                files: build.files,
                error: build.error ?? undefined,
              },
            } as unknown as VegaActionView["payload"],
          };
          onChangeRef.current(next, next.result ?? "");
          return;
        }
        timer = setTimeout(() => void tick(), 600);
      } catch {
        if (cancelled) return;
        failures += 1;
        timer = setTimeout(() => void tick(), Math.min(15_000, 2000 * failures));
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Solo se reinicia si cambia el trabajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.buildId, running]);

  if (running) {
    const progress = view?.progress ?? 3;
    return (
      <div className="mt-3 rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] px-4 py-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-5 shrink-0 animate-spin text-[#7C3AED]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#252525]">
              Construyendo {project.kind === "app" ? "tu app" : "tu sitio"} premium · {view?.title ?? project.title}
            </p>
            <p className="text-xs text-[#8A8680]">
              {view?.label ?? "En cola"}
              {view?.designSystem ? ` · estilo ${systemLabels[view.designSystem] ?? view.designSystem}` : ""}
              {view?.files ? ` · ${view.files} componentes` : ""}
            </p>
          </div>
          <span className="text-xs tabular-nums text-[#8A8680]">{progress}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#F0ECE6]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full rounded-full bg-[#7C3AED] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-[#8A8680]">Tarda unos minutos. Puedes seguir platicando; si cierras el chat, se termina en segundo plano.</p>
      </div>
    );
  }

  if (!ref.projectId) {
    return (
      <div className="mt-3 rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] px-4 py-4 text-sm text-[#5C5854]">
        No se pudo terminar este proyecto. Te devolvimos los créditos; pídele a Vega que lo intente de nuevo.
      </div>
    );
  }

  const version = ref.versionNumber ? `?v=${ref.versionNumber}` : "";
  const previewHref = `/api/proyectos/${encodeURIComponent(ref.projectId)}/preview${version}`;
  const premium = ref.status === "done";
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0ECE6] px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#5C5854]">
          {premium ? <Sparkles className="size-3.5 text-[#7C3AED]" /> : null}
          {project.kind === "app" ? "App" : "Sitio web"} · {ref.title ?? project.title}
          {premium && ref.designSystem ? ` · ${systemLabels[ref.designSystem] ?? ref.designSystem}` : ""}
          {!premium ? " · versión básica" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/dashboard/proyectos/${encodeURIComponent(ref.projectId)}`}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E1E24]"
          >
            <FolderOpen className="size-3.5" />
            Abrir proyecto
          </a>
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E1E24]"
          >
            <ExternalLink className="size-3.5" />
            Vista previa
          </a>
          <a
            href={`/api/proyectos/${encodeURIComponent(ref.projectId)}/zip${version}`}
            className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-2.5 py-1.5 text-xs font-medium text-white"
          >
            <Download className="size-3.5" />
            Descargar código
          </a>
        </div>
      </div>
      {project.summary ? <p className="px-4 pt-3 text-sm text-[#1E1E24]">{project.summary}</p> : null}
      <div className="px-4 py-3">
        <iframe title={`Vista previa de ${ref.title ?? project.title}`} src={previewHref} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="h-[460px] w-full rounded-xl border border-[#E7E2DA] bg-white" />
      </div>
      {project.suggestions?.length ? (
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
