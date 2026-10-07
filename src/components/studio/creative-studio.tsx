"use client";

import { Download, Pencil, Play, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { discardCreation, reviseCreation, storeCreation } from "@/app/dashboard/studio/actions";
import { CreationHistory } from "@/components/media/creation-history";
import { useCredits } from "@/components/dashboard/credit-provider";
import { Button } from "@/components/ui/button";
import {
  GenerateButton,
  imageStyles,
  imageTemplates,
  StudioHero,
  StudioSection,
  StylePicker,
  TemplateCard,
  videoStyles,
  videoTemplates,
} from "@/components/studio/studio-pieces";
import type { CreationRecord } from "@/lib/media-pieces";
import { recordStudioClip } from "@/lib/studio/record-clip";
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
}

const tabs: { id: StudioTab; label: string; hint: string }[] = [
  { id: "video", label: "Video", hint: "Guion, voz y estilo" },
  { id: "image", label: "Imagen", hint: "Piezas y portadas" },
  { id: "search", label: "Inspiración", hint: "Busca referencias" },
];

export function CreativeStudio({ initialPieces = [] }: { initialPieces?: CreationRecord[] }) {
  const [tab, setTab] = useState<StudioTab>("video");
  const [pieces, setPieces] = useState<CreationRecord[]>(initialPieces);
  const [opened, setOpened] = useState<CreationRecord | null>(null);

  return (
    <div className="space-y-5">
      <StudioHero
        title="Crea como en un patio de juegos"
        subtitle="Elige una plantilla, cámbiale el estilo y mírala antes de generar. Video, imagen y voz en un solo lugar."
        stat={`${pieces.length} ${pieces.length === 1 ? "pieza guardada" : "piezas guardadas"}`}
      />

      <div role="tablist" aria-label="Estudio creativo" className="grid gap-2 sm:grid-cols-3">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-2xl border p-3 text-left transition-all duration-300",
                active
                  ? "border-[#7C3AED] bg-[#F5F3FF] shadow-[0_18px_40px_-30px_rgba(124,58,237,0.8)]"
                  : "border-[#E7E2DA] bg-white hover:border-[#C4B5FD]",
              )}
            >
              <p className={cn("text-sm font-semibold", active ? "text-[#5B21B6]" : "text-[#1E1E24]")}>{item.label}</p>
              <p className="mt-0.5 text-xs text-[#8A8680]">{item.hint}</p>
            </button>
          );
        })}
      </div>

      {tab === "video" ? (
        <VideoPanel
          restore={opened}
          onSaved={(piece) => setPieces((current) => [piece, ...current.filter((item) => item.id !== piece.id)])}
          onRemoved={(id) => setPieces((current) => current.filter((piece) => piece.id !== id))}
        />
      ) : null}
      {tab === "image" ? (
        <ImagePanel
          restore={opened}
          onSaved={(piece) => setPieces((current) => [piece, ...current.filter((item) => item.id !== piece.id)])}
          onRemoved={(id) => setPieces((current) => current.filter((piece) => piece.id !== id))}
        />
      ) : null}
      {tab === "search" ? <SearchPanel /> : null}
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
  );
}

type StudioImage = { id: string; name: string; url: string };

