"use client";

import {
  ArrowUp,
  AudioLines,
  BarChart3,
  BookOpen,
  Clapperboard,
  Download,
  FileText,
  Globe,
  Layers,
  Link2,
  ListChecks,
  Pencil,
  Plus,
  Presentation,
  StickyNote,
  Table2,
  Trash2,
  Waypoints,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { discardCreation, storeCreation } from "@/app/dashboard/studio/actions";
import {
  AudioStage,
  CardsStage,
  InfographicStage,
  MindMapStage,
  QuizStage,
  ReportStage,
  SlideStage,
  TableStage,
  VideoStage,
} from "@/components/notebook/notebook-viewers";
import { useCredits } from "@/components/dashboard/credit-provider";
import { Button } from "@/components/ui/button";
import { studioVoices } from "@/lib/ai/voices";
import type { CreationKind, CreationRecord } from "@/lib/media-pieces";
import {
  parseCards,
  parseDeck,
  parseInfographic,
  parseMindMap,
  parseQuiz,
  parseReport,
  parseTable,
  type DataTable,
  type Deck,
  type FlashDeck,
  type Infographic,
  type MindMap,
  type Report,
  type Slide,
  type StudyQuiz,
} from "@/lib/notebook/artifacts";
import { recordStudioClip } from "@/lib/studio/record-clip";
import { cn } from "@/lib/utils";

type SourceKind = "pdf" | "link" | "note";
type Panel = "sources" | "chat" | "studio";
type NotebookMode =
  | "chat"
  | "summary"
  | "brief"
  | "quiz"
  | "slides"
  | "video"
  | "mindmap"
  | "report"
  | "cards"
  | "infographic"
  | "table";
type StudioId = "audio" | "slides" | "video" | "mindmap" | "report" | "cards" | "quiz" | "infographic" | "table";
type Center = "chat" | StudioId;

type VideoScene = { index: number; line: string };
type VideoJob = {
  message?: string;
  error?: string;
  videoUrl?: string | null;
  scenes?: VideoScene[];
  status?: string;
};

type Source = { id: string; title: string; kind: SourceKind; text: string };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; preview?: boolean };

const studioTools: { id: StudioId; label: string; icon: typeof AudioLines; fresh?: boolean }[] = [
  { id: "audio", label: "Resumen en audio", icon: AudioLines },
  { id: "slides", label: "Presentación", icon: Presentation },
  { id: "video", label: "Resumen en video", icon: Clapperboard },
  { id: "mindmap", label: "Mapa mental", icon: Waypoints },
  { id: "report", label: "Informe", icon: FileText, fresh: true },
  { id: "cards", label: "Tarjetas didácticas", icon: Layers },
  { id: "quiz", label: "Cuestionario", icon: ListChecks },
  { id: "infographic", label: "Infografía", icon: BarChart3 },
  { id: "table", label: "Tabla de datos", icon: Table2 },
];

const kindLabel: Record<SourceKind, string> = { pdf: "PDF", link: "Enlace", note: "Nota" };
const pieceLabel: Record<CreationKind, string> = {
  audio: "Audio",
  video: "Video",
  pdf: "Presentación",
  image: "Imagen",
  mindmap: "Mapa mental",
  report: "Informe",
  cards: "Tarjetas",
  quiz: "Cuestionario",
  infographic: "Infografía",
  table: "Tabla",
};

const prompts: Record<Exclude<StudioId, "audio" | "video"> | "brief", string> = {
  brief: "Escribe el resumen hablado de todas las fuentes.",
  slides: "Arma la presentación con las fuentes cargadas.",
  mindmap: "Organiza las fuentes en un mapa mental.",
  report: "Redacta el informe con las fuentes cargadas.",
  cards: "Prepara tarjetas de estudio con las fuentes.",
  quiz: "Prepara un cuestionario de estudio.",
  infographic: "Resume las fuentes como infografía.",
  table: "Compara las fuentes en una tabla.",
};

