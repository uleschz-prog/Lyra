"use client";

import {
  ArrowUp,
  Bot,
  Brain,
  CalendarClock,
  ChevronLeft,
  Clapperboard,
  EllipsisVertical,
  FileText,
  Globe,
  Link2,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plug,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteVegaChat,
  listVegaChats,
  myCredits,
  openVegaChat,
  renameVegaChat,
  type VegaAttachmentChip,
  type VegaChatMessage,
  type VegaChatSummary,
} from "@/app/dashboard/super-agent/actions";
import { useCredits } from "@/components/dashboard/credit-provider";
import { ActionCard } from "@/components/vega/action-card";
import { CreditRing } from "@/components/vega/credit-ring";
import { ConnectionsPanel } from "@/components/vega/connections-panel";
import { AutonomyPanel } from "@/components/vega/autonomy-panel";
import { MemoryPanel } from "@/components/vega/memory-panel";
import { ProfilePanel } from "@/components/vega/profile-panel";
import { TasksPanel } from "@/components/vega/tasks-panel";
import { VegaGreeting, VegaMark } from "@/components/vega/vega-mark";
import { RichText } from "@/components/vega/rich-text";
import { attachmentAccept, attachmentLimits } from "@/lib/vega/attachment-limits";
import { isUserToolkit, toolkitLabels } from "@/lib/vega/apps";
import type { VegaActionView, VegaEvent, VegaMood } from "@/lib/vega/events";
import { cn } from "@/lib/utils";

type ChatItem = VegaChatMessage & { status?: string };
type DraftFile = { id: string; name: string; mime: string; text?: string; data?: string };
type DraftLink = { id: string; url: string };

const textFile = /^(text\/|application\/json)/;

function fileToPayload(file: File) {
  const name = file.name || "archivo";
  const mime = file.type || "application/octet-stream";
  const asText = textFile.test(mime) || /\.(txt|md|csv|json|html?)$/i.test(name);
  if (asText) {
    return file.text().then((text) => ({ name, mime: mime === "application/octet-stream" ? "text/plain" : mime, text }));
  }
  if (file.type.startsWith("image/")) return shrinkImage(file);
  return readBase64(file).then((data) => ({ name, mime, data }));
}

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function shrinkImage(file: File) {
  const name = file.name.replace(/\.\w+$/, "") + ".jpg";
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return { name: file.name, mime: file.type || "image/jpeg", data: await readBase64(file) };
    return { name, mime: "image/jpeg", data: await readBase64(new File([blob], name, { type: "image/jpeg" })) };
  } catch {
    return { name: file.name, mime: file.type || "image/jpeg", data: await readBase64(file) };
  }
}

const launches: { icon: LucideIcon; label: string; prompt: string }[] = [
  { icon: Smartphone, label: "App", prompt: "Quiero una app para agendar citas en mi clínica" },
  { icon: Globe, label: "Sitio", prompt: "Hazme un sitio web para mi estudio de diseño" },
  { icon: Bot, label: "Agente", prompt: "Crea un agente que confirme citas y responda dudas" },
  { icon: Clapperboard, label: "Video", prompt: "Hazme un video corto para anunciar mi negocio" },
  { icon: Sparkles, label: "Imagen", prompt: "Hazme el logo de mi clínica" },
  { icon: Search, label: "Buscar", prompt: "Búscame ideas para crecer mi negocio esta semana" },
];

