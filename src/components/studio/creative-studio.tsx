"use client";

import { ArrowUp, Download, Paperclip, Pencil, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { discardCreation, reviseCreation, storeCreation } from "@/app/dashboard/studio/actions";
import { CreationHistory } from "@/components/media/creation-history";
import { useCredits } from "@/components/dashboard/credit-provider";
import { Button } from "@/components/ui/button";
import {
  GenerateButton,
  imageStyles,
  imageTemplates,
  StudioSection,
  StylePicker,
  TemplateCard,
} from "@/components/studio/studio-pieces";
import type { CreationRecord } from "@/lib/media-pieces";
import { cn } from "@/lib/utils";

const mediaLimit = 1_900_000;

type StudioTab = "video" | "image" | "search";

type VideoJob = {
  mode: "preview" | "live";
  provider: "lyra";
  status: "ready" | "processing" | "completed" | "failed";
  jobId?: string;
  videoUrl?: string | null;
  message?: string;
  scenes?: { index: number; line: string }[];
  error?: string;
};

type SearchResult = {
  title: string;
  url: string;
  highlight: string;
};

async function persistPiece(input: {
  id: string | null;
  kind: "video" | "image";
  title: string;
  body: string;
  media: string;
}) {
  if (input.media.length > mediaLimit) {
    toast.error("La pieza es demasiado grande para guardarla. Prueba 15 segundos.");
    return null;
  }
  try {
    if (input.id) {
      const revised = await reviseCreation({ id: input.id, title: input.title, body: input.body, media: input.media });
      if (!revised) {
        toast.error("No se pudo actualizar la pieza.");
        return null;
      }
      return revised;
    }
    const saved = await storeCreation({
      area: "studio",
      kind: input.kind,
      title: input.title,
      body: input.body,
      media: input.media,
    });
    if (!saved) {
      toast.error("No se pudo guardar la pieza.");
      return null;
    }
    return saved;
  } catch {
    toast.error("No se pudo guardar la pieza.");
    return null;
  }
}

const tabs: { id: StudioTab; label: string; hint: string }[] = [
  { id: "video", label: "Video", hint: "Anuncio con imagen y audio" },
  { id: "image", label: "Imagen", hint: "Campaña, retrato o producto" },
  { id: "search", label: "Búsqueda", hint: "Referencias para la pieza" },
];

const stages: Record<StudioTab, { placeholder: string; action: string }> = {
  video: { placeholder: "Escribe la idea o pega el guion del video", action: "Crear video" },
  image: { placeholder: "Describe la imagen que quieres", action: "Crear imagen" },
  search: { placeholder: "Qué quieres encontrar", action: "Buscar" },
};

const ideas: Record<StudioTab, { label: string; text: string }[]> = {
  video: [
    { label: "Anuncio", text: "Un frasco de perfume sobre mármol negro, luz dorada, cámara lenta" },
    { label: "Producto", text: "Un reloj de oro sobre roble, reflejo suave, estudio oscuro" },
    { label: "Ciudad", text: "Una ciudad de noche desde un auto, luces violetas" },
  ],
  image: [
    { label: "Retrato", text: "Retrato editorial, luz de estudio, fondo negro" },
    { label: "Producto", text: "Skincare sobre piedra, luz lateral" },
    { label: "Logo", text: "Logo de oro sobre seda oscura" },
  ],
  search: [
    { label: "Lujo", text: "campañas de lujo 2026" },
    { label: "Perfumes", text: "anuncios de perfumes" },
    { label: "Producto", text: "fotografía de producto premium" },
  ],
};

const backdrop = [
  { src: "/studio/fondo-1.mp4", place: "left-[-8%] top-[6%] hidden w-[36%] -rotate-6 sm:block", delay: "0s" },
  { src: "/studio/fondo-2.mp4", place: "right-[-6%] top-[8%] w-[34%] rotate-6 sm:w-[30%]", delay: "1.2s" },
  { src: "/studio/fondo-3.mp4", place: "bottom-[5%] left-[-6%] hidden w-[32%] rotate-3 sm:block", delay: "0.6s" },
  { src: "/studio/fondo-4.mp4", place: "right-[-4%] bottom-[7%] w-[36%] -rotate-3 sm:w-[28%]", delay: "1.8s" },
];

type StudioBrief = { id: number; tab: StudioTab; text: string };

export function CreativeStudio({ initialPieces = [] }: { initialPieces?: CreationRecord[] }) {
  const [tab, setTab] = useState<StudioTab>("video");
  const [pieces, setPieces] = useState<CreationRecord[]>(initialPieces);
  const [opened, setOpened] = useState<CreationRecord | null>(null);
  const [draft, setDraft] = useState("");
  const [quality, setQuality] = useState<"4K" | "1080p">("4K");
  const [brief, setBrief] = useState<StudioBrief | null>(null);
  const [reel, setReel] = useState<string | null>(null);
  const scriptRef = useRef<HTMLInputElement>(null);
  const stage = stages[tab];

  function launch(text = draft) {
    const next = text.trim();
    const minimum = tab === "search" ? 3 : tab === "image" ? 2 : 12;
    if (next.length < minimum) {
      toast.error(tab === "video" ? "Describe el anuncio con al menos una frase." : "Escribe un poco más.");
      return;
    }
    setDraft(next);
    setBrief({ id: Date.now(), tab, text: next });
    document.getElementById("studio-work")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-5">
      <section className="relative isolate min-h-[78vh] overflow-hidden bg-[#100818] text-white md:min-h-[calc(100dvh-1rem)]">
        {reel && tab === "video" ? (
          <video key={reel} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline>
            <source src={reel} type="video/mp4" />
          </video>
        ) : (
          backdrop.map((clip) => (
            <div key={clip.src} className={cn("pointer-events-none absolute", clip.place)}>
              <div className="studio-drift overflow-hidden rounded-2xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)] ring-1 ring-white/20" style={{ animationDelay: clip.delay }}>
                <video className="aspect-video w-full object-cover" autoPlay muted loop playsInline>
                  <source src={clip.src} type="video/mp4" />
                </video>
              </div>
            </div>
          ))
        )}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,8,24,0.15)_0%,rgba(16,8,24,0.72)_58%,rgba(16,8,24,0.92)_100%)]" />
        <div className="relative z-10 flex min-h-[78vh] flex-col items-center justify-center px-4 py-8 md:min-h-[calc(100dvh-1rem)]">
          <p className="text-[11px] font-medium tracking-[0.28em] text-white/70 uppercase">Estudio creativo</p>
          <h2 className="mt-3 text-center text-3xl font-semibold tracking-tight sm:text-5xl">Video o imagen, desde aquí.</h2>
          <form
            className="mt-8 w-full max-w-2xl overflow-hidden rounded-3xl bg-white text-[#1E1E24] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.55)]"
            onSubmit={(event) => {
              event.preventDefault();
              launch();
            }}
          >
            <div role="tablist" aria-label="Qué quieres crear" className="grid grid-cols-3 border-b border-[#E7E2DA]">
              {tabs.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className={cn("px-3 py-4 text-left", active ? "bg-[#F5F3FF]" : "hover:bg-[#F6F4F1]")}
                  >
                    <span className={cn("block text-sm font-semibold", active ? "text-[#5B21B6]" : "text-[#1E1E24]")}>{item.label}</span>
                    <span className="mt-0.5 hidden text-[11px] leading-4 text-[#8A8680] sm:block">{item.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="px-4 pt-4 sm:px-5">
              {tab === "video" ? (
                <div className="mb-3 flex gap-2">
                  {(["4K", "1080p"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setQuality(option)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        quality === option ? "border-[#7C3AED] bg-[#7C3AED] text-white" : "border-[#E7E2DA] text-[#5C5854]",
                      )}
                    >
                      {option === "4K" ? "4K" : "HD 1080p"}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {ideas[tab].map((idea) => (
                  <button
                    key={idea.label}
                    type="button"
                    onClick={() => setDraft(idea.text)}
                    className="rounded-full border border-[#DDD6FE] bg-[#F5F3FF] px-3 py-1 text-xs font-medium text-[#5B21B6] hover:border-[#7C3AED]"
                  >
                    {idea.label}
                  </button>
                ))}
              </div>
              <label htmlFor="studio-prompt" className="sr-only">
                Describe lo que quieres crear
              </label>
              <textarea
                id="studio-prompt"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={stage.placeholder}
                rows={4}
                className="mt-3 w-full resize-none bg-transparent text-sm leading-6 text-[#1E1E24] outline-none placeholder:text-[#A8A29E] sm:text-base"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[#F0ECE6] px-4 py-3 sm:px-5">
              <input
                ref={scriptRef}
                type="file"
                accept=".txt,.md,text/plain"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void file.text().then((text) => setDraft(text.trim().slice(0, 4000)));
                }}
              />
              <button
                type="button"
                onClick={() => scriptRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E7E2DA] px-3 py-2 text-sm text-[#5C5854] hover:border-[#C4B5FD]"
              >
                <Paperclip className="size-4" />
                Guion
              </button>
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6D28D9]">
                {stage.action}
                <ArrowUp className="size-4" />
              </button>
            </div>
          </form>
        </div>
      </section>

      <div id="studio-work" className="space-y-5 px-4 sm:px-6 lg:px-10">
        <div className={tab === "video" ? undefined : "hidden"}>
          <VideoPanel
            restore={opened}
            brief={brief}
            quality={quality}
            onReady={setReel}
            onSaved={(piece) => setPieces((current) => [piece, ...current.filter((item) => item.id !== piece.id)])}
            onRemoved={(id) => setPieces((current) => current.filter((piece) => piece.id !== id))}
          />
        </div>
        <div className={tab === "image" ? undefined : "hidden"}>
          <ImagePanel
            restore={opened}
            brief={brief}
            onSaved={(piece) => setPieces((current) => [piece, ...current.filter((item) => item.id !== piece.id)])}
            onRemoved={(id) => setPieces((current) => current.filter((piece) => piece.id !== id))}
          />
        </div>
        <div className={tab === "search" ? undefined : "hidden"}>
          <SearchPanel brief={brief} />
        </div>
      </div>
      <div className="px-4 sm:px-6 lg:px-10">
      <CreationHistory
        pieces={pieces}
        onOpen={(piece) => {
          setOpened(piece);
          setTab(piece.kind === "image" ? "image" : "video");
        }}
        onDelete={(piece) => {
          setPieces((current) => current.filter((item) => item.id !== piece.id));
          void discardCreation(piece.id);
        }}
      />
      </div>
    </div>
  );
}

async function waitForPremium(jobId: string) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const response = await fetch(`/api/ai/video?jobId=${encodeURIComponent(jobId)}`);
    const payload = (await response.json().catch(() => ({}))) as { status?: string; error?: string; videoUrl?: string };
    if (payload.status === "completed") return payload.videoUrl ?? `/api/ai/video?jobId=${encodeURIComponent(jobId)}&play=1`;
    if (!response.ok || payload.status === "failed" || payload.status === "cancelled" || payload.status === "expired") {
      throw new Error(payload.error ?? "No se pudo terminar el anuncio.");
    }
  }
  throw new Error("El render sigue en curso. Vuelve a pedirlo en un momento.");
}

