"use client";

import { Check, Copy, ExternalLink, Globe, MessageCircle, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { publishProjectAction, unpublishProjectAction } from "@/app/dashboard/proyectos/publish-actions";
import type { PublishView } from "@/lib/publish/core";
import { checkSlug, slugLimits, suggestSlug } from "@/lib/publish/slug";

const field =
  "w-full min-w-0 bg-transparent py-2 text-sm text-[#1E1E24] outline-none placeholder:text-[#A8A29E] dark:text-[#F2F0F7]";

/** Publicar un sitio en /s/[slug]: dirección, versión fija (sirve para regresar a una anterior) e indexación. */
export function PublishPanel({
  projectId,
  title,
  versions,
  initial,
  origin,
}: {
  projectId: string;
  title: string;
  versions: number[];
  initial: PublishView | null;
  origin: string;
}) {
  const router = useRouter();
  const latest = versions[0] ?? 1;
  const [state, setState] = useState<PublishView | null>(initial);
  const [slug, setSlug] = useState(initial?.slug ?? suggestSlug(title));
  const [version, setVersion] = useState<number>(initial?.versionNumber ?? latest);
  const [indexable, setIndexable] = useState(initial?.indexable ?? false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const check = checkSlug(slug);
  const live = state?.status === "published";
  const host = origin.replace(/^https?:\/\//, "");
  const url = `${origin}/s/${state?.slug ?? slug}`;
  const dirty = !live || state?.slug !== slug.trim().toLowerCase() || state?.versionNumber !== version || state?.indexable !== indexable;

  function publish() {
    if (!check.ok) return;
    startTransition(async () => {
      const result = await publishProjectAction(projectId, { slug: check.slug, versionNumber: version, indexable });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.publish) setState(result.publish);
      setSlug(check.slug);
      toast.success(live ? "Cambios publicados. Pueden tardar hasta un minuto en verse." : "¡Listo! Tu sitio ya está en internet.");
      router.refresh();
    });
  }

  function unpublish() {
    if (!window.confirm("¿Despublicar? La dirección deja de mostrar el sitio, pero queda apartada para ti.")) return;
    startTransition(async () => {
      const result = await unpublishProjectAction(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setState((current) => (current ? { ...current, status: "unpublished" } : current));
      toast.success("Sitio despublicado.");
      router.refresh();
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("No se pudo copiar. Selecciona la dirección y cópiala.");
    }
  }

  return (
    <section aria-labelledby="publish-title" className="rounded-2xl border border-[#E7E2DA] bg-white p-4 dark:border-white/12 dark:bg-[#181625]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="publish-title" className="flex items-center gap-1.5 text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">
          <Globe className="size-4 text-[#7C3AED]" aria-hidden />
          Publicar en internet
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            live ? "bg-[#DCFCE7] text-[#166534] dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-[#F3F0EB] text-[#5C5854] dark:bg-white/10 dark:text-[#C8C4D4]"
          }`}
        >
          {live ? `Publicado · v${state?.versionNumber ?? "?"}` : state?.status === "unpublished" ? "Despublicado" : "Sin publicar"}
        </span>
      </div>

      {live ? (
        <div className="mt-3 rounded-xl bg-[#F5F3FF] p-2.5 dark:bg-[#7C3AED]/15">
          <p className="truncate text-xs font-medium text-[#5B21B6] dark:text-[#DDD6FE]" title={url}>
            {url.replace(/^https?:\/\//, "")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E1E24] ring-1 ring-black/5 hover:bg-[#FAF9F7] dark:bg-white/10 dark:text-white">
              {copied ? <Check className="size-3.5 text-[#10B981]" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar enlace"}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E1E24] ring-1 ring-black/5 hover:bg-[#FAF9F7] dark:bg-white/10 dark:text-white">
              <ExternalLink className="size-3.5" />
              Abrir
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${title}: ${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E1E24] ring-1 ring-black/5 hover:bg-[#FAF9F7] dark:bg-white/10 dark:text-white"
            >
              <MessageCircle className="size-3.5 text-[#10B981]" />
              WhatsApp
            </a>
          </div>
        </div>
      ) : null}

      <label className="mt-3 block text-xs font-medium text-[#5C5854] dark:text-[#C8C4D4]" htmlFor="publish-slug">
        Dirección
      </label>
      <div className="mt-1 flex items-center rounded-xl border border-[#E7E2DA] bg-[#FAF9F7] pl-2.5 focus-within:border-[#7C3AED] dark:border-white/12 dark:bg-[#0F0D16]">
        <span className="shrink-0 text-xs text-[#8A8680]">{host}/s/</span>
        <input
          id="publish-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))}
          maxLength={slugLimits.max}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!check.ok}
          aria-describedby="publish-slug-help"
          className={field}
        />
      </div>
      <p id="publish-slug-help" className={`mt-1 text-[11px] ${check.ok ? "text-[#8A8680]" : "text-[#B91C1C] dark:text-[#FCA5A5]"}`}>
        {check.ok ? "Letras sin acentos, números y guiones." : check.error}
      </p>

      <label className="mt-3 block text-xs font-medium text-[#5C5854] dark:text-[#C8C4D4]" htmlFor="publish-version">
        Versión que se muestra
      </label>
      <select
        id="publish-version"
        value={version}
        onChange={(event) => setVersion(Number(event.target.value))}
        className="mt-1 w-full rounded-xl border border-[#E7E2DA] bg-[#FAF9F7] px-2.5 py-2 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED] dark:border-white/12 dark:bg-[#0F0D16] dark:text-[#F2F0F7]"
      >
        {versions.map((number) => (
          <option key={number} value={number}>
            Versión {number}
            {number === latest ? " (la más reciente)" : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-[#8A8680]">Queda fija: las versiones nuevas no se publican solas. Elige una anterior para regresar a ella.</p>

      <label className="mt-3 flex items-start gap-2 text-xs text-[#5C5854] dark:text-[#C8C4D4]">
        <input type="checkbox" checked={indexable} onChange={(event) => setIndexable(event.target.checked)} className="mt-0.5 accent-[#7C3AED]" />
        <span>
          Permitir que Google y otros buscadores lo encuentren
          <span className="block text-[11px] text-[#8A8680]">Apágalo mientras lo revisas con tu cliente.</span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={publish}
          disabled={pending || !check.ok || !dirty}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#7C3AED] px-3 py-2 text-sm font-medium text-white hover:bg-[#6D28D9] disabled:opacity-50"
        >
          <Rocket className="size-4" />
          {pending ? "Guardando…" : live ? "Guardar cambios" : "Publicar"}
        </button>
        {live ? (
          <button type="button" onClick={unpublish} disabled={pending} className="rounded-xl px-3 py-2 text-sm text-[#5C5854] hover:bg-[#F3F0EB] disabled:opacity-50 dark:text-[#C8C4D4] dark:hover:bg-white/10">
            Despublicar
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[#8A8680]">
        Se publica gratis en la dirección de LYRA con un sello pequeño «Hecho con LYRA». En los sitios, lo que la gente escribe en los formularios llega a Contactos. Los cambios tardan hasta un minuto en verse. Todavía no hay dominio propio.
      </p>
    </section>
  );
}