export function VegaChat({
  firstName,
  initialChats,
  justConnected,
  initialMessages = [],
  creditAllowance = 0,
}: {
  firstName: string;
  initialChats: VegaChatSummary[];
  justConnected?: string | null;
  initialMessages?: ChatItem[];
  creditAllowance?: number;
}) {
  const { balance, syncBalance } = useCredits();
  const [chats, setChats] = useState(initialChats);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>(initialMessages);
  const [panel, setPanel] = useState<"connections" | "memory" | "tasks" | "profile" | "autonomy" | null>(justConnected ? "connections" : null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [links, setLinks] = useState<DraftLink[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tank, setTank] = useState(() => Math.max(creditAllowance, balance));
  const [streaming, setStreaming] = useState(false);
  const [mood, setMood] = useState<VegaMood>("neutral");
  const [loadingChat, setLoadingChat] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, files, links]);

  useEffect(() => {
    setTank((current) => Math.max(current, balance, creditAllowance));
  }, [balance, creditAllowance]);

  useEffect(() => {
    if (!justConnected) return;
    toast.success(
      `${isUserToolkit(justConnected) ? toolkitLabels[justConnected] : "La app"}: revisa que aparezca como conectada.`,
    );
    window.history.replaceState(null, "", window.location.pathname);
  }, [justConnected]);

  function actionChanged(messageId: string, action: VegaActionView, result: string) {
    if (action.status === "done") setMood("happy");
    else if (action.status === "failed") setMood("sad");
    setMessages((current) => {
      const next = current.map((item) =>
        item.id === messageId
          ? { ...item, actions: item.actions?.map((existing) => (existing.id === action.id ? action : existing)) }
          : item,
      );
      return action.kind !== "whatsapp_message" && (action.status === "done" || action.status === "failed")
        ? [...next, { id: crypto.randomUUID(), role: "assistant", content: result }]
        : next;
    });
  }

  async function selectChat(id: string) {
    if (streaming || id === activeId) return;
    setListOpen(false);
    setLoadingChat(true);
    const loaded = await openVegaChat(id);
    setLoadingChat(false);
    if (!loaded) {
      toast.error("Esa conversación ya no existe.");
      setChats(await listVegaChats());
      return;
    }
    setActiveId(id);
    setMessages(loaded);
    setMood("neutral");
  }

  function newChat() {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
    setMood("neutral");
    setListOpen(false);
    inputRef.current?.focus();
  }

  async function removeChat(id: string) {
    if (!window.confirm("¿Borrar esta conversación? No se puede recuperar.")) return;
    const result = await deleteVegaChat(id);
    if (!result.ok) return;
    setChats((current) => current.filter((chat) => chat.id !== id));
    if (id === activeId) newChat();
  }

  async function renameChat(chat: VegaChatSummary) {
    const title = window.prompt("Nuevo nombre de la conversación", chat.title);
    if (!title?.trim()) return;
    const result = await renameVegaChat(chat.id, title);
    if (result.ok) setChats((current) => current.map((item) => (item.id === chat.id ? { ...item, title: title.trim() } : item)));
  }

  async function addFiles(list: FileList | File[]) {
    const incoming = [...list];
    if (incoming.length === 0) return;
    const room = attachmentLimits.files - files.length;
    if (room <= 0) {
      toast.error(`Puedes adjuntar hasta ${attachmentLimits.files} archivos.`);
      return;
    }
    const accepted = incoming.slice(0, room);
    if (incoming.length > room) toast.error(`Puedes adjuntar hasta ${attachmentLimits.files} archivos.`);
    const next: DraftFile[] = [];
    for (const file of accepted) {
      if (file.size > attachmentLimits.fileBytes * 4 && !file.type.startsWith("image/")) {
        toast.error(`«${file.name}» pesa demasiado.`);
        continue;
      }
      try {
        const payload = await fileToPayload(file);
        const weight = "text" in payload ? new Blob([payload.text]).size : Math.ceil((payload.data.length * 3) / 4);
        if (weight > attachmentLimits.fileBytes) {
          toast.error(`«${file.name}» pesa demasiado. Cada archivo puede medir hasta 1.2 MB.`);
          continue;
        }
        next.push({ id: crypto.randomUUID(), ...payload });
      } catch {
        toast.error(`No pude leer «${file.name}».`);
      }
    }
    if (next.length) setFiles((current) => [...current, ...next].slice(0, attachmentLimits.files));
  }

  function addLink() {
    const url = linkDraft.trim();
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocolo");
    } catch {
      toast.error("Ese enlace no es válido.");
      return;
    }
    if (links.length >= attachmentLimits.links) {
      toast.error(`Puedes agregar hasta ${attachmentLimits.links} enlaces.`);
      return;
    }
    setLinks((current) => [...current, { id: crypto.randomUUID(), url: parsed.toString() }]);
    setLinkDraft("");
    setLinkOpen(false);
  }

  async function send(text = draft, extras?: { files: DraftFile[]; links: DraftLink[] }) {
    const message = text.trim();
    const pendingFiles = extras?.files ?? files;
    const pendingLinks = extras?.links ?? links;
    if ((!message && pendingFiles.length === 0 && pendingLinks.length === 0) || streaming) return;
    if (balance < 1) {
      toast.error("Te quedaste sin créditos", { description: "Recarga en Billetera para seguir hablando con Vega." });
      return;
    }

    const userId = crypto.randomUUID();
    const replyId = crypto.randomUUID();
    const chips: VegaAttachmentChip[] = [
      ...pendingFiles.map((file) => ({ kind: "file" as const, name: file.name })),
      ...pendingLinks.map((link) => ({ kind: "link" as const, name: new URL(link.url).hostname, url: link.url })),
    ];
    setDraft("");
    setFiles([]);
    setLinks([]);
    setLinkDraft("");
    setLinkOpen(false);
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: message, ...(chips.length ? { attachments: chips } : {}) },
      { id: replyId, role: "assistant", content: "" },
    ]);
    setStreaming(true);
    setMood("neutral");
    const controller = new AbortController();
    abortRef.current = controller;
    const update = (patch: Partial<ChatItem>) =>
      setMessages((current) => current.map((item) => (item.id === replyId ? { ...item, ...patch } : item)));
    let reply = "";
    const statuses: string[] = [];
    const actions: VegaActionView[] = [];

    try {
      const response = await fetch("/api/vega/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          message,
          requestId: replyId,
          attachments: [
            ...pendingFiles.map((file) => ({
              kind: "file" as const,
              name: file.name,
              mime: file.mime,
              ...(file.text != null ? { text: file.text } : { data: file.data }),
            })),
            ...pendingLinks.map((link) => ({ kind: "link" as const, url: link.url })),
          ],
        }),
        signal: controller.signal,
      });

      const chatId = response.headers.get("x-conversation-id");
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; credits?: number };
        syncBalance(data.credits);
        setFiles(pendingFiles);
        setLinks(pendingLinks);
        update({ content: data.error ?? "Vega no pudo responder." });
        toast.error(data.error ?? "Vega no pudo responder.");
        setMood("sad");
        return;
      }

      const label = message || chips[0]?.name || "Archivos";
      if (chatId && chatId !== activeId) {
        setActiveId(chatId);
        setChats((current) => [
          { id: chatId, title: label.length > 60 ? `${label.slice(0, 57)}…` : label, updatedAt: new Date().toISOString() },
          ...current.filter((chat) => chat.id !== chatId),
        ]);
      } else if (chatId) {
        setChats((current) => {
          const chat = current.find((item) => item.id === chatId);
          return chat ? [{ ...chat, updatedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== chatId)] : current;
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let charged = false;
      const handle = (line: string) => {
        if (!line.trim()) return;
        let event: VegaEvent;
        try {
          event = JSON.parse(line) as VegaEvent;
        } catch {
          return;
        }
        if (event.t === "text") {
          reply += event.v;
          update({ content: reply, status: undefined });
        } else if (event.t === "mood") setMood(event.v);
        else if (event.t === "status") {
          update({ status: event.v });
          if (!event.v.endsWith("…")) statuses.push(event.v);
          update({ statuses: [...statuses] });
        } else if (event.t === "sources") update({ sources: event.v });
        else if (event.t === "action") {
          actions.push(event.v);
          update({ actions: [...actions] });
        } else if (event.t === "credits") {
          syncBalance(event.v, charged ? undefined : "Vega · mensaje");
          charged = true;
        } else if (event.t === "error") {
          reply = event.v;
          update({ content: event.v, status: undefined });
          setMood("sad");
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handle);
      }
      handle(buffer);
      update({ status: undefined });
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!aborted) {
        setFiles(pendingFiles);
        setLinks(pendingLinks);
        toast.error("Se cortó la conexión con Vega.");
        setMood("sad");
      }
      update({ status: undefined });
      if (!reply) update({ content: aborted ? "Detuviste la respuesta." : "Se cortó la conexión. Intenta de nuevo." });
    } finally {
      abortRef.current = null;
      setStreaming(false);
      syncBalance(await myCredits().catch(() => undefined));
      inputRef.current?.focus();
    }
  }

  const empty = messages.length === 0;
  const panelButtons = [
    { id: "profile", label: "Perfil", hint: "Tu negocio, metas y tono", icon: User },
    { id: "autonomy", label: "Autonomía", hint: "Lo que Vega ejecuta sin confirmar", icon: ShieldCheck },
    { id: "tasks", label: "Tareas", hint: "Recordatorios y trabajos programados", icon: CalendarClock },
    { id: "memory", label: "Memoria", hint: "Lo que Vega recuerda de ti", icon: Brain },
    { id: "connections", label: "Conexiones", hint: "Correo, agenda y tus apps", icon: Plug },
  ] as const;

  function openPanel(id: (typeof panelButtons)[number]["id"]) {
    setMenuOpen(false);
    setPanel((open) => (open === id ? null : id));
  }

  return (
    <div className={cn(
      "fixed inset-x-0 top-0 bottom-[var(--lyra-tab)] z-20 flex min-h-0 flex-col overflow-hidden md:relative md:inset-auto md:bottom-auto md:z-auto md:h-[calc(100dvh-7rem)] md:min-h-[520px] md:flex-row md:rounded-3xl md:border md:border-[#E7E2DA] dark:md:border-white/12",
      empty ? "bg-[#0C0A12]" : "bg-white dark:bg-[#14121C]",
    )}>
      {listOpen || menuOpen || panel ? (
        <button
          type="button"
          aria-label="Cerrar"
          className="fixed inset-0 z-40 bg-black/35 md:hidden"
          onClick={() => {
            setListOpen(false);
            setMenuOpen(false);
            setPanel(null);
          }}
        />
      ) : null}

      <aside
        className={cn(
          "fixed top-0 bottom-[var(--lyra-tab)] left-0 z-50 flex w-[min(85vw,320px)] flex-col border-r border-[#F0ECE6] bg-[#FCFBF9] pt-[env(safe-area-inset-top)] transition-transform duration-200 md:static md:inset-y-auto md:bottom-auto md:z-auto md:w-72 md:translate-x-0 md:pt-0 dark:border-white/10 dark:bg-[#181625]",
          listOpen ? "translate-x-0 shadow-2xl md:shadow-none" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={newChat}
            className="flex flex-1 items-center gap-2 rounded-xl bg-[#1E1E24] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={streaming}
          >
            <MessageSquarePlus className="size-4" />
            Nueva conversación
          </button>
          <button type="button" className="rounded-lg p-2 text-[#5C5854] md:hidden" onClick={() => setListOpen(false)} aria-label="Cerrar lista">
            <X className="size-4" />
          </button>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {chats.length === 0 ? <li className="px-3 py-6 text-xs leading-5 text-[#8A8680]">Todavía no hay conversaciones.</li> : null}
          {chats.map((chat) => (
            <li key={chat.id} className="group relative">
              <button
                type="button"
                onClick={() => void selectChat(chat.id)}
                className={cn(
                  "w-full truncate rounded-lg px-3 py-3 pr-16 text-left text-[15px] md:py-2 md:text-sm",
                  chat.id === activeId ? "bg-[#EDE9FE] text-[#1E1E24] dark:bg-[#221F30] dark:text-[#F2F0F7]" : "text-[#5C5854] hover:bg-[#F3F0EB] dark:text-[#9B96AC] dark:hover:bg-[#221F30]",
                )}
              >
                {chat.title}
              </button>
              <span className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                <button type="button" onClick={() => void renameChat(chat)} className="rounded p-1.5 text-[#8A8680] hover:text-[#1E1E24]" aria-label="Renombrar">
                  <Pencil className="size-3.5" />
                </button>
                <button type="button" onClick={() => void removeChat(chat.id)} className="rounded p-1.5 text-[#8A8680] hover:text-[#B42318]" aria-label="Borrar">
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/dashboard"
          className="mx-3 mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[#5C5854] hover:bg-[#F3F0EB] md:hidden dark:text-[#9B96AC] dark:hover:bg-[#221F30]"
        >
          <ChevronLeft className="size-4" />
          Volver a LYRA
        </Link>
      </aside>

      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", empty && "bg-[#0C0A12] bg-[radial-gradient(ellipse_at_50%_0%,#5B21B6_0%,#0C0A12_62%)]")}>
        <header className={cn("flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:hidden", empty ? "border-b border-white/10 bg-transparent text-white" : "border-b border-[#F0ECE6] bg-white/95 dark:border-white/10 dark:bg-[#14121C]/95")}>
          <Link href="/dashboard" className={cn("grid size-10 place-items-center rounded-full active:bg-white/10", empty ? "text-white" : "text-[#1E1E24] active:bg-[#F3F0EB] dark:text-[#F2F0F7]")} aria-label="Volver a LYRA">
            <ChevronLeft className="size-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[15px] leading-tight font-semibold", empty ? "text-white" : "text-[#1E1E24]")}>Vega</p>
            <p className={cn("truncate text-xs", streaming ? "text-[#C4B5FD]" : empty ? "text-white/55" : "text-[#8A8680]")}>
              {streaming ? "Escribiendo…" : "Listo"}
            </p>
          </div>
          <button
            type="button"
            className={cn("grid size-10 place-items-center rounded-full", empty ? "text-white active:bg-white/10" : "text-[#1E1E24] active:bg-[#F3F0EB]")}
            onClick={() => setListOpen(true)}
            aria-label="Ver conversaciones"
          >
            <MessagesSquare className="size-5" />
          </button>
          <button
            type="button"
            className={cn("grid size-10 place-items-center rounded-full", empty ? "text-white active:bg-white/10" : "text-[#1E1E24] active:bg-[#F3F0EB]")}
            onClick={() => setMenuOpen(true)}
            aria-label="Más opciones"
          >
            <EllipsisVertical className="size-5" />
          </button>
        </header>

        <header className={cn("hidden items-center gap-3 px-4 py-3 md:flex", empty ? "border-b border-white/10" : "border-b border-[#F0ECE6]")}>
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-semibold", empty ? "text-white" : "text-[#1E1E24]")}>Vega</p>
            <p className={cn("text-[11px]", empty ? "text-white/50" : "text-[#8A8680]")}>Listo</p>
          </div>
          <CreditRing balance={balance} tank={tank} />
          {panelButtons.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => openPanel(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                empty
                  ? panel === id
                    ? "border-white/30 bg-white/15 text-white"
                    : "border-white/15 text-white/80 hover:border-white/30 hover:bg-white/10"
                  : panel === id
                    ? "border-[#C4B5FD] bg-[#F5F3FF] text-[#1E1E24]"
                    : "border-[#E7E2DA] text-[#1E1E24] hover:border-[#C4B5FD]",
              )}
            >
              <Icon className={cn("size-3.5", empty ? "text-[#C4B5FD]" : "text-[#7C3AED]")} />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </header>

        {menuOpen ? (
          <div className="fixed inset-x-0 bottom-[var(--lyra-tab)] z-50 max-h-[70dvh] overflow-y-auto rounded-t-3xl bg-white px-3 pt-2 pb-4 shadow-2xl md:hidden dark:bg-[#181625]">
            <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-[#E7E2DA] dark:bg-white/15" aria-hidden />
            <button
              type="button"
              onClick={newChat}
              disabled={streaming}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-[#F3F0EB] disabled:opacity-50 dark:active:bg-[#221F30]"
            >
              <span className="grid size-10 place-items-center rounded-full bg-[#1E1E24] text-white dark:bg-[#EDE9FE] dark:text-[#2E1065]">
                <MessageSquarePlus className="size-5" />
              </span>
              <span className="text-[15px] font-medium text-[#1E1E24] dark:text-[#F2F0F7]">Nueva conversación</span>
            </button>
            {panelButtons.map(({ id, label, hint, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => openPanel(id)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-[#F3F0EB] dark:active:bg-[#221F30]"
              >
                <span className="grid size-10 place-items-center rounded-full bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#221F30]">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-[#1E1E24]">{label}</span>
                  <span className="block text-xs text-[#8A8680]">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {panel === "connections" ? <ConnectionsPanel onClose={() => setPanel(null)} /> : null}
        {panel === "autonomy" ? <AutonomyPanel onClose={() => setPanel(null)} /> : null}
        {panel === "profile" ? <ProfilePanel onClose={() => setPanel(null)} /> : null}
        {panel === "memory" ? <MemoryPanel onClose={() => setPanel(null)} /> : null}
        {panel === "tasks" ? <TasksPanel onClose={() => setPanel(null)} /> : null}

        <div className={cn("min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 sm:px-8", empty ? "pt-3 pb-1 sm:pt-4" : "py-5 sm:py-6")}>
          {loadingChat ? <p className="text-center text-sm text-[#8A8680]">Abriendo conversación…</p> : null}
          {empty && !loadingChat ? (
            <div className="mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center px-1 py-6 text-center">
              <div className="relative grid size-28 place-items-center sm:size-32">
                <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.55)_0%,transparent_68%)]" aria-hidden />
                <span className="absolute inset-1 animate-[spin_18s_linear_infinite] rounded-full border border-dashed border-white/25" aria-hidden />
                <span className="absolute inset-4 rounded-full border border-white/15" aria-hidden />
                <VegaGreeting className="relative size-20 drop-shadow-[0_18px_40px_rgba(124,58,237,0.65)] sm:size-24" />
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Hola, {firstName}</h2>
              <p className="mt-1 text-sm text-white/55">Toca y Vega arranca.</p>
              <div className="mt-8 grid w-full grid-cols-3 gap-2.5 sm:gap-3">
                {launches.map((launch) => {
                  const Icon = launch.icon;
                  return (
                    <button
                      key={launch.label}
                      type="button"
                      onClick={() => void send(launch.prompt, { files: [], links: [] })}
                      className="group flex flex-col items-center gap-2.5 rounded-3xl border border-white/10 bg-white/6 px-2 py-4 transition hover:-translate-y-1 hover:border-white/25 hover:bg-white/10 active:scale-[0.98]"
                    >
                      <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#C4B5FD] via-[#7C3AED] to-[#4C1D95] text-white shadow-[0_14px_30px_-14px_rgba(124,58,237,0.95)] transition group-hover:shadow-[0_18px_36px_-12px_rgba(167,139,250,0.9)]">
                        <Icon className="size-5" />
                      </span>
                      <span className="text-[13px] font-medium text-white">{launch.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#1E1E24] px-4 py-2.5 text-sm text-white">
                    {message.attachments?.length ? (
                      <ul className={cn("flex flex-wrap gap-1.5", message.content ? "mb-2" : "")}>
                        {message.attachments.map((item) => (
                          <li key={`${item.kind}-${item.name}-${item.url ?? ""}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
                            {item.kind === "link" ? <Link2 className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0" />}
                            <span className="truncate">{item.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="flex gap-3">
                  <VegaMark
                    className="mt-0.5 size-7"
                    mood={mood}
                    still={index !== messages.length - 1}
                    thinking={streaming && index === messages.length - 1}
                  />
                  <div className="min-w-0 flex-1 text-[#1E1E24]">
                    {message.statuses?.length ? (
                      <ul className="mb-2 space-y-0.5">
                        {message.statuses.map((status, index) => (
                          <li key={index} className="text-xs text-[#8A8680]">
                            ✓ {status}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {message.content ? <RichText text={message.content} /> : null}
                    {message.status ? (
                      <p className="flex items-center gap-2 pt-1 text-xs text-[#7C3AED]">
                        <span className="size-1.5 animate-pulse rounded-full bg-[#7C3AED]" />
                        {message.status}
                      </p>
                    ) : !message.content && !message.actions?.length ? (
                      <span className="inline-flex gap-1 pt-2" aria-label="Vega está escribiendo">
                        <span className="size-1.5 animate-bounce rounded-full bg-[#7C3AED] [animation-delay:-0.3s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[#7C3AED] [animation-delay:-0.15s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[#7C3AED]" />
                      </span>
                    ) : null}
                    {message.actions?.map((action) => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        onChange={(next, result) => actionChanged(message.id, next, result)}
                        onSuggest={(text) => void send(text, { files: [], links: [] })}
                      />
                    ))}
                    {message.sources?.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {message.sources.map((source, index) => (
                          <a
                            key={`${source.url}-${index}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            title={source.url}
                            className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-[#E7E2DA] px-2.5 py-1 text-xs text-[#5C5854] hover:border-[#C4B5FD] hover:text-[#1E1E24]"
                          >
                            <Globe className="size-3 shrink-0 text-[#7C3AED]" />
                            <span className="shrink-0 font-medium">[{index + 1}]</span>
                            <span className="truncate">{source.title || new URL(source.url).hostname}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form
          className={cn("shrink-0 px-3 pt-2 pb-3 sm:p-4", empty ? "bg-transparent" : "border-t border-[#F0ECE6] bg-white dark:border-white/10 dark:bg-[#14121C]")}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
          }}
        >
          <div
            className={cn(
              "mx-auto max-w-3xl rounded-3xl border p-1.5 transition sm:rounded-2xl sm:p-2",
              empty
                ? dragging
                  ? "border-[#C4B5FD] bg-white/12 shadow-[0_0_0_4px_rgba(124,58,237,0.28)]"
                  : "border-white/15 bg-white/8 shadow-[0_20px_50px_-28px_rgba(124,58,237,0.85)] focus-within:border-[#C4B5FD] focus-within:shadow-[0_0_0_4px_rgba(124,58,237,0.28)]"
                : dragging
                  ? "border-[#7C3AED] bg-[#F5F3FF]"
                  : "border-[#E7E2DA] bg-[#FCFBF9] focus-within:border-[#7C3AED] sm:bg-white dark:border-white/12 dark:bg-[#181625]",
            )}
          >
            {files.length || links.length ? (
              <ul className="flex flex-wrap gap-1.5 px-2 pt-1 pb-1">
                {files.map((file) => (
                  <li key={file.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#E7E2DA] bg-white px-2 py-1 text-[11px] text-[#1E1E24] dark:border-white/12 dark:bg-[#221F30] dark:text-[#F2F0F7]">
                    <FileText className="size-3 shrink-0 text-[#7C3AED]" />
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button type="button" className="text-[#8A8680] hover:text-[#1E1E24]" aria-label={`Quitar ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}>
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
                {links.map((link) => (
                  <li key={link.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#E7E2DA] bg-white px-2 py-1 text-[11px] text-[#1E1E24] dark:border-white/12 dark:bg-[#221F30] dark:text-[#F2F0F7]">
                    <Link2 className="size-3 shrink-0 text-[#7C3AED]" />
                    <span className="max-w-[180px] truncate">{new URL(link.url).hostname}</span>
                    <button type="button" className="text-[#8A8680] hover:text-[#1E1E24]" aria-label={`Quitar ${link.url}`} onClick={() => setLinks((current) => current.filter((item) => item.id !== link.id))}>
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {linkOpen ? (
              <div className="flex items-center gap-2 px-2 pt-1">
                <input
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addLink();
                    }
                  }}
                  placeholder="https://…"
                  inputMode="url"
                  aria-label="Enlace para analizar"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-[#E7E2DA] bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED] dark:border-white/12 dark:bg-[#14121C] dark:text-[#F2F0F7]"
                />
                <button type="button" onClick={addLink} className="rounded-xl bg-[#EDE9FE] px-3 py-2 text-xs font-medium text-[#5B21B6]">
                  Agregar
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={attachmentAccept}
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn("grid size-10 shrink-0 place-items-center rounded-full", empty ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-[#5C5854] hover:bg-[#F3F0EB] hover:text-[#1E1E24] dark:hover:bg-[#221F30]")}
              aria-label="Adjuntar archivos"
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setLinkOpen((open) => !open)}
              className={cn("grid size-10 shrink-0 place-items-center rounded-full", empty ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-[#5C5854] hover:bg-[#F3F0EB] hover:text-[#1E1E24] dark:hover:bg-[#221F30]")}
              aria-label="Agregar enlace"
            >
              <Link2 className="size-4" />
            </button>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => {
                const pasted = event.clipboardData.files;
                if (pasted.length) {
                  event.preventDefault();
                  void addFiles(pasted);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={4000}
              enterKeyHint="send"
              placeholder={empty ? "Pídeselo a Vega…" : "Escríbele a Vega, adjunta archivos o un enlace…"}
              className={cn("max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base outline-none field-sizing-content sm:max-h-40 sm:text-sm", empty ? "text-white placeholder:text-white/40" : "text-[#1E1E24] placeholder:text-[#A8A29E]")}
            />
            <CreditRing balance={balance} tank={tank} size={26} className="mb-2 md:hidden" />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1E1E24] text-white sm:rounded-xl"
                aria-label="Detener"
              >
                <Square className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim() && files.length === 0 && links.length === 0}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[#7C3AED] text-white disabled:opacity-40 sm:rounded-xl"
                aria-label="Enviar"
              >
                <ArrowUp className="size-5 sm:size-4" />
              </button>
            )}
            </div>
          </div>
          {empty ? null : (
            <p className="mx-auto mt-2 hidden max-w-3xl text-center text-[11px] text-[#A8A29E] sm:block">
              Vega puede equivocarse. Revisa lo que importa antes de enviarlo.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