type StudioImage = { id: string; name: string; url: string };

function VideoPanel({
  restore,
  brief,
  quality,
  onReady,
  onSaved,
  onRemoved,
}: {
  restore: CreationRecord | null;
  brief: StudioBrief | null;
  quality: "4K" | "1080p";
  onReady: (url: string) => void;
  onSaved: (piece: CreationRecord) => void;
  onRemoved: (id: string) => void;
}) {
  const [format, setFormat] = useState("16:9");
  const [duration, setDuration] = useState("8 s");
  const [look, setLook] = useState("cine");
  const [detail, setDetail] = useState("");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [images, setImages] = useState<StudioImage[]>([]);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bar, setBar] = useState(0);
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const launched = useRef(0);

  const busy = pending || job?.status === "processing";
  const locked = Boolean(job?.videoUrl) && !editing;

  if (restore && restore.kind === "video" && restore.id !== restoredId) {
    setRestoredId(restore.id);
    setTitle(restore.title);
    setScript(restore.body);
    setPieceId(restore.id);
    setEditing(false);
    setJob({
      mode: restore.media ? "live" : "preview",
      provider: "lyra",
      status: restore.media ? "completed" : "ready",
      videoUrl: restore.media,
      message: restore.media ? "Video guardado. Puedes editarlo o eliminarlo." : restore.title,
    });
  }

  useEffect(() => {
    if (!busy) return;
    const start = window.setTimeout(() => setBar((current) => (current > 0 && current < 100 ? current : 8)), 0);
    const timer = window.setInterval(() => {
      setBar((current) => (current >= 92 ? 92 : Math.min(92, current + (current < 40 ? 6 : 2))));
    }, 450);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [busy]);

  useEffect(() => {
    if (busy) return;
    const timer = window.setTimeout(() => setBar((current) => (current > 0 && current < 100 ? 100 : current)), 0);
    const reset = window.setTimeout(() => setBar(0), 700);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(reset);
    };
  }, [busy]);

  useEffect(() => {
    if (!brief || brief.tab !== "video" || brief.id === launched.current) return;
    launched.current = brief.id;
    setTitle(brief.text.slice(0, 72));
    setScript(brief.text);
    setLook("cine");
    setFormat("16:9");
    void generate(brief.text);
  }, [brief]);

  async function generate(override?: string) {
    setPending(true);
    setJob({ mode: "live", provider: "lyra", status: "processing", message: "Rodando el anuncio con Veo…" });
    try {
      const spoken = [override?.trim() || script.trim(), detail.trim()].filter(Boolean).join(" ");
      const response = await fetch("/api/ai/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: override?.slice(0, 72) || title,
          script: spoken,
          format: override ? "16:9" : format,
          styleId: "cine",
          duration: "8 s",
          captions: false,
          quality: qualityRef.current,
        }),
      });
      const payload = (await response.json()) as VideoJob & { jobId?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear el video.");
      let data: VideoJob | null = null;
      if (payload.status === "processing" && payload.jobId) {
        setJob({ ...payload, provider: "lyra", status: "processing", message: payload.message ?? "Rodando el anuncio…" });
        const videoUrl = await waitForPremium(payload.jobId);
        data = { ...payload, provider: "lyra", status: "completed", videoUrl, message: "Anuncio listo." };
      } else if (payload.videoUrl) data = payload;
      if (!data?.videoUrl) throw new Error(payload.error ?? "El modelo no devolvió el video.");
      onReady(data.videoUrl);
      setJob(data);
      setEditing(false);
      toast.success("Video listo. Puedes guardarlo o descargarlo.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el video.";
      setJob({ mode: "live", provider: "lyra", status: "failed", error: message, message });
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function saveVideo() {
    if (!job?.videoUrl) {
      toast.error("Crea el video antes de guardarlo.");
      return;
    }
    const saved = await persistPiece({
      id: pieceId,
      kind: "video",
      title,
      body: script,
      media: job.videoUrl,
    });
    if (!saved) return;
    setPieceId(saved.id);
    onSaved({
      id: saved.id,
      area: "studio",
      kind: "video",
      title,
      body: script,
      media: job.videoUrl,
      createdAt: saved.createdAt,
    });
    toast.success(pieceId ? "Video actualizado." : "Video guardado.");
  }

  function addImages(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 6)
      .map((file) => ({ id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file) }));
    setImages((current) => [...current, ...next].slice(0, 6));
  }

  function removePiece() {
    if (pieceId) {
      void discardCreation(pieceId);
      onRemoved(pieceId);
    }
    setPieceId(null);
    setJob(null);
    setEditing(false);
  }

  async function downloadVideo() {
    if (!job?.videoUrl) {
      toast.error("El video todavía no tiene archivo. Puedes editar el guion y las imágenes.");
      return;
    }
    try {
      const response = await fetch(job.videoUrl);
      if (!response.ok) throw new Error("sin archivo");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      const extension = job.videoUrl.startsWith("data:video/webm") ? "webm" : "mp4";
      link.download = `${title.slice(0, 40) || "video-lyra"}.${extension}`;
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      const link = document.createElement("a");
      link.href = job.videoUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.click();
    }
  }

  const frame = format === "16:9" ? "aspect-video" : format === "1:1" ? "aspect-square max-w-xl" : "aspect-[9/16] max-w-sm";

  return (
    <section className="overflow-hidden rounded-3xl bg-[#0B0A10] text-white">
      {bar > 0 && !job?.videoUrl ? (
        <div className="px-5 pt-5">
          <div className="flex items-center justify-between text-sm">
            <p className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#C4B5FD]" aria-hidden />
              Rodando el anuncio
            </p>
            <p className="tabular-nums text-[#C4B5FD]">{Math.round(bar)}%</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(bar)} aria-valuemin={0} aria-valuemax={100} aria-label="Creación del video">
            <div className="h-full bg-[#7C3AED]" style={{ width: `${bar}%` }} />
          </div>
        </div>
      ) : null}
      <div className="flex min-h-[420px] items-center justify-center p-4">
        {job?.videoUrl ? (
          <video controls autoPlay src={job.videoUrl} className={`w-full bg-black ${frame}`} />
        ) : (
          <p className="max-w-md text-center text-sm leading-6 text-white/70">
            {job?.status === "failed"
              ? job.message
              : pending || job?.status === "processing"
                ? "Veo está rodando el clip. El video aparece aquí cuando el archivo está listo."
                : "Escribe el anuncio arriba. Aquí se reproduce el video, con imagen y audio."}
          </p>
        )}
      </div>
      <div className={cn("flex flex-wrap items-center justify-between gap-3 px-5 pb-5", locked && "pointer-events-none opacity-60")}>
        <div className="flex gap-2">
          {(["16:9", "9:16", "1:1"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFormat(option)}
              className={cn("rounded-full px-3 py-1.5 text-sm", format === option ? "bg-white text-[#0B0A10]" : "bg-white/10 text-white")}
            >
              {option}
            </button>
          ))}
        </div>
        {job?.videoUrl ? (
          <PieceActions
            editing={editing}
            onDownload={() => void downloadVideo()}
            onSave={() => void saveVideo()}
            onEdit={() => setEditing((current) => !current)}
            onDelete={removePiece}
          />
        ) : (
          <button
            type="button"
            disabled={pending || script.trim().length < 12}
            onClick={() => void generate()}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[#0B0A10] disabled:opacity-40"
          >
            {pending ? "Rodando…" : "Crear video"}
          </button>
        )}
      </div>
    </section>
  );
}