function VideoPanel({
  restore,
  onSaved,
  onRemoved,
}: {
  restore: CreationRecord | null;
  onSaved: (piece: CreationRecord) => void;
  onRemoved: (id: string) => void;
}) {
  const [format, setFormat] = useState("9:16");
  const [duration, setDuration] = useState("30 s");
  const [look, setLook] = useState("vlog");
  const [voice, setVoice] = useState("Cálida");
  const [music, setMusic] = useState("Suave");
  const [captions, setCaptions] = useState("Con subtítulos");
  const [detail, setDetail] = useState("");
  const [title, setTitle] = useState("Bienvenida a LYRA");
  const [script, setScript] = useState(
    "LYRA reúne la academia y los agentes para que tu red deje de improvisar cada conversación. Empieza por una fuente, una pregunta y un siguiente paso.",
  );
  const [images, setImages] = useState<StudioImage[]>([]);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bar, setBar] = useState(0);
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);

  const busy = pending || job?.status === "processing";
  const style = videoStyles.find((item) => item.id === look) ?? videoStyles[0];
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

  function applyTemplate(id: string) {
    const template = videoTemplates.find((item) => item.id === id);
    if (!template) return;
    setActiveTemplate(id);
    setTitle(template.title);
    setScript(template.script);
    setDetail(template.detail);
    setDuration(template.duration);
    setLook(template.styleId);
    toast.success(`Plantilla "${template.title}" lista para editar`);
  }

  async function generate() {
    setPending(true);
    try {
      const spoken = [script.trim(), detail.trim()].filter(Boolean).join(" ");
      const withCaptions = captions === "Con subtítulos";
      let data: VideoJob | null = null;
      try {
        const response = await fetch("/api/ai/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, script: spoken, format, styleId: look, duration, captions: withCaptions }),
        });
        const payload = (await response.json()) as VideoJob;
        if (response.ok && payload.videoUrl) data = payload;
      } catch {
        data = null;
      }
      if (!data?.videoUrl) {
        const clip = await recordStudioClip({
          title,
          script: spoken,
          format,
          styleId: look,
          duration,
          imageUrl: images[0]?.url ?? null,
          captions: withCaptions,
        });
        data = {
          mode: "live",
          provider: "lyra",
          status: "completed",
          videoUrl: clip.url,
          scenes: clip.scenes,
          message: "Video listo. Puedes guardarlo, editarlo o eliminarlo.",
        };
      }
      setJob(data);
      setEditing(false);
      toast.success("Video listo. Guárdalo si quieres conservarlo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el video.");
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

  const frame = format === "16:9" ? "aspect-video max-w-xl" : format === "1:1" ? "aspect-square max-w-sm" : "aspect-[9/16] max-w-[220px]";

  return (
    <div className="space-y-5">
      <div className={cn(locked && "pointer-events-none opacity-60")}>
        <StudioSection
          eyebrow="Empieza con una plantilla"
          title="Toca una idea y queda lista para editar"
          hint="Las plantillas traen guion, estilo y duración listos. Solo cambia lo tuyo."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {videoTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                gradient={template.gradient}
                title={template.title}
                tag={template.tag}
                meta={template.duration}
                active={activeTemplate === template.id}
                onClick={() => applyTemplate(template.id)}
              />
            ))}
          </div>
        </StudioSection>
      </div>

      <section className="grid gap-6 rounded-3xl border border-[#E7E2DA] bg-white p-4 sm:p-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className={cn(locked && "pointer-events-none opacity-60")}>
          <p className="text-[11px] tracking-[0.22em] uppercase text-[#8A8680]">Video</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#1E1E24]">Arma tu plano</h2>
          <p className="mt-1 text-sm text-[#5C5854]">Cambia el encuadre y el estilo; el preview se actualiza en vivo.</p>

          <StylePicker styles={videoStyles} value={look} onChange={setLook} label="Estilo visual" />

          <Choice label="Formato" value={format} options={["9:16", "1:1", "16:9"]} onChange={setFormat} />
          <Choice label="Duración" value={duration} options={["15 s", "30 s", "60 s"]} onChange={setDuration} />
          <Choice label="Voz" value={voice} options={["Cálida", "Firme", "Enérgica"]} onChange={setVoice} />
          <Choice label="Música" value={music} options={["Suave", "Épica", "Sin música"]} onChange={setMusic} />
          <Choice label="Texto en pantalla" value={captions} options={["Con subtítulos", "Sin subtítulos"]} onChange={setCaptions} />

          <Field label="Título" id="video-title">
            <input id="video-title" value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Qué tiene que verse" id="video-detail">
            <input id="video-detail" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Nombre, oferta, logo, ciudad" className={fieldClass} />
          </Field>
          <Field label="Guion · la voz" id="video-script">
            <textarea id="video-script" value={script} onChange={(event) => setScript(event.target.value)} rows={5} className={`${fieldClass} resize-none`} />
          </Field>
          <Field label="Imágenes del plano" id="video-images">
            <label
              htmlFor="video-images"
              className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#C4B5FD] bg-[#F5F3FF] px-4 py-3 text-sm text-[#5B21B6] transition-colors hover:bg-[#EDE9FE]"
            >
              <Upload className="h-4 w-4" aria-hidden />
              Sube hasta 6 imágenes
            </label>
            <input id="video-images" type="file" accept="image/*" multiple onChange={(event) => addImages(event.target.files)} className="sr-only" />
          </Field>
          {images.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {images.map((image) => (
                <li key={image.id} className="overflow-hidden rounded-xl border border-[#E7E2DA]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.name} className="h-20 w-full object-cover" />
                </li>
              ))}
            </ul>
          ) : null}

          <GenerateButton label="Crear video" busyLabel="Creando…" disabled={pending || script.trim().length < 12} onClick={() => void generate()} />
        </div>

        <div className="flex min-h-[440px] flex-col rounded-2xl bg-gradient-to-b from-[#F7F5F2] to-[#EFEAE3] p-4">
          {bar > 0 ? (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-[#1E1E24]">
                <p className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden />
                  Creando el video
                </p>
                <p className="tabular-nums text-[#7C3AED]">{Math.round(bar)}%</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E7E2DA]" role="progressbar" aria-valuenow={Math.round(bar)} aria-valuemin={0} aria-valuemax={100} aria-label="Creación del video">
                <div className="h-full bg-gradient-to-r from-[#7C3AED] to-[#DB2777]" style={{ width: `${bar}%` }} />
              </div>
            </div>
          ) : null}

          <p className="mb-2 text-[11px] tracking-[0.22em] uppercase text-[#8A8680]">Preview en vivo</p>
          <div className="flex flex-1 items-center justify-center">
            <div
              className={`relative flex w-full flex-col justify-end overflow-hidden rounded-2xl bg-[#1E1E24] bg-cover bg-center text-white shadow-[0_24px_60px_-30px_rgba(30,30,36,0.9)] ${job?.videoUrl ? "" : "p-4"} ${frame}`}
              style={images[0] && !job?.videoUrl ? { backgroundImage: `linear-gradient(to top, rgba(30,30,36,0.9), rgba(30,30,36,0.15)), url(${images[0].url})` } : undefined}
            >
              {job?.videoUrl ? (
                <video controls src={job.videoUrl} className="absolute inset-0 h-full w-full bg-black object-contain" />
              ) : (
                <>
                  <span className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70 ${style.gradient}`} aria-hidden />
                  <span className="pointer-events-none absolute -top-10 -right-8 h-32 w-32 rounded-full bg-white/20 blur-2xl vega-pulse" aria-hidden />
                  <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium backdrop-blur">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    {style.name} · {format} · {duration}
                  </span>
                  <div className="relative">
                    <p className="text-lg font-medium drop-shadow">{title || "Sin título"}</p>
                    {detail ? <p className="mt-2 text-sm text-white/85 drop-shadow">{detail}</p> : null}
                    <p className="mt-3 text-[11px] text-white/70">
                      Voz {voice.toLowerCase()} · {music.toLowerCase()} · {captions.toLowerCase()}
                    </p>
                  </div>
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-white/25 backdrop-blur">
                      <Play className="h-5 w-5 translate-x-[1px] fill-white text-white" aria-hidden />
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          {job?.videoUrl ? (
            <div className="mt-4 space-y-3">
              <PieceActions
                editing={editing}
                onDownload={() => void downloadVideo()}
                onSave={() => void saveVideo()}
                onEdit={() => setEditing((current) => !current)}
                onDelete={removePiece}
              />
              <p className="text-sm text-[#5C5854]">{job.message ?? job.error}</p>
              {job.scenes ? (
                <ol className="grid gap-2 sm:grid-cols-3">
                  {job.scenes.map((scene) => (
                    <li key={scene.index} className="rounded-xl border border-[#E7E2DA] bg-white px-3 py-2 text-sm text-[#5C5854]">
                      <span className="text-[10px] tracking-[0.18em] uppercase text-[#8A8680]">Plano {scene.index}</span>
                      <p className="mt-1">{scene.line}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-center text-sm text-[#8A8680]">El encuadre cambia con el formato. El detalle entra en el plano.</p>
          )}
        </div>
      </section>
    </div>
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
  onSaved,
  onRemoved,
}: {
  restore: CreationRecord | null;
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

  async function create() {
    const canvas = document.createElement("canvas");
    const wide = format === "16:9";
    const story = format === "9:16";
    canvas.width = wide ? 1280 : story ? 720 : 1080;
    canvas.height = wide ? 720 : story ? 1280 : 1080;
    const context = canvas.getContext("2d");
    if (!context) return;
    const cine = style === "cine";
    context.fillStyle = cine ? "#1E1E24" : style === "producto" ? "#F5F3FF" : style === "ilustracion" ? "#FDF2F8" : style === "tresd" ? "#ECFEFF" : "#F7F5F2";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const grad = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, cine ? "rgba(49,46,129,0.85)" : "rgba(167,139,250,0.28)");
    grad.addColorStop(1, "rgba(219,39,119,0.18)");
    context.fillStyle = grad;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const photo = reference ? await loadImage(reference) : null;
    if (photo) {
      const scale = Math.max(canvas.width / photo.width, canvas.height / photo.height);
      const w = photo.width * scale;
      const h = photo.height * scale;
      context.drawImage(photo, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      context.fillStyle = cine ? "rgba(30,30,36,0.55)" : "rgba(247,245,242,0.72)";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.fillStyle = cine ? "#F7F5F2" : "#1E1E24";
    context.font = "600 64px sans-serif";
    wrapText(context, title || "LYRA", 72, 180, canvas.width - 144, 76);
    context.font = "28px sans-serif";
    context.fillStyle = cine ? "#C8C2BA" : "#5C5854";
    wrapText(context, detail || "Detalle de la pieza", 72, canvas.height * 0.55, canvas.width - 144, 40);
    context.fillStyle = cine ? "rgba(255,255,255,0.85)" : "rgba(124,58,237,0.9)";
    context.font = "600 26px sans-serif";
    context.fillText("LYRA", 72, canvas.height - 64);
    const url = canvas.toDataURL("image/png");
    setImageUrl(url);
    setEditing(false);
    toast.success("Imagen lista. Guárdala si quieres conservarla.");
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
    link.download = `${(title || "imagen-lyra").slice(0, 40)}.png`;
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

function SearchPanel() {
  const [query, setQuery] = useState("tendencias de academias digitales y redes de agentes");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [note, setNote] = useState("Exa busca mercado y fuentes en vivo.");
  const [pending, setPending] = useState(false);
  const { syncBalance } = useCredits();

  async function search() {
    setPending(true);
    try {
      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        results?: SearchResult[];
        credits?: number;
      };
      syncBalance(data.credits, response.ok ? `Búsqueda · ${query.slice(0, 40)}` : undefined);
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
