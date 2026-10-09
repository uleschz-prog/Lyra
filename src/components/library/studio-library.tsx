"use client";

import { Clapperboard, Download, ImageIcon, Library, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { discardCreation } from "@/app/dashboard/studio/actions";
import type { CreationRecord } from "@/lib/media-pieces";
import { cn } from "@/lib/utils";

type Filter = "all" | "video" | "image";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "video", label: "Videos" },
  { id: "image", label: "Imágenes" },
];

function when(value: string) {
  return new Date(value).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

async function downloadPiece(piece: CreationRecord) {
  if (!piece.media) return;
  const fallback = piece.kind === "video" ? "mp4" : piece.media.startsWith("data:image/jpeg") ? "jpg" : "png";
  try {
    const response = await fetch(piece.media);
    if (!response.ok) throw new Error("sin archivo");
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${piece.title.slice(0, 40) || "pieza-lyra"}.${fallback}`;
    link.click();
    URL.revokeObjectURL(href);
  } catch {
    const link = document.createElement("a");
    link.href = piece.media;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
  }
}

export function StudioLibrary({ initialPieces }: { initialPieces: CreationRecord[] }) {
  const [pieces, setPieces] = useState(initialPieces);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<CreationRecord | null>(null);
  const visible = useMemo(
    () => pieces.filter((piece) => (filter === "all" ? piece.kind === "video" || piece.kind === "image" : piece.kind === filter)),
    [pieces, filter],
  );
  const counts: Record<Filter, number> = {
    all: pieces.filter((piece) => piece.kind === "video" || piece.kind === "image").length,
    video: pieces.filter((piece) => piece.kind === "video").length,
    image: pieces.filter((piece) => piece.kind === "image").length,
  };

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function remove(piece: CreationRecord) {
    setPieces((current) => current.filter((item) => item.id !== piece.id));
    setOpen((current) => (current?.id === piece.id ? null : current));
    const ok = await discardCreation(piece.id);
    if (!ok) {
      setPieces((current) => [piece, ...current.filter((item) => item.id !== piece.id)]);
      toast.error("No se pudo quitar la pieza.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Estudio creativo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1E1E24] dark:text-[#F2F0F7]">Biblioteca</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#5C5854] dark:text-[#9B96AC]">
            Aquí queda cada video e imagen que creas en el estudio.
          </p>
        </div>
        <Link
          href="/dashboard/studio"
          className="inline-flex rounded-full bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white hover:bg-[#6D28D9]"
        >
          Crear en el estudio
        </Link>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar piezas">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              filter === item.id
                ? "border-[#1E1E24] bg-[#1E1E24] text-white dark:border-white dark:bg-white dark:text-[#1E1E24]"
                : "border-[#E7E2DA] bg-white text-[#5C5854] hover:border-[#C4B5FD] dark:border-white/12 dark:bg-[#181625] dark:text-[#C8C4D4]",
            )}
          >
            {item.label}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[#E7E2DA] bg-white px-6 py-16 text-center dark:border-white/12 dark:bg-[#181625]">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#221F30]">
            <Library className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-medium text-[#1E1E24] dark:text-[#F2F0F7]">
            {counts.all === 0 ? "Todavía no hay piezas" : "Nada en este filtro"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#5C5854] dark:text-[#9B96AC]">
            {counts.all === 0
              ? "Crea un video o una imagen en el estudio y aparecerá aquí, lista para verla o descargarla."
              : "Prueba con Todo para ver el resto de lo creado."}
          </p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((piece) => (
            <li key={piece.id} className="overflow-hidden rounded-3xl border border-[#E7E2DA] bg-white dark:border-white/12 dark:bg-[#181625]">
              <button type="button" onClick={() => setOpen(piece)} className="block w-full text-left" aria-label={`Abrir ${piece.title}`}>
                <span className="relative block aspect-video bg-[#100818]">
                  {piece.kind === "image" && piece.media ? (
                    <img src={piece.media} alt="" className="h-full w-full object-cover" />
                  ) : piece.kind === "video" && piece.media ? (
                    <video src={piece.media} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-white/50">
                      {piece.kind === "video" ? <Clapperboard className="size-6" /> : <ImageIcon className="size-6" />}
                    </span>
                  )}
                  <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
                    {piece.kind === "video" ? "Video" : "Imagen"}
                  </span>
                </span>
                <span className="block px-4 py-3">
                  <span className="block truncate text-sm font-medium text-[#1E1E24] dark:text-[#F2F0F7]">{piece.title}</span>
                  <span className="mt-1 block text-xs text-[#8A8680]">{when(piece.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-piece-title"
            className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:p-5 dark:bg-[#181625]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-[0.18em] text-[#7C3AED] uppercase">{open.kind === "video" ? "Video" : "Imagen"}</p>
                <h2 id="library-piece-title" className="mt-1 truncate text-lg font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">
                  {open.title}
                </h2>
                <p className="mt-1 text-xs text-[#8A8680]">{when(open.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="grid size-10 shrink-0 place-items-center rounded-full text-[#5C5854] hover:bg-[#F3F0EB] dark:text-[#C8C4D4] dark:hover:bg-[#221F30]"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl bg-[#100818]">
              {open.kind === "video" && open.media ? (
                <video key={open.id} src={open.media} controls autoPlay className="aspect-video w-full" />
              ) : open.kind === "image" && open.media ? (
                <img src={open.media} alt={open.title} className="max-h-[60dvh] w-full object-contain" />
              ) : (
                <p className="px-6 py-16 text-center text-sm text-white/70">Esta pieza no tiene archivo.</p>
              )}
            </div>
            {open.body ? <p className="mt-4 text-sm leading-relaxed text-[#5C5854] dark:text-[#C8C4D4]">{open.body}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadPiece(open)}
                disabled={!open.media}
                className="inline-flex items-center gap-2 rounded-full bg-[#1E1E24] px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-[#F2F0F7] dark:text-[#1E1E24]"
              >
                <Download className="size-4" />
                Descargar
              </button>
              <button
                type="button"
                onClick={() => void remove(open)}
                className="inline-flex items-center gap-2 rounded-full border border-[#E7E2DA] px-4 py-2 text-sm text-[#9A3B2F] dark:border-white/12"
              >
                <Trash2 className="size-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