const fieldClass = "mt-2 w-full rounded-xl border border-[#E7E2DA] bg-white px-3 py-2 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]";

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <label htmlFor={id} className="mt-4 block text-xs text-[#8A8680]">
      {label}
      {children}
    </label>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs text-[#8A8680]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              value === option ? "border-[#1E1E24] bg-[#1E1E24] text-white" : "border-[#E7E2DA] bg-white text-[#5C5854] hover:border-[#C4B5FD]",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImagePanel({
  restore,
  brief,
  onSaved,
  onRemoved,
}: {
  restore: CreationRecord | null;
  brief: StudioBrief | null;
  onSaved: (piece: CreationRecord) => void;
  onRemoved: (id: string) => void;
}) {
  const [format, setFormat] = useState("1:1");
  const [style, setStyle] = useState("editorial");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);

  const { syncBalance } = useCredits();
  const launched = useRef(0);
  const chosen = imageStyles.find((item) => item.id === style) ?? imageStyles[0];
  const locked = Boolean(imageUrl) && !editing;

  if (restore && restore.kind === "image" && restore.id !== restoredId) {
    setRestoredId(restore.id);
    setTitle(restore.title);
    setDetail(restore.body);
    setImageUrl(restore.media);
    setPieceId(restore.id);
    setEditing(false);
  }

  function pickReference(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setReference(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  function applyTemplate(id: string) {
    const template = imageTemplates.find((item) => item.id === id);
    if (!template) return;
    setActiveTemplate(id);
    setTitle(template.title);
    setDetail(template.detail);
    setStyle(template.styleId);
    toast.success(`Plantilla "${template.title}" lista para editar`);
  }

  useEffect(() => {
    if (!brief || brief.tab !== "image" || brief.id === launched.current) return;
    launched.current = brief.id;
    setTitle(brief.text.slice(0, 80));
    setStyle("cine");
    setFormat("16:9");
    void create(brief.text);
  }, [brief]);

  async function create(overrideTitle?: string) {
    const headline = (overrideTitle ?? title).trim();
    const prompt = [headline, detail.trim(), chosen.name].filter(Boolean).join(". ");
    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size: format }),
      });
      const payload = (await response.json().catch(() => ({}))) as { dataUrl?: string; error?: string; credits?: number };
      syncBalance(payload.credits, response.ok ? "Imagen" : undefined);
      if (response.ok && payload.dataUrl) {
        setImageUrl(payload.dataUrl);
        setEditing(false);
        toast.success("Imagen lista. Guárdala si quieres conservarla.");
        return;
      }
      toast.error(payload.error ?? "No se pudo crear la imagen con IA.");
      return;
    } catch {
      toast.error("No se pudo crear la imagen con IA.");
    }
  }

  async function saveImage() {
    if (!imageUrl) {
      toast.error("Crea la imagen antes de guardarla.");
      return;
    }
    const saved = await persistPiece({
      id: pieceId,
      kind: "image",
      title: title || "Imagen",
      body: detail,
      media: imageUrl,
    });
    if (!saved) return;
    setPieceId(saved.id);
    onSaved({
      id: saved.id,
      area: "studio",
      kind: "image",
      title: title || "Imagen",
      body: detail,
      media: imageUrl,
      createdAt: saved.createdAt,
    });
    toast.success(pieceId ? "Imagen actualizada." : "Imagen guardada.");
  }

  function removeImage() {
    if (pieceId) {
      void discardCreation(pieceId);
      onRemoved(pieceId);
    }
    setPieceId(null);
    setImageUrl(null);
    setEditing(false);
  }

  function download() {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    const extension = imageUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
    link.download = `${(title || "imagen-lyra").slice(0, 40)}.${extension}`;
    link.click();
  }

  const frame = format === "16:9" ? "aspect-video" : format === "9:16" ? "aspect-[9/16] max-w-[240px]" : "aspect-square max-w-sm";

  return (
    <div className="space-y-5">
      <div className={cn(locked && "pointer-events-none opacity-60")}>
        <StudioSection
          eyebrow="Empieza con una plantilla"
          title="Piezas listas para tu marca"
          hint="Toca una idea y ajústala. Cambia el estilo y el preview se actualiza."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {imageTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                gradient={template.gradient}
                title={template.title}
                tag={template.tag}
                active={activeTemplate === template.id}
                onClick={() => applyTemplate(template.id)}
              />
            ))}
          </div>
        </StudioSection>
      </div>

      <section className="grid gap-6 rounded-3xl border border-[#E7E2DA] bg-white p-4 sm:p-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className={cn(locked && "pointer-events-none opacity-60")}>
          <p className="text-[11px] tracking-[0.22em] uppercase text-[#8A8680]">Imagen</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#1E1E24]">Una pieza, con lo que importa</h2>

          <StylePicker styles={imageStyles} value={style} onChange={setStyle} label="Estilo visual" />

          <Choice label="Formato" value={format} options={["1:1", "9:16", "16:9"]} onChange={setFormat} />
          <Field label="Texto principal" id="image-title">
            <input id="image-title" value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Detalle que debe salir" id="image-detail">
            <textarea id="image-detail" value={detail} onChange={(event) => setDetail(event.target.value)} rows={4} className={`${fieldClass} resize-none`} />
          </Field>
          <Field label="Imagen de referencia" id="image-reference">
            <label
              htmlFor="image-reference"
              className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#C4B5FD] bg-[#F5F3FF] px-4 py-3 text-sm text-[#5B21B6] transition-colors hover:bg-[#EDE9FE]"
            >
              <Upload className="h-4 w-4" aria-hidden />
              Sube una imagen base
            </label>
            <input id="image-reference" type="file" accept="image/*" onChange={(event) => pickReference(event.target.files)} className="sr-only" />
          </Field>
          {reference ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reference} alt="Referencia" className="mt-3 h-20 w-20 rounded-xl border border-[#E7E2DA] object-cover" />
          ) : null}

          <GenerateButton label="Crear imagen" busyLabel="Creando…" disabled={title.trim().length < 2} onClick={() => void create()} />
        </div>

        <div className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-[#F7F5F2] to-[#EFEAE3] p-4">
          <p className="mb-2 self-start text-[11px] tracking-[0.22em] uppercase text-[#8A8680]">Preview en vivo</p>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={title || "Imagen"} className={`w-full rounded-2xl object-cover shadow-[0_24px_60px_-30px_rgba(30,30,36,0.7)] ${frame}`} />
          ) : (
            <div className={`relative flex w-full items-end overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-[0_24px_60px_-30px_rgba(30,30,36,0.7)] ${chosen.gradient} ${frame}`}>
              <span className="pointer-events-none absolute -top-10 -right-8 h-32 w-32 rounded-full bg-white/25 blur-2xl vega-pulse" aria-hidden />
              {reference ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={reference} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
              ) : null}
              <p className="relative text-sm text-white drop-shadow">
                {chosen.name} · {format}
              </p>
            </div>
          )}
          {imageUrl ? (
            <PieceActions editing={editing} onDownload={download} onSave={() => void saveImage()} onEdit={() => setEditing((current) => !current)} onDelete={removeImage} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PieceActions({
  editing,
  onDownload,
  onSave,
  onEdit,
  onDelete,
}: {
  editing: boolean;
  onDownload: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs text-[#1E1E24]">
        <Download className="h-3.5 w-3.5" aria-hidden />
        Descargar
      </button>
      <button type="button" onClick={onSave} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs text-[#1E1E24]">
        <Save className="h-3.5 w-3.5" aria-hidden />
        Guardar
      </button>
      <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs text-[#1E1E24]">
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        {editing ? "Cerrar" : "Editar"}
      </button>
      <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs text-[#9A3B2F]">
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Eliminar
      </button>
    </div>
  );
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      context.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) context.fillText(line, x, cursor);
}

function SearchPanel({ brief }: { brief: StudioBrief | null }) {
  const [query, setQuery] = useState("tendencias de academias digitales y redes de agentes");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [note, setNote] = useState("Exa busca mercado y fuentes en vivo.");
  const [pending, setPending] = useState(false);
  const { syncBalance } = useCredits();
  const launched = useRef(0);

  useEffect(() => {
    if (!brief || brief.tab !== "search" || brief.id === launched.current) return;
    launched.current = brief.id;
    setQuery(brief.text);
    void search(brief.text);
  }, [brief]);

  async function search(override?: string) {
    const q = (override ?? query).trim();
    setPending(true);
    try {
      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        results?: SearchResult[];
        credits?: number;
      };
      syncBalance(data.credits, response.ok ? `Búsqueda · ${q.slice(0, 40)}` : undefined);
      if (!response.ok) {
        toast.error(data.error ?? "No se pudo buscar.");
        return;
      }
      setResults(data.results ?? []);
      setNote(data.message ?? `${data.results?.length ?? 0} resultados`);
    } finally {
      setPending(false);
    }
  }

  return (
    <StudioSection
      eyebrow="Inspiración"
      title="Busca referencias antes de crear"
      hint="Exa devuelve páginas y el pasaje más útil de cada una."
    >
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <label htmlFor="exa-query" className="sr-only">
          Búsqueda
        </label>
        <input
          id="exa-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-full border border-[#E7E2DA] bg-white px-4 py-2 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]"
        />
        <Button type="submit" variant="constellation" disabled={pending || query.trim().length < 3}>
          {pending ? "Buscando" : "Buscar"}
        </Button>
      </form>
      <p className="mt-4 text-xs text-[#8A8680]">{note}</p>
      <ul className="mt-4 space-y-3">
        {results.map((result) => (
          <li key={result.url} className="rounded-xl border border-[#E7E2DA] bg-white p-4">
            <a href={result.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-[#1E1E24] hover:text-[#7C3AED]">
              {result.title}
            </a>
            <p className="mt-1 truncate text-xs text-[#8A8680]">{result.url}</p>
            {result.highlight ? <p className="mt-2 text-sm leading-6 text-[#5C5854]">{result.highlight}</p> : null}
          </li>
        ))}
      </ul>
    </StudioSection>
  );
}
