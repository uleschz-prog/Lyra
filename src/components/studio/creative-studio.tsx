"use client";

import { Download, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { discardCreation, storeCreation } from "@/app/dashboard/creations/actions";
import { CreationHistory } from "@/components/creations/creation-history";
import { readReturnedBalance, readReturnedTransaction, useCredits } from "@/components/dashboard/credit-provider";
import { Button } from "@/components/ui/button";
import type { CreationRecord } from "@/lib/creations";
import { cn } from "@/lib/utils";

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

const tabs: { id: StudioTab; label: string }[] = [
  { id: "video", label: "Video" },
  { id: "image", label: "Imagen" },
  { id: "search", label: "Búsqueda" },
];

export function CreativeStudio({ initialPieces = [] }: { initialPieces?: CreationRecord[] }) {
  const [tab, setTab] = useState<StudioTab>("video");
  const [pieces, setPieces] = useState<CreationRecord[]>(initialPieces);
  const [opened, setOpened] = useState<CreationRecord | null>(null);

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Estudio creativo" className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-all duration-300 ease-in-out",
              tab === item.id
                ? "border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#1E1E24]"
                : "border-border bg-[#F4F1EC] text-[#5C5854] hover:border-[#C9C3BA] hover:text-[#1E1E24]",
            )}
          >
            {item.label}
          </button>
        ))}
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
  const [look, setLook] = useState("Claro");
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
  const { applyServerBalance } = useCredits();
  const inFlight = useRef(false);

  const busy = pending || job?.status === "processing";

  useEffect(() => {
    if (!restore || restore.kind !== "video") return;
    setTitle(restore.title);
    setScript(restore.body);
    setPieceId(restore.id);
    setJob({
      mode: "preview",
      provider: "lyra",
      status: restore.media ? "completed" : "ready",
      videoUrl: restore.media,
      message: restore.title,
    });
  }, [restore]);

  useEffect(() => {
    if (!busy) return;
    setBar((current) => (current > 0 && current < 100 ? current : 8));
    const timer = window.setInterval(() => {
      setBar((current) => (current >= 92 ? 92 : Math.min(92, current + (current < 40 ? 6 : 2))));
    }, 450);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (busy) return;
    setBar((current) => (current > 0 && current < 100 ? 100 : current));
    const timer = window.setTimeout(() => setBar(0), 700);
    return () => window.clearTimeout(timer);
  }, [busy]);

  async function generate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const visual = images.length > 0 ? ` Imágenes de referencia: ${images.map((image) => image.name).join(", ")}.` : "";
      const brief = ` Formato ${format}. Duración ${duration}. Estilo ${look}. Voz ${voice}. Música ${music}. ${captions}.${detail.trim() ? ` Debe verse: ${detail.trim()}.` : ""}`;
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/ai/video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ title, script: `${script}${brief}${visual}`, idempotencyKey }),
      });
      const data = (await response.json()) as VideoJob & { balance?: number };
      const balance = readReturnedBalance(response, data);
      if (balance !== null) applyServerBalance(balance, readReturnedTransaction(data));
      if (!response.ok) {
        toast.error(data.error ?? "No se pudo preparar el video.");
        return;
      }
      setJob(data);
      setEditing(false);
      const saved = await storeCreation({
        area: "studio",
        kind: "video",
        title,
        body: script,
        media: data.videoUrl ?? null,
      }).catch(() => null);
      if (saved) {
        setPieceId(saved.id);
        onSaved({
          id: saved.id,
          area: "studio",
          kind: "video",
          title,
          body: script,
          media: data.videoUrl ?? null,
          createdAt: saved.createdAt,
        });
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
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
    setScript("");
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
      link.download = `${title.slice(0, 40) || "video-lyra"}.mp4`;
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
    <section className="grid gap-6 rounded-3xl border border-[#E7E2DA] bg-white p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Video</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#1E1E24]">Imagen, voz y detalle</h2>
        <Choice label="Formato" value={format} options={["9:16", "1:1", "16:9"]} onChange={setFormat} />
        <Choice label="Duración" value={duration} options={["15 s", "30 s", "60 s"]} onChange={setDuration} />
        <Choice label="Estilo" value={look} options={["Claro", "Cine", "Producto"]} onChange={setLook} />
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
          <input id="video-images" type="file" accept="image/*" multiple onChange={(event) => addImages(event.target.files)} className="block w-full text-sm text-[#5C5854]" />
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
        <Button type="button" variant="constellation" className="mt-5" disabled={pending || script.trim().length < 12} onClick={() => void generate()}>
          {pending ? "Creando" : "Crear video"}
        </Button>
      </div>
      <div className="flex min-h-[420px] flex-col rounded-2xl bg-[#F7F5F2] p-4">
        {bar > 0 ? (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-[#1E1E24]">
              <p>Creando el video</p>
              <p className="tabular-nums text-[#7C3AED]">{Math.round(bar)}%</p>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#E7E2DA]" role="progressbar" aria-valuenow={Math.round(bar)} aria-valuemin={0} aria-valuemax={100} aria-label="Creación del video">
              <div className="h-full bg-[#7C3AED]" style={{ width: `${bar}%` }} />
            </div>
          </div>
        ) : null}
        <div
          className={`relative mx-auto flex w-full flex-1 flex-col justify-end overflow-hidden rounded-2xl bg-[#1E1E24] bg-cover bg-center p-4 text-white ${frame}`}
          style={images[0] ? { backgroundImage: `linear-gradient(to top, rgba(30,30,36,0.85), rgba(30,30,36,0.1)), url(${images[0].url})` } : undefined}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">{format} · {duration} · {look}</p>
          <p className="mt-2 text-lg font-medium">{title || "Sin título"}</p>
          {detail ? <p className="mt-2 text-sm text-white/80">{detail}</p> : null}
          <p className="mt-3 text-[11px] text-white/60">Voz {voice.toLowerCase()} · {music.toLowerCase()} · {captions.toLowerCase()}</p>
        </div>
        {job ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void downloadVideo()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs text-[#1E1E24]">
                <Download className="h-3.5 w-3.5" aria-hidden />
                Descargar
              </button>
              <button type="button" onClick={() => setEditing((current) => !current)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs text-[#1E1E24]">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                {editing ? "Cerrar" : "Editar"}
              </button>
              <button type="button" onClick={removePiece} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs text-[#9A3B2F]">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Eliminar
              </button>
            </div>
            <p className="text-sm text-[#5C5854]">{job.message ?? job.error}</p>
            {job.videoUrl ? <video controls src={job.videoUrl} className="w-full rounded-xl" /> : null}
            {job.scenes ? (
              <ol className="grid gap-2">
                {job.scenes.map((scene) => (
                  <li key={scene.index} className="rounded-xl bg-white px-3 py-2 text-sm text-[#5C5854]">
                    Plano {scene.index}. {scene.line}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#8A8680]">El encuadre cambia con el formato. El detalle entra en el plano.</p>
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
              "rounded-full border px-3 py-1.5 text-sm",
              value === option ? "border-[#1E1E24] bg-[#1E1E24] text-white" : "border-[#E7E2DA] bg-white text-[#5C5854]",
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
  const [style, setStyle] = useState("Editorial");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [pieceId, setPieceId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!restore || restore.kind !== "image") return;
    setTitle(restore.title);
    setDetail(restore.body);
    setImageUrl(restore.media);
    setPieceId(restore.id);
  }, [restore]);

  async function create() {
    const canvas = document.createElement("canvas");
    const wide = format === "16:9";
    const story = format === "9:16";
    canvas.width = wide ? 1280 : story ? 720 : 1080;
    canvas.height = wide ? 720 : story ? 1280 : 1080;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = style === "Cine" ? "#1E1E24" : style === "Producto" ? "#F5F3FF" : "#F7F5F2";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const photo = reference ? await loadImage(reference) : null;
    if (photo) {
      const scale = Math.max(canvas.width / photo.width, canvas.height / photo.height);
      const w = photo.width * scale;
      const h = photo.height * scale;
      context.drawImage(photo, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      context.fillStyle = style === "Cine" ? "rgba(30,30,36,0.6)" : "rgba(247,245,242,0.72)";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.fillStyle = style === "Cine" ? "#F7F5F2" : "#1E1E24";
    context.font = "600 64px sans-serif";
    wrapText(context, title || "LYRA", 72, 180, canvas.width - 144, 76);
    context.font = "28px sans-serif";
    context.fillStyle = style === "Cine" ? "#C8C2BA" : "#5C5854";
    wrapText(context, detail || "Detalle de la pieza", 72, canvas.height * 0.55, canvas.width - 144, 40);
    const url = canvas.toDataURL("image/png");
    setImageUrl(url);
    const saved = await storeCreation({
      area: "studio",
      kind: "image",
      title: title || "Imagen",
      body: detail,
      media: url,
    }).catch(() => null);
    if (!saved) return;
    setPieceId(saved.id);
    onSaved({
      id: saved.id,
      area: "studio",
      kind: "image",
      title: title || "Imagen",
      body: detail,
      media: url,
      createdAt: saved.createdAt,
    });
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
    <section className="grid gap-6 rounded-3xl border border-[#E7E2DA] bg-white p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Imagen</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#1E1E24]">Una pieza, con lo que importa</h2>
        <Choice label="Formato" value={format} options={["1:1", "9:16", "16:9"]} onChange={setFormat} />
        <Choice label="Estilo" value={style} options={["Editorial", "Cine", "Producto"]} onChange={setStyle} />
        <Field label="Texto principal" id="image-title">
          <input id="image-title" value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
        </Field>
        <Field label="Detalle que debe salir" id="image-detail">
          <textarea id="image-detail" value={detail} onChange={(event) => setDetail(event.target.value)} rows={4} className={`${fieldClass} resize-none`} />
        </Field>
        <Field label="Imagen de referencia" id="image-reference">
          <input id="image-reference" type="file" accept="image/*" onChange={(event) => pickReference(event.target.files)} className="mt-2 block w-full text-sm text-[#5C5854]" />
        </Field>
        {reference ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reference} alt="Referencia" className="mt-3 h-20 w-20 rounded-xl border border-[#E7E2DA] object-cover" />
        ) : null}
        <Button type="button" variant="constellation" className="mt-5" disabled={title.trim().length < 2} onClick={() => void create()}>
          Crear imagen
        </Button>
      </div>
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl bg-[#F7F5F2] p-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={title || "Imagen"} className={`w-full rounded-2xl object-cover ${frame}`} />
        ) : (
          <div
            className={`flex w-full items-end rounded-2xl bg-[#1E1E24] bg-cover bg-center p-5 text-white ${frame}`}
            style={reference ? { backgroundImage: `linear-gradient(to top, rgba(30,30,36,0.8), rgba(30,30,36,0.1)), url(${reference})` } : undefined}
          >
            <p className="text-sm text-white/70">{format} · {style}</p>
          </div>
        )}
        {imageUrl ? (
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={download} className="rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-xs">Descargar</button>
            <button
              type="button"
              onClick={() => {
                if (pieceId) {
                  void discardCreation(pieceId);
                  onRemoved(pieceId);
                }
                setPieceId(null);
                setImageUrl(null);
              }}
              className="rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-xs text-[#9A3B2F]"
            >
              Eliminar
            </button>
          </div>
        ) : null}
      </div>
    </section>
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
  const { applyServerBalance } = useCredits();
  const inFlight = useRef(false);
  const [query, setQuery] = useState("tendencias de academias digitales y redes de agentes");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [note, setNote] = useState("Exa busca mercado y fuentes en vivo.");
  const [pending, setPending] = useState(false);

  async function search() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ query, idempotencyKey }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
        results?: SearchResult[];
        balance?: number;
      };
      const balance = readReturnedBalance(response, data);
      if (balance !== null) applyServerBalance(balance, readReturnedTransaction(data));
      if (!response.ok) {
        toast.error(data.error ?? "No se pudo buscar.");
        return;
      }
      setResults(data.results ?? []);
      setNote(data.message ?? `${data.results?.length ?? 0} resultados`);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-5">
      <h2 className="text-lg tracking-wide text-[#1E1E24]">Búsqueda inteligente</h2>
      <p className="mt-2 text-sm text-[#5C5854]">Exa devuelve páginas y el pasaje más útil de cada una.</p>
      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row"
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
          className="w-full rounded-full border border-border bg-white px-4 py-2 text-sm text-[#1E1E24] outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
        />
        <Button type="submit" variant="constellation" disabled={pending || query.trim().length < 3}>
          {pending ? "Buscando" : "Buscar"}
        </Button>
      </form>
      <p className="mt-4 text-xs text-[#8A8680]">{note}</p>
      <ul className="mt-4 space-y-3">
        {results.map((result) => (
          <li key={result.url} className="rounded-xl border border-lyra-border bg-white p-4">
            <a href={result.url} target="_blank" rel="noreferrer" className="text-sm text-[#1E1E24] hover:text-[#7C3AED]">
              {result.title}
            </a>
            <p className="mt-1 truncate text-xs text-[#8A8680]">{result.url}</p>
            {result.highlight ? (
              <p className="mt-2 text-sm leading-6 text-[#5C5854]">{result.highlight}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