export function NotebookWorkspace({ initialPieces = [] }: { initialPieces?: CreationRecord[] }) {
  const { syncBalance } = useCredits();
  const searchRef = useRef<HTMLInputElement>(null);
  const [notebookTitle, setNotebookTitle] = useState("Cuaderno sin título");
  const [sources, setSources] = useState<Source[]>([]);
  const [panel, setPanel] = useState<Panel>("chat");
  const [center, setCenter] = useState<Center>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [deck, setDeck] = useState<Deck | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [videoScript, setVideoScript] = useState("");
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null);
  const [mind, setMind] = useState<MindMap | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [cards, setCards] = useState<FlashDeck | null>(null);
  const [quiz, setQuiz] = useState<StudyQuiz | null>(null);
  const [infographic, setInfographic] = useState<Infographic | null>(null);
  const [table, setTable] = useState<DataTable | null>(null);
  const [pending, setPending] = useState<Center | "chat" | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioScript, setAudioScript] = useState("");
  const [audioNote, setAudioNote] = useState("La narración se genera con las fuentes y se escucha con voz.");
  const [composer, setComposer] = useState<SourceKind | null>(null);
  const [webQuery, setWebQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [bar, setBar] = useState(0);
  const [editAudio, setEditAudio] = useState(false);
  const [editVideo, setEditVideo] = useState(false);
  const [editSlides, setEditSlides] = useState(false);
  const [pieces, setPieces] = useState<CreationRecord[]>(initialPieces);

  useEffect(() => {
    return () => {
      if (audioUrl?.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const busy = pending !== null;

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

  function show(next: Center) {
    setCenter(next);
    setPanel("chat");
  }

  async function consult(mode: NotebookMode, prompt: string) {
    const response = await fetch("/api/ai/notebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        question: prompt,
        sources: sources.map(({ title, kind, text }) => ({ title, kind, text })),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
      mode?: string;
      credits?: number;
    };
    syncBalance(data.credits, response.ok ? "Notebook" : undefined);
    if (!response.ok || !data.text) {
      toast.error(data.error ?? "No se pudo consultar el cuaderno.");
      return null;
    }
    return data;
  }

  function requireSources() {
    if (sources.length > 0) return true;
    toast.error("Agrega una fuente antes de crear.");
    setPanel("sources");
    return false;
  }

  async function ask(prompt = question) {
    if (!requireSources() || !prompt.trim()) return;
    setPending("chat");
    show("chat");
    try {
      const data = await consult("chat", prompt);
      if (!data?.text) return;
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", content: prompt.trim() },
        { id: crypto.randomUUID(), role: "assistant", content: data.text ?? "", preview: data.mode === "preview" },
      ]);
      setQuestion("");
    } finally {
      setPending(null);
    }
  }

  async function remember(kind: CreationKind, title: string, body: string, media?: string | null) {
    const saved = await storeCreation({ area: "notebook", kind, title, body, media }).catch(() => null);
    const id = saved?.id ?? `local-${crypto.randomUUID()}`;
    setPieces((current) => [
      { id, area: "notebook", kind, title, body, media: media ?? null, createdAt: saved?.createdAt ?? new Date().toISOString() },
      ...current.filter((piece) => piece.id !== id),
    ]);
  }

  async function createSlides() {
    if (!requireSources()) return;
    setPending("slides");
    show("slides");
    try {
      const data = await consult("slides", prompts.slides);
      if (!data?.text) return;
      const next = parseDeck(data.text);
      if (!next) {
        toast.error("La presentación no llegó en un formato utilizable.");
        return;
      }
      setDeck(next);
      setSlideIndex(0);
      setEditSlides(false);
      void remember("pdf", next.title, JSON.stringify(next));
    } finally {
      setPending(null);
    }
  }

  async function createVideoSummary() {
    if (!requireSources()) return;
    setPending("video");
    show("video");
    try {
      const data = await consult("video", "Escribe el guion del resumen en video.");
      if (!data?.text) return;
      setVideoScript(data.text);
      const response = await fetch("/api/ai/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: notebookTitle, script: data.text, format: "16:9", styleId: "cine", duration: "15 s" }),
      });
      let job = (await response.json()) as VideoJob;
      if (!response.ok) {
        toast.error(job.error ?? "No se pudo preparar el video.");
        return;
      }
      if (!job.videoUrl) {
        try {
          const clip = await recordStudioClip({
            title: notebookTitle,
            script: data.text,
            format: "16:9",
            styleId: "cine",
            duration: "15 s",
          });
          job = { ...job, status: "completed", videoUrl: clip.url, message: "Video listo." };
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "No se pudo grabar el video.");
        }
      }
      setVideoJob(job);
      void remember("video", notebookTitle, data.text, job.videoUrl ?? null);
    } finally {
      setPending(null);
    }
  }

  async function listen() {
    if (!requireSources()) return;
    setPending("audio");
    show("audio");
    try {
      let script = audioScript.trim();
      if (!script) {
        const data = await consult("brief", prompts.brief);
        if (!data?.text) return;
        script = data.text;
        setAudioScript(script);
      }
      const response = await fetch("/api/ai/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voiceId: studioVoices[0].id }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("audio")) {
        syncBalance(Number(response.headers.get("x-lyra-credits") ?? Number.NaN), "Voz · narración");
        const blob = await response.blob();
        const nextUrl = URL.createObjectURL(blob);
        setAudioUrl((current) => {
          if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
          return nextUrl;
        });
        setAudioNote("Voz de Clara · ElevenLabs");
        void remember("audio", "Resumen en audio", script, await blobToBase64(blob));
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; credits?: number };
      syncBalance(data.credits);
      if (!response.ok) {
        toast.error(data.error ?? "No se pudo preparar el audio.");
        return;
      }
      setAudioUrl(null);
      setAudioNote(data.message ?? "Voz del navegador.");
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(script);
        utterance.lang = "es-MX";
        window.speechSynthesis.speak(utterance);
      }
      void remember("audio", "Resumen en audio", script, null);
    } finally {
      setPending(null);
    }
  }

  async function createStructured(id: Exclude<StudioId, "audio" | "slides" | "video">) {
    if (!requireSources()) return;
    setPending(id);
    show(id);
    try {
      const data = await consult(id, prompts[id]);
      if (!data?.text) return;
      if (id === "mindmap") {
        const next = parseMindMap(data.text);
        if (!next) return toast.error("El mapa no llegó en un formato utilizable.");
        setMind(next);
        void remember("mindmap", next.title, JSON.stringify(next));
      }
      if (id === "report") {
        const next = parseReport(data.text);
        if (!next) return toast.error("El informe no llegó en un formato utilizable.");
        setReport(next);
        void remember("report", next.title, JSON.stringify(next));
      }
      if (id === "cards") {
        const next = parseCards(data.text);
        if (!next) return toast.error("Las tarjetas no llegaron en un formato utilizable.");
        setCards(next);
        void remember("cards", next.title, JSON.stringify(next));
      }
      if (id === "quiz") {
        const next = parseQuiz(data.text);
        if (!next) return toast.error("El cuestionario no llegó en un formato utilizable.");
        setQuiz(next);
        void remember("quiz", next.title, JSON.stringify(next));
      }
      if (id === "infographic") {
        const next = parseInfographic(data.text);
        if (!next) return toast.error("La infografía no llegó en un formato utilizable.");
        setInfographic(next);
        void remember("infographic", next.title, JSON.stringify(next));
      }
      if (id === "table") {
        const next = parseTable(data.text);
        if (!next) return toast.error("La tabla no llegó en un formato utilizable.");
        setTable(next);
        void remember("table", next.title, JSON.stringify(next));
      }
    } finally {
      setPending(null);
    }
  }

  function runStudio(id: StudioId) {
    if (id === "audio") void listen();
    else if (id === "slides") void createSlides();
    else if (id === "video") void createVideoSummary();
    else void createStructured(id);
  }

  function openPiece(piece: CreationRecord) {
    if (piece.kind === "pdf") {
      const next = parseDeck(piece.body);
      if (!next) return;
      setDeck(next);
      setSlideIndex(0);
      show("slides");
      return;
    }
    if (piece.kind === "video") {
      setVideoScript(piece.body);
      setVideoJob({ message: piece.title, videoUrl: piece.media, status: piece.media ? "completed" : "ready" });
      show("video");
      return;
    }
    if (piece.kind === "audio") {
      setAudioScript(piece.body);
      setAudioNote("Audio guardado en tu cuenta.");
      setAudioUrl(piece.media ? `data:audio/mpeg;base64,${piece.media}` : null);
      show("audio");
      return;
    }
    const parsed =
      piece.kind === "mindmap" ? parseMindMap(piece.body)
      : piece.kind === "report" ? parseReport(piece.body)
      : piece.kind === "cards" ? parseCards(piece.body)
      : piece.kind === "quiz" ? parseQuiz(piece.body)
      : piece.kind === "infographic" ? parseInfographic(piece.body)
      : piece.kind === "table" ? parseTable(piece.body)
      : null;
    if (!parsed) return;
    if (piece.kind === "mindmap") {
      setMind(parsed as MindMap);
      show("mindmap");
    }
    if (piece.kind === "report") {
      setReport(parsed as Report);
      show("report");
    }
    if (piece.kind === "cards") {
      setCards(parsed as FlashDeck);
      show("cards");
    }
    if (piece.kind === "quiz") {
      setQuiz(parsed as StudyQuiz);
      show("quiz");
    }
    if (piece.kind === "infographic") {
      setInfographic(parsed as Infographic);
      show("infographic");
    }
    if (piece.kind === "table") {
      setTable(parsed as DataTable);
      show("table");
    }
  }

  function dropPiece(piece: CreationRecord) {
    setPieces((current) => current.filter((item) => item.id !== piece.id));
    if (!piece.id.startsWith("local-")) void discardCreation(piece.id);
  }

  async function searchWeb() {
    const query = webQuery.trim();
    if (query.length < 3) {
      toast.error("Escribe al menos tres caracteres.");
      return;
    }
    setSearching(true);
    try {
      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        results?: { title: string; url: string; highlight: string }[];
        error?: string;
        message?: string;
        credits?: number;
      };
      syncBalance(data.credits, response.ok ? "Búsqueda" : undefined);
      if (!response.ok) {
        toast.error(data.error ?? "No se pudo buscar.");
        return;
      }
      const found = data.results ?? [];
      if (found.length === 0) {
        toast.error(data.message ?? "No hubo resultados para agregar.");
        return;
      }
      setSources((current) => [
        ...found.map((item) => ({
          id: crypto.randomUUID(),
          title: item.title || "Fuente web",
          kind: "link" as const,
          text: `${item.url}\n${item.highlight}`.trim().slice(0, 12000),
        })),
        ...current,
      ]);
      setWebQuery("");
      toast.success(found.length === 1 ? "Se agregó 1 fuente." : `Se agregaron ${found.length} fuentes.`);
    } finally {
      setSearching(false);
    }
  }

  async function addFiles(files: FileList | File[]) {
    const next: Source[] = [];
    for (const file of Array.from(files).slice(0, 6)) {
      next.push({
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        kind: "pdf",
        text: await excerptFromFile(file),
      });
    }
    if (next.length === 0) return;
    setSources((current) => [...next, ...current]);
    toast.success(next.length === 1 ? "Fuente agregada." : `${next.length} fuentes agregadas.`);
  }

  function updateSlide(patch: Partial<Slide>) {
    setDeck((current) => {
      if (!current) return current;
      return {
        ...current,
        slides: current.slides.map((slide, position) => (position === slideIndex ? { ...slide, ...patch } : slide)),
      };
    });
  }

  const ready: Record<StudioId, boolean> = {
    audio: Boolean(audioScript),
    slides: Boolean(deck),
    video: Boolean(videoScript || videoJob),
    mindmap: Boolean(mind),
    report: Boolean(report),
    cards: Boolean(cards),
    quiz: Boolean(quiz),
    infographic: Boolean(infographic),
    table: Boolean(table),
  };

  return (
    <div className="flex h-[calc(100dvh-var(--lyra-tab)-3.75rem)] flex-col bg-background text-foreground md:h-dvh">
      {bar > 0 ? (
        <div className="h-1 bg-[#7C3AED]/15" role="progressbar" aria-valuenow={Math.round(bar)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-[#7C3AED] transition-[width] duration-300" style={{ width: `${bar}%` }} />
        </div>
      ) : (
        <div className="h-1" />
      )}

      <header className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#7C3AED] text-white">
          <BookOpen className="h-4 w-4" aria-hidden />
        </span>
        <input
          aria-label="Nombre del cuaderno"
          value={notebookTitle}
          onChange={(event) => setNotebookTitle(event.target.value.slice(0, 80))}
          className="min-w-0 flex-1 bg-transparent text-lg font-medium tracking-tight text-foreground outline-none placeholder:text-muted"
        />
        <p className="hidden text-xs text-muted sm:block">{sources.length === 1 ? "1 fuente" : `${sources.length} fuentes`}</p>
      </header>

      <div className="grid grid-cols-3 gap-2 px-4 pb-3 lg:hidden">
        {(
          [
            ["sources", "Fuentes"],
            ["chat", "Cuaderno"],
            ["studio", "Studio"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPanel(id)}
            className={cn(
              "h-9 rounded-full text-xs",
              panel === id ? "bg-[#7C3AED] text-white" : "border border-border text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 px-3 pb-3 sm:px-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <section
          className={cn(
            "flex min-h-0 flex-col rounded-3xl border border-border bg-card",
            panel !== "sources" && "hidden lg:flex",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
          }}
        >
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-medium">Fuentes</h2>
            <span className="text-[11px] text-muted">{sources.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 pt-3">
            <button type="button" onClick={() => setComposer("pdf")} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border text-xs hover:border-[#7C3AED]">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Agregar fuentes
            </button>
            <button type="button" onClick={() => setComposer("note")} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border text-xs hover:border-[#7C3AED]">
              <StickyNote className="h-3.5 w-3.5" aria-hidden />
              Crear nota
            </button>
          </div>
          <form
            className="px-4 pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void searchWeb();
            }}
          >
            <label htmlFor="notebook-web" className="text-xs text-muted">
              Buscar fuentes nuevas en la Web
            </label>
            <div className="mt-2 flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-background px-3">
                <Globe className="h-3.5 w-3.5 shrink-0 text-[#06B6D4]" aria-hidden />
                <input
                  id="notebook-web"
                  ref={searchRef}
                  value={webQuery}
                  onChange={(event) => setWebQuery(event.target.value)}
                  placeholder="Fast Research"
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </div>
              <button type="submit" disabled={searching} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#7C3AED] text-white disabled:opacity-40" aria-label="Buscar fuentes">
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </form>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-3", dragging && "bg-[#7C3AED]/10")}>
            {sources.length === 0 ? (
              <div className="grid h-full place-items-center px-4 text-center">
                <div>
                  <p className="text-sm text-foreground">Las fuentes que guardes aparecerán aquí</p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Agrega archivos, sitios web y más. Luego haz preguntas o crea contenido con base en estas fuentes.
                  </p>
                  <button type="button" onClick={() => setComposer("link")} className="mt-3 text-xs text-[#7C3AED] underline-offset-2 hover:underline">
                    agrega una fuente
                  </button>
                </div>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {sources.map((source) => (
                  <li key={source.id} className="group rounded-2xl border border-transparent px-2 py-2 hover:border-border hover:bg-background/70">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[#06B6D4]">{kindLabel[source.kind]}</span>
                      <p className="min-w-0 flex-1 text-sm leading-5 text-foreground">{source.title}</p>
                      <button type="button" aria-label={`Quitar ${source.title}`} className="text-muted opacity-0 hover:text-foreground group-hover:opacity-100" onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 line-clamp-2 pl-8 text-xs leading-5 text-muted">{source.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={cn("flex min-h-0 flex-col rounded-3xl border border-border bg-card", panel !== "chat" && "hidden lg:flex")}>
          {center === "chat" ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6">
                {messages.length === 0 ? (
                  <div className="m-auto w-full max-w-md text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#7C3AED]/15 text-[#7C3AED]">
                      <BookOpen className="h-5 w-5" aria-hidden />
                    </span>
                    <h2 className="mt-5 text-3xl font-semibold tracking-tight">Iniciemos tu cuaderno…</h2>
                    <p className="mt-3 text-sm leading-6 text-muted">
                      Este es tu lienzo para comprender, crear o avanzar. Puedes empezar con una pregunta o agregar tus propias fuentes.
                    </p>
                    <p className="mt-6 text-sm text-foreground">¿Con qué te gustaría que te ayude en este cuaderno?</p>
                    <div className="mt-3 space-y-2">
                      <button type="button" onClick={() => { setPanel("sources"); searchRef.current?.focus(); }} className="w-full rounded-full border border-border px-4 py-2.5 text-sm hover:border-[#7C3AED]">
                        Aprende sobre un tema nuevo
                      </button>
                      <button type="button" onClick={() => setPanel("studio")} className="w-full rounded-full border border-border px-4 py-2.5 text-sm hover:border-[#7C3AED]">
                        Crea algo nuevo
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuestion("Con estas fuentes, ¿cuál es el siguiente paso concreto?")}
                        className="w-full rounded-full border border-border px-4 py-2.5 text-sm hover:border-[#7C3AED]"
                      >
                        Avanza en un proyecto
                      </button>
                    </div>
                  </div>
                ) : (
                  <div aria-live="polite" className="space-y-3">
                    {messages.map((message) => (
                      <p
                        key={message.id}
                        className={cn(
                          "max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6",
                          message.role === "user" ? "ml-auto bg-[#7C3AED]/15" : "border border-border bg-background",
                        )}
                      >
                        {message.preview ? <span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-[#06B6D4]">Vista previa</span> : null}
                        {message.content}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <form
                className="px-4 pb-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask();
                }}
              >
                <div className="flex items-end gap-2 rounded-full border border-border bg-background px-4 py-2 shadow-[0_16px_40px_-28px_rgba(124,58,237,0.8)]">
                  <label htmlFor="notebook-question" className="sr-only">
                    Pregunta sobre las fuentes
                  </label>
                  <textarea
                    id="notebook-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void ask();
                      }
                    }}
                    rows={1}
                    placeholder="Haz una pregunta o crea algo"
                    className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
                  />
                  <span className="hidden pb-1.5 text-[11px] text-muted sm:inline">{sources.length} fuentes</span>
                  <button type="submit" disabled={busy || !question.trim()} aria-label="Enviar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#7C3AED] text-white disabled:opacity-40">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-muted">Lyra Notebook trabaja sobre tus fuentes. Revisa las respuestas.</p>
              </form>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <button type="button" onClick={() => setCenter("chat")} className="text-xs text-[#7C3AED]">
                  Volver al cuaderno
                </button>
                <div className="flex gap-2">
                  {center === "slides" && deck ? (
                    <IconButton label="Descargar PDF" onClick={() => downloadDeckPdf(deck)}>
                      <Download className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                  {center === "video" && videoJob?.videoUrl ? (
                    <IconButton label="Descargar video" onClick={() => void downloadRemote("resumen-lyra.mp4", videoJob.videoUrl ?? "")}>
                      <Download className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                  {center === "audio" && audioUrl ? (
                    <IconButton label="Descargar audio" onClick={() => downloadUrl("resumen-lyra.mp3", audioUrl)}>
                      <Download className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                  {center === "table" && table ? (
                    <IconButton label="Descargar CSV" onClick={() => downloadTable(table)}>
                      <Download className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                  {center === "slides" || center === "video" || center === "audio" ? (
                    <IconButton
                      label="Editar"
                      onClick={() => {
                        if (center === "slides") setEditSlides((current) => !current);
                        if (center === "video") setEditVideo((current) => !current);
                        if (center === "audio") setEditAudio((current) => !current);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {pending === center && !ready[center] ? (
                  <p className="text-sm text-muted">Preparando una pieza con tus fuentes…</p>
                ) : null}
                {center === "slides" && deck ? (
                  <SlideStage deck={deck} index={slideIndex} editing={editSlides} onIndex={setSlideIndex} onChange={updateSlide} onTitle={(title) => setDeck((current) => (current ? { ...current, title } : current))} />
                ) : null}
                {center === "video" && (videoScript || videoJob) ? (
                  <VideoStage script={videoScript} videoUrl={videoJob?.videoUrl} message={videoJob?.message} editing={editVideo} onScript={setVideoScript} />
                ) : null}
                {center === "audio" && audioScript ? (
                  <AudioStage script={audioScript} note={audioNote} audioUrl={audioUrl} editing={editAudio} onScript={setAudioScript} />
                ) : null}
                {center === "mindmap" && mind ? <MindMapStage map={mind} /> : null}
                {center === "report" && report ? <ReportStage report={report} /> : null}
                {center === "cards" && cards ? <CardsStage key={cards.title + cards.cards.length} deck={cards} /> : null}
                {center === "quiz" && quiz ? <QuizStage key={quiz.title + quiz.questions.length} quiz={quiz} /> : null}
                {center === "infographic" && infographic ? <InfographicStage piece={infographic} /> : null}
                {center === "table" && table ? <TableStage table={table} /> : null}
              </div>
            </div>
          )}
        </section>

        <aside className={cn("flex min-h-0 flex-col rounded-3xl border border-border bg-card", panel !== "studio" && "hidden lg:flex")}>
          <div className="px-4 pt-4">
            <h2 className="text-sm font-medium">Studio</h2>
            <p className="mt-3 rounded-2xl border border-[#7C3AED]/30 bg-[#7C3AED]/10 px-3 py-2 text-xs leading-5 text-foreground">
              Cada pieza sale de tus fuentes: audio, presentación, video, mapa, informe, tarjetas, quiz, infografía y tabla.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 px-3 pt-3">
            {studioTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  disabled={busy}
                  onClick={() => runStudio(tool.id)}
                  className={cn(
                    "flex min-h-[4.5rem] flex-col items-start justify-between rounded-2xl border border-border bg-background/50 px-3 py-2.5 text-left text-xs leading-4 hover:border-[#7C3AED] disabled:opacity-50",
                    center === tool.id && "border-[#7C3AED] shadow-[0_0_0_1px_#7C3AED]",
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <Icon className="h-4 w-4 text-[#7C3AED]" aria-hidden />
                    {tool.fresh ? <span className="rounded-full bg-[#7C3AED] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white">Nuevo</span> : null}
                  </span>
                  <span>{pending === tool.id ? "Creando…" : tool.label}</span>
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {pieces.length === 0 ? (
              <p className="px-2 text-center text-xs leading-5 text-muted">
                Los resultados de Studio se guardarán aquí. Luego de agregar fuentes, crea un resumen en audio, una presentación, un mapa mental y más.
              </p>
            ) : (
              <ul className="space-y-2">
                {pieces.map((piece) => (
                  <li key={piece.id} className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2">
                    <button type="button" onClick={() => openPiece(piece)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm">{piece.title}</p>
                      <p className="text-[11px] text-muted">{pieceLabel[piece.kind]}</p>
                    </button>
                    <button type="button" aria-label={`Eliminar ${piece.title}`} className="text-muted hover:text-foreground" onClick={() => dropPiece(piece)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {composer ? (
        <SourceComposer
          initialKind={composer}
          onClose={() => setComposer(null)}
          onCreate={(source) => {
            setSources((current) => [source, ...current]);
            setComposer(null);
            setPanel("sources");
          }}
        />
      ) : null}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:text-foreground">
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function SourceComposer({
  initialKind,
  onClose,
  onCreate,
}: {
  initialKind: SourceKind;
  onClose: () => void;
  onCreate: (source: Source) => void;
}) {
  const titleId = useId();
  const [kind, setKind] = useState<SourceKind>(initialKind);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setTitle((current) => current || file.name.replace(/\.[^.]+$/, ""));
    setKind("pdf");
    setText(await excerptFromFile(file));
  }

  function submit() {
    const nextTitle = title.trim();
    const nextText = text.trim();
    if (!nextTitle || !nextText) {
      toast.error("La fuente necesita título y contenido.");
      return;
    }
    onCreate({ id: crypto.randomUUID(), title: nextTitle, kind, text: nextText.slice(0, 12000) });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-lg rounded-3xl border border-border bg-card p-5 text-foreground">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-medium">
            {kind === "note" ? "Crear nota" : "Agregar fuente"}
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              ["note", "Nota", StickyNote],
              ["link", "Enlace", Link2],
              ["pdf", "Archivo", FileText],
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setKind(id)} className={cn("rounded-2xl border px-3 py-3 text-left text-xs", kind === id ? "border-[#7C3AED] text-foreground" : "border-border text-muted")}>
              <Icon className="mb-2 h-4 w-4 text-[#06B6D4]" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-xs text-muted" htmlFor="source-title">Título</label>
        <input id="source-title" value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
        {kind === "pdf" ? (
          <label className="mt-4 block text-xs text-muted">
            Documento
            <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="mt-1 block w-full text-sm" onChange={(event) => void onFile(event.target.files?.[0])} />
            {fileName ? <span className="mt-1 block text-muted">{fileName}</span> : null}
          </label>
        ) : null}
        <label className="mt-4 block text-xs text-muted" htmlFor="source-body">{kind === "link" ? "URL y nota" : "Contenido"}</label>
        <textarea id="source-body" value={text} onChange={(event) => setText(event.target.value)} rows={5} placeholder={kind === "link" ? "https://…" : "Escribe o pega el material"} className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none placeholder:text-muted focus:border-[#7C3AED]" />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]" onClick={submit}>Agregar</Button>
        </div>
      </div>
    </div>
  );
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function downloadUrl(filename: string, href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

async function downloadRemote(filename: string, href: string) {
  try {
    const response = await fetch(href);
    if (!response.ok) throw new Error("sin archivo");
    const blob = await response.blob();
    const local = URL.createObjectURL(blob);
    downloadUrl(filename, local);
    URL.revokeObjectURL(local);
  } catch {
    downloadUrl(filename, href);
  }
}

function downloadTable(table: DataTable) {
  const lines = [table.columns, ...table.rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  downloadUrl(`${table.title.slice(0, 40) || "tabla"}.csv`, href);
  URL.revokeObjectURL(href);
}

function pdfText(value: string) {
  const extra: Record<string, number> = {
    á: 0xe1, é: 0xe9, í: 0xed, ó: 0xf3, ú: 0xfa,
    Á: 0xc1, É: 0xc9, Í: 0xcd, Ó: 0xd3, Ú: 0xda,
    ñ: 0xf1, Ñ: 0xd1, ü: 0xfc, Ü: 0xdc, "¿": 0xbf, "¡": 0xa1,
  };
  let out = "";
  for (const char of value.slice(0, 90)) {
    const code = extra[char] ?? char.charCodeAt(0);
    const byte = code > 0 && code < 256 && (code < 128 || extra[char]) ? code : 63;
    if (byte === 40 || byte === 41 || byte === 92) out += `\\${String.fromCharCode(byte)}`;
    else out += String.fromCharCode(byte);
  }
  return out;
}

function downloadDeckPdf(deck: Deck) {
  const kids: string[] = [];
  const objects: string[] = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "",
    "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  deck.slides.forEach((slide, index) => {
    const pageNum = 4 + index * 2;
    const contentNum = pageNum + 1;
    kids.push(`${pageNum} 0 R`);
    const lines = [deck.title, slide.kicker, slide.title, ...slide.points, slide.note].filter(Boolean);
    const stream = lines
      .map((line, lineIndex) => `BT /F1 ${lineIndex === 2 ? 18 : 12} Tf 48 ${740 - lineIndex * 26} Td (${pdfText(line)}) Tj ET`)
      .join("\n");
    objects.push(`${pageNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources << /Font << /F1 3 0 R >> >> >> endobj`);
    objects.push(`${contentNum} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`);
  });
  objects[1] = `2 0 obj << /Type /Pages /Count ${deck.slides.length} /Kids [${kids.join(" ")}] >> endobj`;
  const header = "%PDF-1.4\n";
  let cursor = header.length;
  const offsets = [0];
  const body = objects
    .map((object) => {
      offsets.push(cursor);
      const piece = `${object}\n`;
      cursor += piece.length;
      return piece;
    })
    .join("");
  const xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`;
  const blob = new Blob([header + body + xref], { type: "application/pdf" });
  const href = URL.createObjectURL(blob);
  downloadUrl(`${deck.title.slice(0, 40) || "presentacion"}.pdf`, href);
  URL.revokeObjectURL(href);
}

async function excerptFromFile(file: File) {
  if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
    return (await file.text()).slice(0, 12000);
  }
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer());
  const pieces = raw.match(/\(([^)\\]{12,240})\)/g) ?? [];
  const excerpt = pieces
    .map((piece) => piece.slice(1, -1))
    .join(" ")
    .replace(/\\[nrt]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return excerpt.slice(0, 12000) || `Documento ${file.name} (${Math.ceil(file.size / 1024)} KB). El PDF no traía texto embebido; escribe aquí el pasaje que quieres consultar.`;
}
