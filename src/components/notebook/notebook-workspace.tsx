"use client";

import { ChevronLeft, ChevronRight, Download, FileText, Link2, Pencil, Plus, StickyNote, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { discardCreation, storeCreation } from "@/app/dashboard/creations/actions";
import { CreationHistory } from "@/components/creations/creation-history";
import { readReturnedBalance, readReturnedTransaction, useCredits } from "@/components/dashboard/credit-provider";
import { Button } from "@/components/ui/button";
import type { CreationRecord } from "@/lib/creations";
import { studioVoices } from "@/lib/ai/voices";
import { cn } from "@/lib/utils";

type SourceKind = "pdf" | "link" | "note";
type Panel = "sources" | "chat" | "studio";
type NotebookMode = "chat" | "summary" | "quiz" | "slides" | "video";

type Slide = {
  kicker: string;
  title: string;
  points: string[];
  note: string;
};

type Deck = {
  title: string;
  slides: Slide[];
};

type VideoScene = { index: number; line: string };

type VideoJob = {
  mode?: string;
  status?: string;
  message?: string;
  error?: string;
  jobId?: string;
  provider?: string;
  videoUrl?: string | null;
  scenes?: VideoScene[];
};

type Source = {
  id: string;
  title: string;
  kind: SourceKind;
  text: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  preview?: boolean;
};

const initialSources: Source[] = [
  {
    id: "src-guia",
    title: "Guía breve de la red",
    kind: "note",
    text: "Las membresías de LYRA son Started, Pro, Founder y Corporate. Started entra con 99 dólares y 150 créditos, y al mes siguiente recarga 25 créditos. Pro entra con 499 dólares y 1,500 créditos, cobra Órbita de 4 niveles y, con la promoción por tiempo limitado, recarga 50 créditos al mes de por vida en lugar de 100. Founder entra con 1,000 dólares y 2,000 créditos, cobra el máximo de la red desde el día 0 y paga una mensualidad de 29 dólares que incluye 40 créditos. Corporate entra con 5,000 dólares y recibe 10,000 créditos, de los cuales 5,000 sirven para activar cuentas de su equipo, y es libre de recompra. Quien tiene 3 directos activos queda exento de recompra. El Plan Constelación paga Chispa por inscripción directa (10, 20, 30 o 40% según el paquete), Órbita residual de 6 niveles, Bono Constelación por rango, Espejo para Founder y Corporate, y Fondo Galaxia; el pago total nunca pasa del 55% de los puntos. Un crédito equivale a 1 dólar. La cuenta administradora es Corporate.",
  },
  {
    id: "src-academia",
    title: "Academia · prospección",
    kind: "link",
    text: "https://lyra.app/academia/prospeccion — El brief para el Agente Prospector debe incluir el contexto del contacto, la duda principal y el siguiente paso. No se prometen ingresos.",
  },
];

const kindLabel: Record<SourceKind, string> = {
  pdf: "PDF",
  link: "Enlace",
  note: "Nota",
};

export function NotebookWorkspace({ initialPieces = [] }: { initialPieces?: CreationRecord[] }) {
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [panel, setPanel] = useState<Panel>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [summary, setSummary] = useState("");
  const [quiz, setQuiz] = useState("");
  const [deck, setDeck] = useState<Deck | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [videoScript, setVideoScript] = useState("");
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null);
  const [pending, setPending] = useState<NotebookMode | "audio" | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioScript, setAudioScript] = useState("");
  const [audioNote, setAudioNote] = useState("El reproductor queda listo para la voz de ElevenLabs.");
  const [composerOpen, setComposerOpen] = useState(false);
  const [bar, setBar] = useState(0);
  const [barLabel, setBarLabel] = useState("");
  const [editAudio, setEditAudio] = useState(false);
  const [editVideo, setEditVideo] = useState(false);
  const [editSlides, setEditSlides] = useState(false);
  const [pieces, setPieces] = useState<CreationRecord[]>(initialPieces);
  const [pieceIds, setPieceIds] = useState<{ audio?: string; video?: string; pdf?: string }>({});
  const { applyServerBalance } = useCredits();
  const inFlight = useRef(false);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const videoBusy = videoJob?.status === "processing";
  const busy = pending !== null || videoBusy;

  useEffect(() => {
    if (!busy) return;
    const labels: Record<string, string> = {
      chat: "Consultando las fuentes",
      summary: "Redactando el resumen",
      quiz: "Armando el cuestionario",
      slides: "Diseñando el PDF",
      video: "Escribiendo el guion del video",
      audio: "Generando el audio",
    };
    setBarLabel(videoBusy && pending !== "video" ? "Montando el video" : labels[pending ?? "video"]);
    setBar((current) => (current > 0 && current < 100 ? current : 8));
    const timer = window.setInterval(() => {
      setBar((current) => {
        if (current >= 92) return 92;
        const step = current < 35 ? 7 : current < 70 ? 3 : 1;
        return Math.min(92, current + step);
      });
    }, 450);
    return () => window.clearInterval(timer);
  }, [busy, pending, videoBusy]);

  useEffect(() => {
    if (busy) return;
    setBar((current) => (current > 0 && current < 100 ? 100 : current));
    const timer = window.setTimeout(() => setBar(0), 700);
    return () => window.clearTimeout(timer);
  }, [busy]);

  async function consult(mode: NotebookMode, prompt: string) {
    const idempotencyKey = crypto.randomUUID();
    const response = await fetch("/api/ai/notebook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({
        mode,
        question: prompt,
        idempotencyKey,
        sources: sources.map(({ title, kind, text }) => ({ title, kind, text })),
      }),
    });
    const data = (await response.json()) as { text?: string; error?: string; mode?: string; balance?: number };
    const balance = readReturnedBalance(response, data);
    if (balance !== null) applyServerBalance(balance, readReturnedTransaction(data));
    if (!response.ok || !data.text) {
      toast.error(data.error ?? "No se pudo consultar el notebook.");
      return null;
    }
    return data;
  }

  async function ask(mode: NotebookMode, prompt = question) {
    if (sources.length === 0) {
      toast.error("Agrega una fuente antes de consultar.");
      return;
    }
    if (mode === "chat" && !prompt.trim()) return;
    if (inFlight.current) return;
    inFlight.current = true;

    setPending(mode);
    try {
      const data = await consult(mode, prompt);
      if (!data?.text) return;

      if (mode === "summary") setSummary(data.text);
      if (mode === "quiz") setQuiz(data.text);
      if (mode === "chat") {
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "user", content: prompt.trim() },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.text ?? "",
            preview: data.mode === "preview",
          },
        ]);
        setQuestion("");
      }
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  async function createSlides() {
    if (sources.length === 0) {
      toast.error("Agrega una fuente antes de armar las diapositivas.");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setPending("slides");
    try {
      const data = await consult("slides", "Arma la presentación con las fuentes cargadas.");
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
      inFlight.current = false;
      setPending(null);
    }
  }

  async function createVideoSummary() {
    if (sources.length === 0) {
      toast.error("Agrega una fuente antes del resumen en video.");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setPending("video");
    try {
      const data = await consult("video", "Escribe el guion del resumen en video.");
      if (!data?.text) return;
      setVideoScript(data.text);
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/ai/video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          title: sources[0]?.title ?? "Resumen",
          script: data.text,
          idempotencyKey,
        }),
      });
      const job = (await response.json()) as VideoJob & { balance?: number };
      const balance = readReturnedBalance(response, job);
      if (balance !== null) applyServerBalance(balance, readReturnedTransaction(job));
      if (!response.ok) {
        toast.error(job.error ?? "No se pudo preparar el video.");
        return;
      }
      setVideoJob(job);
      void remember("video", sources[0]?.title ?? "Resumen", data.text, job.videoUrl ?? null);
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  async function listen() {
    const script = audioScript.trim() || summary || sources.map((source) => source.text).join(" ").slice(0, 700);
    setAudioScript(script);
    if (!script) {
      toast.error("Genera un resumen antes de escucharlo.");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;

    setPending("audio");
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/ai/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ text: script, voiceId: studioVoices[0].id, idempotencyKey }),
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("audio")) {
        const balance = readReturnedBalance(response, null);
        if (balance !== null) applyServerBalance(balance);
        const blob = await response.blob();
        const nextUrl = URL.createObjectURL(blob);
        setAudioUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
        setAudioNote("Audio de ElevenLabs · Clara");
        const media = await blobToBase64(blob);
        void remember("audio", "Resumen en audio", script, media);
        return;
      }

      const data = (await response.json()) as { error?: string; message?: string; mode?: string; balance?: number };
      const balance = readReturnedBalance(response, data);
      if (balance !== null) applyServerBalance(balance, readReturnedTransaction(data));
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
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  async function remember(kind: CreationRecord["kind"], title: string, body: string, media?: string | null) {
    const saved = await storeCreation({ area: "notebook", kind, title, body, media }).catch(() => null);
    if (!saved) return;
    setPieceIds((current) => ({ ...current, [kind]: saved.id }));
    setPieces((current) => [
      { id: saved.id, area: "notebook", kind, title, body, media: media ?? null, createdAt: saved.createdAt },
      ...current,
    ]);
  }

  function clearAudio() {
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAudioScript("");
    setAudioNote("El reproductor queda listo para la voz de ElevenLabs.");
    setEditAudio(false);
    if (pieceIds.audio) void discardCreation(pieceIds.audio);
    setPieces((current) => current.filter((piece) => piece.id !== pieceIds.audio));
    setPieceIds((current) => ({ ...current, audio: undefined }));
  }

  function openPiece(piece: CreationRecord) {
    if (piece.kind === "pdf") {
      const next = parseDeck(piece.body);
      if (!next) return;
      setDeck(next);
      setSlideIndex(0);
      setPieceIds((current) => ({ ...current, pdf: piece.id }));
      return;
    }
    if (piece.kind === "video") {
      setVideoScript(piece.body);
      setVideoJob({ message: piece.title, videoUrl: piece.media, status: piece.media ? "completed" : "ready" });
      setPieceIds((current) => ({ ...current, video: piece.id }));
      return;
    }
    if (piece.media) {
      setAudioUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return `data:audio/mpeg;base64,${piece.media}`;
      });
      setAudioScript(piece.body);
      setAudioNote("Audio guardado en tu cuenta.");
      setPieceIds((current) => ({ ...current, audio: piece.id }));
    }
  }

  function dropPiece(piece: CreationRecord) {
    setPieces((current) => current.filter((item) => item.id !== piece.id));
    void discardCreation(piece.id);
    if (piece.kind === "audio" || piece.kind === "video" || piece.kind === "pdf") {
      const kind = piece.kind;
      setPieceIds((current) => ({ ...current, [kind]: current[kind] === piece.id ? undefined : current[kind] }));
    }
  }

  function updateSlide(patch: Partial<Slide>) {
    setDeck((current) => {
      if (!current) return current;
      const slides = current.slides.map((slide, position) => (position === slideIndex ? { ...slide, ...patch } : slide));
      return { ...current, slides };
    });
  }

  return (
    <div className="space-y-4">
      {bar > 0 ? <CreationBar label={barLabel} value={bar} /> : null}
      <div className="grid grid-cols-3 gap-2 lg:hidden">
        {(
          [
            ["sources", "Fuentes"],
            ["chat", "Chat"],
            ["studio", "Estudio"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={panel === id ? "default" : "outline"}
            className="w-full"
            onClick={() => setPanel(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px] lg:items-start">
        <section className={cn("space-y-3", panel !== "sources" && "hidden lg:block")}>
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Fuentes</h2>
            <Button type="button" size="sm" variant="outline" onClick={() => setComposerOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Cargar
            </Button>
          </div>
          <ul className="space-y-2">
            {sources.map((source) => (
              <li
                key={source.id}
                className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-[#1E1E24]">{source.title}</p>
                  <button
                    type="button"
                    aria-label={`Quitar ${source.title}`}
                    className="text-[#8A8680] hover:text-[#1E1E24]"
                    onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-lyra-cyan">
                  {kindLabel[source.kind]}
                </p>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#8A8680]">{source.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className={cn(
            "flex min-h-[24rem] flex-col rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright sm:min-h-[540px]",
            panel !== "chat" && "hidden lg:flex",
          )}
        >
          <header className="border-b border-lyra-border px-5 py-4">
            <h2 className="text-lg tracking-wide text-[#1E1E24]">Investigación</h2>
            <p className="mt-1 text-xs text-[#8A8680]">
              Gemini 2.5 Flash razona sobre {sources.length} fuentes cargadas.
            </p>
          </header>
          <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
            {messages.length === 0 ? (
              <p className="text-sm leading-6 text-[#8A8680]">
                Pregunta por un rango, un paso de prospección o una contradicción entre las fuentes.
              </p>
            ) : (
              messages.map((message) => (
                <p
                  key={message.id}
                  className={cn(
                    "max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6",
                    message.role === "user"
                      ? "ml-auto bg-lyra-violet/20 text-[#1E1E24]"
                      : "border border-lyra-border bg-[#F4F1EC] text-[#1E1E24]",
                  )}
                >
                  {message.preview ? (
                    <span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-lyra-cyan">
                      Vista previa
                    </span>
                  ) : null}
                  {message.content}
                </p>
              ))
            )}
          </div>
          <form
            className="border-t border-lyra-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void ask("chat");
            }}
          >
            <label htmlFor="notebook-question" className="sr-only">
              Pregunta sobre las fuentes
            </label>
            <textarea
              id="notebook-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              placeholder="¿Qué dice el material sobre el plan Pro?"
              className="w-full resize-none rounded-xl border border-border bg-white px-3 py-3 text-sm text-[#1E1E24] outline-none placeholder:text-[#8A8680] focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
            <div className="mt-3 flex justify-end">
              <Button type="submit" variant="constellation" disabled={pending !== null || !question.trim()}>
                {pending === "chat" ? "Consultando" : "Consultar"}
              </Button>
            </div>
          </form>
        </section>

        <aside className={cn("space-y-3", panel !== "studio" && "hidden lg:block")}>
          <article className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-4">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Resumen</h2>
            <p className="mt-3 min-h-16 whitespace-pre-wrap text-sm leading-6 text-[#5C5854]">
              {summary || "Todavía no hay un resumen ejecutivo."}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              disabled={pending !== null}
              onClick={() => void ask("summary", "Resume las fuentes cargadas.")}
            >
              {pending === "summary" ? "Redactando" : "Generar resumen"}
            </Button>
          </article>

          <article className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-4">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Audio</h2>
            <p className="mt-3 text-xs leading-5 text-[#5C5854]">{audioNote}</p>
            {audioUrl ? <audio controls src={audioUrl} className="mt-3 w-full" /> : null}
            {editAudio ? (
              <textarea
                value={audioScript}
                onChange={(event) => setAudioScript(event.target.value)}
                rows={4}
                aria-label="Guion del audio"
                className="mt-3 w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm text-[#1E1E24] outline-none focus:border-purple-500"
              />
            ) : null}
            {audioUrl || audioScript ? (
              <FileActions
                downloadLabel="Descargar audio"
                onDownload={() => {
                  if (!audioUrl) {
                    toast.error("El audio todavía no está en un archivo descargable.");
                    return;
                  }
                  downloadUrl("resumen-lyra.mp3", audioUrl);
                }}
                editing={editAudio}
                onEdit={() => setEditAudio((current) => !current)}
                onDelete={clearAudio}
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-4"
              disabled={pending !== null}
              onClick={() => void listen()}
            >
              {pending === "audio" ? "Preparando" : "Escuchar resumen"}
            </Button>
          </article>

          <article className="rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-4">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Cuestionario</h2>
            <p className="mt-3 min-h-16 whitespace-pre-wrap text-sm leading-6 text-[#5C5854]">
              {quiz || "Genera preguntas a partir de las fuentes."}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              disabled={pending !== null}
              onClick={() => void ask("quiz", "Prepara un cuestionario de estudio.")}
            >
              {pending === "quiz" ? "Armando" : "Crear cuestionario"}
            </Button>
          </article>

          <article className="rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur-md">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Diapositivas</h2>
            <p className="mt-3 text-sm leading-6 text-[#5C5854]">
              {deck ? `${deck.slides.length} láminas listas para presentar.` : "Una presentación sobria a partir de las fuentes."}
            </p>
            {deck ? (
              <FileActions
                downloadLabel="Descargar PDF"
                onDownload={() => downloadDeckPdf(deck)}
                editing={editSlides}
                onEdit={() => setEditSlides((current) => !current)}
                onDelete={() => {
                  setDeck(null);
                  setEditSlides(false);
                  setSlideIndex(0);
                  if (pieceIds.pdf) void dropPiece({ id: pieceIds.pdf, area: "notebook", kind: "pdf", title: "", body: "", media: null, createdAt: "" });
                }}
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              disabled={pending !== null}
              onClick={() => void createSlides()}
            >
              {pending === "slides" ? "Diseñando" : "Crear diapositivas"}
            </Button>
          </article>

          <article className="rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur-md">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8A8680]">Resumen en video</h2>
            <p className="mt-3 text-sm leading-6 text-[#5C5854]">
              {videoJob?.message || videoScript || "Un guion corto y el video del resumen."}
            </p>
            {videoJob || videoScript ? (
              <FileActions
                downloadLabel="Descargar video"
                onDownload={() => {
                  if (!videoJob?.videoUrl) {
                    toast.error("El video todavía no tiene archivo. Puedes editar el guion.");
                    return;
                  }
                  void downloadRemote("resumen-lyra.mp4", videoJob.videoUrl);
                }}
                editing={editVideo}
                onEdit={() => setEditVideo((current) => !current)}
                onDelete={() => {
                  setVideoJob(null);
                  setVideoScript("");
                  setEditVideo(false);
                  if (pieceIds.video) void dropPiece({ id: pieceIds.video, area: "notebook", kind: "video", title: "", body: "", media: null, createdAt: "" });
                }}
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-4"
              disabled={pending !== null}
              onClick={() => void createVideoSummary()}
            >
              {pending === "video" ? "Preparando" : "Crear video"}
            </Button>
          </article>
        </aside>
      </div>

      {deck ? (
        <SlideStage
          deck={deck}
          index={slideIndex}
          editing={editSlides}
          onIndex={setSlideIndex}
          onChange={updateSlide}
          onTitle={(title) => setDeck((current) => (current ? { ...current, title } : current))}
        />
      ) : null}
      {videoJob ? (
        <VideoStage
          script={videoScript}
          job={videoJob}
          editing={editVideo}
          onScript={setVideoScript}
        />
      ) : null}

      {composerOpen ? (
        <SourceComposer
          onClose={() => setComposerOpen(false)}
          onCreate={(source) => {
            setSources((current) => [source, ...current]);
            setComposerOpen(false);
            setPanel("sources");
          }}
        />
      ) : null}
      <CreationHistory pieces={pieces} onOpen={openPiece} onDelete={(piece) => void dropPiece(piece)} />
    </div>
  );
}

function SourceComposer({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (source: Source) => void;
}) {
  const titleId = useId();
  const [kind, setKind] = useState<SourceKind>("note");
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
    setText(await excerptFromFile(file));
  }

  function submit() {
    const nextTitle = title.trim();
    const nextText = text.trim();
    if (!nextTitle || !nextText) {
      toast.error("La fuente necesita título y contenido.");
      return;
    }
    onCreate({
      id: crypto.randomUUID(),
      title: nextTitle,
      kind,
      text: nextText.slice(0, 12000),
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-border bg-surface/80 backdrop-blur-md transition-colors hover:border-border-bright p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg tracking-wide text-[#1E1E24]">
            Cargar fuente
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-[#5C5854]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              ["note", "Nota", StickyNote],
              ["link", "Enlace", Link2],
              ["pdf", "PDF", FileText],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-xs",
                kind === id
                  ? "border-lyra-violet/60 text-[#1E1E24]"
                  : "border-lyra-border text-[#5C5854]",
              )}
            >
              <Icon className="mb-2 h-4 w-4 text-lyra-cyan" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-xs text-[#8A8680]" htmlFor="source-title">
          Título
        </label>
        <input
          id="source-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-[#1E1E24] outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
        />
        {kind === "pdf" ? (
          <label className="mt-4 block text-xs text-[#8A8680]">
            Documento
            <input
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              className="mt-1 block w-full text-sm text-[#5C5854]"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            {fileName ? <span className="mt-1 block text-[#5C5854]">{fileName}</span> : null}
          </label>
        ) : null}
        <label className="mt-4 block text-xs text-[#8A8680]" htmlFor="source-body">
          {kind === "link" ? "URL y nota" : "Contenido"}
        </label>
        <textarea
          id="source-body"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          placeholder={kind === "link" ? "https://…" : "Pega el pasaje que quieres investigar"}
          className="mt-1 w-full resize-none rounded-xl border border-border bg-white px-3 py-3 text-sm text-[#1E1E24] outline-none placeholder:text-[#8A8680] focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="constellation" onClick={submit}>
            Agregar
          </Button>
        </div>
      </div>
    </div>
  );
}

function parseDeck(raw: string): Deck | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const value = JSON.parse(candidate.slice(start, end + 1)) as { title?: unknown; slides?: unknown };
    if (!Array.isArray(value.slides)) return null;
    const slides = value.slides
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const slide = item as Record<string, unknown>;
        const title = typeof slide.title === "string" ? slide.title.trim() : "";
        if (!title) return null;
        const points = Array.isArray(slide.points)
          ? slide.points.filter((point): point is string => typeof point === "string" && point.trim().length > 0).slice(0, 3)
          : [];
        return {
          kicker: typeof slide.kicker === "string" ? slide.kicker.trim().slice(0, 40) : "",
          title: title.slice(0, 120),
          points: points.map((point) => point.trim().slice(0, 160)),
          note: typeof slide.note === "string" ? slide.note.trim().slice(0, 220) : "",
        };
      })
      .filter((slide): slide is Slide => slide !== null)
      .slice(0, 6);
    if (slides.length === 0) return null;
    return {
      title: typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 120) : "Presentación",
      slides,
    };
  } catch {
    return null;
  }
}

function CreationBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#E7E2DA] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm text-[#1E1E24]">
        <p>{label}</p>
        <p className="tabular-nums text-[#7C3AED]">{Math.round(value)}%</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EDE9FE]" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-[#7C3AED] transition-[width] duration-300" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function FileActions({
  downloadLabel,
  onDownload,
  editing,
  onEdit,
  onDelete,
}: {
  downloadLabel: string;
  onDownload: () => void;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs text-[#1E1E24]">
        <Download className="h-3.5 w-3.5" aria-hidden />
        {downloadLabel}
      </button>
      <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs text-[#1E1E24]">
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        {editing ? "Cerrar edición" : "Editar"}
      </button>
      <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs text-[#9A3B2F]">
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Eliminar
      </button>
    </div>
  );
}

function SlideStage({
  deck,
  index,
  editing,
  onIndex,
  onChange,
  onTitle,
}: {
  deck: Deck;
  index: number;
  editing: boolean;
  onIndex: (index: number) => void;
  onChange: (patch: Partial<Slide>) => void;
  onTitle: (title: string) => void;
}) {
  const slide = deck.slides[index] ?? deck.slides[0];
  const last = deck.slides.length - 1;

  return (
    <section className="overflow-hidden rounded-3xl bg-[#16141C] text-white">
      <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <p className="text-xs uppercase tracking-[0.22em] text-[#C4B5FD]">{deck.title}</p>
        <p className="text-xs tabular-nums text-white/60">
          {String(index + 1).padStart(2, "0")} / {String(deck.slides.length).padStart(2, "0")}
        </p>
      </div>
      <div className="grid min-h-[340px] gap-8 px-6 py-8 sm:px-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)] lg:items-end">
        <div>
          {slide.kicker ? <p className="text-sm text-[#C4B5FD]">{slide.kicker}</p> : null}
          <h3 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">{slide.title}</h3>
        </div>
        <div>
          {slide.points.length > 0 ? (
            <ul className="space-y-3">
              {slide.points.map((point) => (
                <li key={point} className="border-l-2 border-[#7C3AED] pl-4 text-base leading-7 text-white/90">
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
          {slide.note ? <p className="mt-6 text-sm leading-6 text-white/55">{slide.note}</p> : null}
          {editing ? (
            <div className="mt-6 space-y-2 text-[#1E1E24]">
              <input value={deck.title} onChange={(event) => onTitle(event.target.value)} aria-label="Título del PDF" className="w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm" />
              <input value={slide.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Título de la lámina" className="w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm" />
              <textarea value={slide.points.join("\n")} onChange={(event) => onChange({ points: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3) })} rows={3} aria-label="Puntos de la lámina" className="w-full resize-none rounded-lg border border-white/20 bg-white px-3 py-2 text-sm" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
        <div className="flex gap-1.5">
          {deck.slides.map((item, dot) => (
            <button
              key={`${item.title}-${dot}`}
              type="button"
              aria-label={`Ir a la diapositiva ${dot + 1}`}
              onClick={() => onIndex(dot)}
              className={cn("h-1.5 rounded-full", dot === index ? "w-6 bg-[#7C3AED]" : "w-1.5 bg-white/30")}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Diapositiva anterior"
            disabled={index === 0}
            onClick={() => onIndex(Math.max(0, index - 1))}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Diapositiva siguiente"
            disabled={index === last}
            onClick={() => onIndex(Math.min(last, index + 1))}
            className="grid h-9 w-9 place-items-center rounded-lg bg-[#7C3AED] disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function VideoStage({
  script,
  job,
  editing,
  onScript,
}: {
  script: string;
  job: VideoJob;
  editing: boolean;
  onScript: (script: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-border bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight text-[#1E1E24]">Resumen en video</h2>
      <p className="mt-2 text-sm leading-6 text-[#5C5854]">{job.message ?? job.error}</p>
      {editing ? (
        <textarea value={script} onChange={(event) => onScript(event.target.value)} rows={5} aria-label="Guion del video" className="mt-4 w-full resize-none rounded-xl border border-[#E7E2DA] px-3 py-2 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]" />
      ) : script ? (
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#1E1E24]">{script}</p>
      ) : null}
      {job.videoUrl ? <video controls src={job.videoUrl} className="mt-5 w-full rounded-2xl bg-black" /> : null}
      {job.scenes ? (
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {job.scenes.map((scene) => (
            <li key={scene.index} className="rounded-2xl bg-[#F4F1EC] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7C3AED]">Plano {scene.index}</p>
              <p className="mt-2 text-sm leading-6 text-[#1E1E24]">{scene.line}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
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
    objects.push(
      `${pageNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources << /Font << /F1 3 0 R >> >> >> endobj`,
    );
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

  return (
    excerpt.slice(0, 12000) ||
    `Documento ${file.name} (${Math.ceil(file.size / 1024)} KB). El PDF no traía texto embebido; escribe aquí el pasaje que quieres consultar.`
  );
}
