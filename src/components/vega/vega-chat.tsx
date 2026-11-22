"use client";

import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  FileText,
  Gamepad2,
  Globe,
  Link2,
  MessageSquarePlus,
  Mic,
  MicOff,
  ChevronLeft,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Search,
  Smartphone,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { Inter } from "next/font/google";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createVegaAgent,
  deleteVegaAgent,
  deleteVegaChat,
  listVegaAgents,
  listVegaChats,
  myCredits,
  openVegaChat,
  renameVegaChat,
  updateVegaAgent,
  vegaCostMeter,
  type VegaAttachmentChip,
  type VegaAgentSummary,
  type VegaChatMessage,
  type VegaChatSummary,
} from "@/app/dashboard/super-agent/actions";
import { useCredits } from "@/components/dashboard/credit-provider";
import { ActionCard } from "@/components/vega/action-card";
import { BriefingCard } from "@/components/vega/briefing-card";
import type { BriefKind, BriefRequest } from "@/lib/vega/briefing";
import type { CostMeterView } from "@/lib/vega/cost-shared";
import { AgentAvatar } from "@/components/vega/agent-avatar";
import { defaultMascot, encodeMascot } from "@/lib/vega/mascot";
import { AgentEditor, type AgentDraft } from "@/components/vega/agent-editor";
import { AgentSidebar } from "@/components/vega/agent-sidebar";
import { SettingsModal } from "@/components/vega/settings-modal";
import { VegaHome, type AgentTemplateDraft } from "@/components/vega/vega-home";
import { RichText } from "@/components/vega/rich-text";
import { attachmentAccept, attachmentLimits } from "@/lib/vega/attachment-limits";
import { isUserToolkit, toolkitLabels } from "@/lib/vega/apps";
import type { VegaActionView, VegaEvent, VegaMood } from "@/lib/vega/events";
import { cn } from "@/lib/utils";

type ChatItem = VegaChatMessage & { status?: string; brief?: BriefRequest };
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

// Los botones de crear abren primero el briefing (preguntas clave); nada se crea con datos por defecto.
const launches: { icon: LucideIcon; label: string; brief?: BriefKind; prompt?: string }[] = [
  { icon: Smartphone, label: "App", brief: "app" },
  { icon: Globe, label: "Sitio", brief: "sitio" },
  { icon: Bot, label: "Agente", brief: "agente" },
  { icon: Gamepad2, label: "Juego", brief: "juego" },
  { icon: Search, label: "Buscar", prompt: "Búscame ideas para crecer mi negocio esta semana" },
];

const briefIntro: Record<BriefKind, string> = {
  sitio: "¡Va! Para que tu sitio sea tuyo y no una plantilla, cuéntame lo esencial:",
  app: "¡Va! Antes de armar tu app, dime para qué es y qué datos maneja:",
  agente: "¡Va! Para que tu agente hable como tu negocio, necesito esto:",
  juego: "¡Va! Para armar tu juego (se juega en celular y computadora), cuéntame:",
};

// Tipografía del chat: Inter (o la sans del sistema mientras carga), 16 px con interlineado 1.5.
const chatFont = Inter({ subsets: ["latin"], display: "swap", variable: "--font-chat" });

export function VegaChat({
  firstName,
  initialAgents,
  initialAgentId,
  initialChats,
  justConnected,
  initialMessages = [],
  creditAllowance = 0,
  initialDraft = "",
}: {
  firstName: string;
  initialAgents: VegaAgentSummary[];
  initialAgentId: string;
  initialChats: VegaChatSummary[];
  justConnected?: string | null;
  initialMessages?: ChatItem[];
  creditAllowance?: number;
  /** Entrega 4: texto inicial (p. ej. «Editar con Vega» desde Proyectos). */
  initialDraft?: string;
}) {
  const { balance, syncBalance } = useCredits();
  const [agents, setAgents] = useState(initialAgents);
  const [activeAgentId, setActiveAgentId] = useState(initialAgentId);
  const [chats, setChats] = useState(initialChats);
  const [agentForm, setAgentForm] = useState<AgentDraft | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>(initialMessages);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [links, setLinks] = useState<DraftLink[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tank, setTank] = useState(() => Math.max(creditAllowance, balance));
  const [streaming, setStreaming] = useState(false);
  const [mood, setMood] = useState<VegaMood>("neutral");
  const [loadingChat, setLoadingChat] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [chatsHidden, setChatsHidden] = useState(false);
  // Inicio de Vega: la bandeja de agentes. Se salta si llegas con algo pendiente (editar, conexión, chat abierto).
  const [view, setView] = useState<"home" | "chat">(initialDraft || justConnected || initialMessages.length ? "chat" : "home");
  const [costMeter, setCostMeter] = useState<CostMeterView | null>(null);

  useEffect(() => {
    let alive = true;
    void vegaCostMeter()
      .then((view) => {
        if (alive) setCostMeter(view);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [listening, setListening] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const dictationRef = useRef<{ stop: () => void } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0];

  // Solo sigue el final si ya estabas abajo; si subiste a leer, aparece el botón para bajar.
  useEffect(() => {
    if (messages.length === 0 || !stickRef.current) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, files, links]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      setCanDictate(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      dictationRef.current?.stop();
    };
  }, []);

  function onScroll() {
    const box = scrollRef.current;
    if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    stickRef.current = near;
    setAtBottom(near);
  }

  function scrollToBottom() {
    stickRef.current = true;
    setAtBottom(true);
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  /** Dictado por voz (Web Speech API, es-MX): agrega lo que dices al mensaje; tú decides enviarlo. */
  function toggleDictation() {
    if (listening) {
      dictationRef.current?.stop();
      return;
    }
    type Recognition = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
      onend: (() => void) | null;
      onerror: ((event: { error?: string }) => void) | null;
      start: () => void;
      stop: () => void;
    };
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Tu navegador no permite dictar. Prueba con el micrófono del teclado.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let heard = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) heard += event.results[index][0]?.transcript ?? "";
      }
      if (heard.trim()) setDraft((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${heard.trim()}`);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") toast.error("Permite el micrófono para dictar.");
    };
    recognition.onend = () => {
      setListening(false);
      dictationRef.current = null;
    };
    try {
      recognition.start();
      dictationRef.current = recognition;
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTank((current) => Math.max(current, balance, creditAllowance));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [balance, creditAllowance]);

  useEffect(() => {
    if (!justConnected) return;
    const label = isUserToolkit(justConnected) ? toolkitLabels[justConnected] : "La app";
    toast.success(`${label} quedó conectada. Escribe «listo» en el chat para que Vega continúe.`);
    window.history.replaceState(null, "", window.location.pathname);
  }, [justConnected]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        if (sessionStorage.getItem("lyra-vega-chats") === "0") setChatsHidden(true);
      } catch {
        /* modo privado */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || agentForm || settingsOpen) return;
      setListOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agentForm, settingsOpen]);

  function editAgent(agent: VegaAgentSummary) {
    setAgentForm({ id: agent.id, isDefault: agent.isDefault, name: agent.name, specialty: agent.specialty, instructions: agent.instructions, avatar: agent.avatar, persona: agent.persona ?? {} });
  }

  function setChatsCollapsed(hidden: boolean) {
    setChatsHidden(hidden);
    try {
      sessionStorage.setItem("lyra-vega-chats", hidden ? "0" : "1");
    } catch {
      /* modo privado */
    }
  }

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
    const loaded = await openVegaChat(id, activeAgentId);
    setLoadingChat(false);
    if (!loaded) {
      toast.error("Esa conversación ya no existe.");
      setChats(await listVegaChats(activeAgentId));
      return;
    }
    setActiveId(id);
    setMessages(loaded);
    setMood("neutral");
  }

  /** Vega v2 · V3: abre la conversación de otro agente (p. ej. desde la tarjeta de una tarea delegada). */
  async function openAgentChat(agentId: string, chatId: string, quiet = false) {
    if (streaming) return false;
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      toast.error("Ese agente ya no existe.");
      return false;
    }
    setView("chat");
    setLoadingChat(true);
    const loaded = await openVegaChat(chatId, agent.id).catch(() => null);
    setLoadingChat(false);
    if (!loaded) {
      if (!quiet) toast.error("Esa conversación ya no existe.");
      return false;
    }
    setActiveAgentId(agent.id);
    setChats(await listVegaChats(agent.id));
    setActiveId(chatId);
    setMessages(loaded);
    setMood("neutral");
    setListOpen(false);
    return true;
  }

  /** Inicio de Vega: tocar un agente abre su conversación más reciente (o una nueva si no tiene). */
  async function openFromHome(agent: VegaAgentSummary) {
    if (streaming) return;
    if (agent.last?.chatId && (await openAgentChat(agent.id, agent.last.chatId, true))) return;
    setView("chat");
    if (agent.id === activeAgentId) newChat();
    else await selectAgent(agent);
  }

  function goHome() {
    if (streaming) return;
    setListOpen(false);
    setSettingsOpen(false);
    setView("home");
    void listVegaAgents()
      .then((next) => {
        if (next.length) setAgents(next);
      })
      .catch(() => undefined);
  }

  function startAgent(template?: AgentTemplateDraft) {
    setAgentForm(template ?? { name: "", specialty: "", instructions: "", avatar: encodeMascot(defaultMascot({ name: `nuevo-${agents.length}` })) });
  }

  const openAgentChatRef = useRef(openAgentChat);
  useEffect(() => {
    openAgentChatRef.current = openAgentChat;
  });
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string; conversationId?: string }>).detail;
      if (detail?.agentId && detail.conversationId) void openAgentChatRef.current(detail.agentId, detail.conversationId);
    };
    window.addEventListener("vega:open-chat", onOpen);
    return () => window.removeEventListener("vega:open-chat", onOpen);
  }, []);

  function newChat() {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
    setMood("neutral");
    setListOpen(false);
    inputRef.current?.focus();
  }

  async function selectAgent(agent: VegaAgentSummary) {
    if (streaming || agent.id === activeAgentId) return;
    setActiveAgentId(agent.id);
    setActiveId(null);
    setMessages([]);
    setListOpen(false);
    setChats(await listVegaChats(agent.id));
  }

  async function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agentForm || savingAgent) return;
    setSavingAgent(true);
    try {
      if (agentForm.id) {
        const { id, name, specialty, instructions, avatar, persona } = agentForm;
        const result = await updateVegaAgent({ id, name, specialty, instructions, avatar, persona });
        if (!result.ok) {
          toast.error("error" in result ? result.error : "No se pudo guardar el agente.");
          return;
        }
      } else {
        const { name, specialty, instructions, avatar, persona } = agentForm;
        const result = await createVegaAgent({ name, specialty, instructions, avatar, persona });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setActiveAgentId(result.agent.id);
        setActiveId(null);
        setMessages([]);
        setChats([]);
        setView("chat");
      }
      setAgents(await listVegaAgents());
      setAgentForm(null);
      toast.success(agentForm.id ? "Agente actualizado." : "Agente creado.");
    } catch {
      toast.error("No se pudo guardar el agente. Intenta de nuevo.");
    } finally {
      setSavingAgent(false);
    }
  }

  async function removeAgent(agent: VegaAgentSummary) {
    if (streaming || agent.isDefault || !window.confirm(`¿Eliminar a ${agent.name}? También se borran sus conversaciones, su memoria y sus rutinas. Los archivos que creó se conservan.`)) return;
    try {
      const result = await deleteVegaAgent(agent.id);
      if (!result.ok) {
        toast.error("No se pudo eliminar el agente.");
        return;
      }
      setAgentForm(null);
      const nextAgents = await listVegaAgents();
      setAgents(nextAgents);
      if (activeAgentId === agent.id && nextAgents[0]) {
        setActiveAgentId(nextAgents[0].id);
        setActiveId(null);
        setMessages([]);
        setChats(await listVegaChats(nextAgents[0].id));
      }
      toast.success("Agente eliminado.");
    } catch {
      toast.error("No se pudo eliminar el agente. Intenta de nuevo.");
    }
  }

  async function removeChat(id: string) {
    if (!window.confirm("¿Borrar esta conversación? No se puede recuperar.")) return;
    const result = await deleteVegaChat(id, activeAgentId);
    if (!result.ok) return;
    setChats((current) => current.filter((chat) => chat.id !== id));
    if (id === activeId) newChat();
  }

  async function renameChat(chat: VegaChatSummary) {
    const title = window.prompt("Nuevo nombre de la conversación", chat.title);
    if (!title?.trim()) return;
    const result = await renameVegaChat(chat.id, title, activeAgentId);
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

  function openBrief(kind: BriefKind) {
    if (streaming) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: briefIntro[kind], brief: { kind, missing: [] } }]);
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

    stickRef.current = true;
    setAtBottom(true);
    dictationRef.current?.stop();
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
          agentId: activeAgentId,
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
        const data = (await response.json().catch(() => ({}))) as { error?: string; credits?: number; capped?: boolean };
        syncBalance(data.credits);
        if (data.capped) void vegaCostMeter().then(setCostMeter).catch(() => undefined);
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
          { id: chatId, agentId: activeAgentId, title: label.length > 60 ? `${label.slice(0, 57)}…` : label, updatedAt: new Date().toISOString() },
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
        } else if (event.t === "brief") {
          update({ brief: event.v });
        } else if (event.t === "credits") {
          syncBalance(event.v, charged ? undefined : "Vega · mensaje");
          charged = true;
        } else if (event.t === "usage") {
          setCostMeter(event.v);
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
  const column = "max-w-3xl";
  const agentName = activeAgent?.name ?? "Vega";
  const overlay = listOpen;

  return (
    <div
      id="vega-root"
      className={cn(
        "fixed inset-x-0 top-0 bottom-[var(--lyra-tab)] z-20 flex min-h-0 flex-col overflow-hidden bg-[#F4F3F0] md:relative md:inset-auto md:bottom-auto md:z-auto md:h-[100dvh] md:min-h-[560px] md:flex-row dark:bg-[#0E0D14]",
        view === "home" && "bg-[#0B0A10] md:flex-col dark:bg-[#0B0A10]",
        chatFont.variable,
        "font-[family-name:var(--font-chat),ui-sans-serif,system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif]",
      )}
    >
      {agentForm ? (
        <AgentEditor
          draft={agentForm}
          saving={savingAgent}
          onChange={setAgentForm}
          onCancel={() => setAgentForm(null)}
          onSubmit={(event) => void saveAgent(event)}
          onDelete={
            agentForm.id && !agentForm.isDefault
              ? () => {
                  const target = agents.find((agent) => agent.id === agentForm.id);
                  if (target) void removeAgent(target);
                }
              : undefined
          }
        />
      ) : null}

      {view === "home" ? (
        <VegaHome
          agents={agents}
          userName={firstName}
          busy={streaming}
          onOpenAgent={(agent) => void openFromHome(agent)}
          onCreateAgent={startAgent}
          onNewVegaChat={() => {
            const main = agents.find((agent) => agent.isDefault) ?? agents[0];
            setView("chat");
            if (main && main.id !== activeAgentId) void selectAgent(main);
            else newChat();
          }}
          onOpenLyraMenu={() => window.dispatchEvent(new Event("lyra:menu"))}
          onOpenSettings={() => setSettingsOpen(true)}
          balance={balance}
          tank={tank}
          costMeter={costMeter}
        />
      ) : (
        <>
      {overlay ? (
        <button
          type="button"
          aria-label="Cerrar agentes"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={() => setListOpen(false)}
        />
      ) : null}

      <AgentSidebar
        open={listOpen}
        hidden={chatsHidden}
        busy={streaming}
        agents={agents}
        activeAgentId={activeAgentId}
        chats={chats}
        activeChatId={activeId}
        userName={firstName}
        balance={balance}
        tank={tank}
        costMeter={costMeter}
        onOpenSettings={() => {
          setListOpen(false);
          setSettingsOpen(true);
        }}
        onOpenLyraMenu={() => {
          setListOpen(false);
          window.dispatchEvent(new Event("lyra:menu"));
        }}
        onClose={() => setListOpen(false)}
        onCollapse={() => setChatsCollapsed(true)}
        onNewChat={newChat}
        onSelectAgent={(agent) => void selectAgent(agent)}
        onCreateAgent={() => startAgent()}
        onEditAgent={editAgent}
        onSelectChat={(id) => void selectChat(id)}
        onRenameChat={(chat) => void renameChat(chat)}
        onDeleteChat={(id) => void removeChat(id)}
      />


      <section
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white md:my-2 md:mr-2 md:rounded-[28px] md:shadow-[0_1px_2px_rgba(16,12,32,0.04),0_24px_60px_-40px_rgba(76,29,149,0.35)] dark:bg-[#15131D] md:dark:shadow-none md:dark:ring-1 md:dark:ring-white/6"
        aria-label={`Chat con ${agentName}`}
      >
        {empty ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <span className="absolute -top-48 left-1/2 size-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.12)_0%,transparent_65%)] dark:bg-[radial-gradient(circle,rgba(124,58,237,0.28)_0%,transparent_65%)]" />
            <span className="absolute -right-40 bottom-0 size-[380px] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.08)_0%,transparent_65%)] dark:bg-[radial-gradient(circle,rgba(6,182,212,0.14)_0%,transparent_65%)]" />
          </div>
        ) : null}

        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-1.5 bg-[linear-gradient(to_bottom,#fff_60%,rgba(255,255,255,0))] px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-4 sm:px-3 sm:pt-3 dark:bg-[linear-gradient(to_bottom,#15131D_60%,rgba(21,19,29,0))]">
          <button
            type="button"
            onClick={goHome}
            disabled={streaming}
            className="pointer-events-auto grid size-10 place-items-center rounded-full text-[#1E1E24] hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none disabled:opacity-40 dark:text-white dark:hover:bg-white/10"
            aria-label="Volver a tus agentes"
            title="Tus agentes"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => (window.matchMedia("(min-width: 768px)").matches ? setChatsCollapsed(!chatsHidden) : setListOpen(true))}
            className={cn(
              "pointer-events-auto grid size-10 place-items-center rounded-full text-[#1E1E24] hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:text-white dark:hover:bg-white/10",
              !chatsHidden && "md:hidden",
            )}
            aria-label="Ver agentes y conversaciones"
            aria-controls="vega-agents"
            aria-expanded={listOpen}
          >
            <PanelLeftOpen className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => activeAgent && editAgent(activeAgent)}
            className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-left transition hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:hover:bg-white/[0.06]"
            aria-label={`Ajustar a ${agentName}`}
          >
            <AgentAvatar agent={activeAgent} mood={mood} thinking={streaming} className="size-8" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] leading-tight font-semibold text-[#1E1E24] dark:text-white">{agentName}</span>
              <span className="flex items-center gap-1 truncate text-[11px] leading-tight text-[#8A8680]" aria-live="polite">
                <span className={cn("size-1.5 rounded-full", streaming ? "animate-pulse bg-[#06B6D4]" : "bg-[#10B981]")} aria-hidden />
                {streaming ? "Trabajando…" : activeAgent?.specialty || "Listo"}
              </span>
            </span>
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={newChat}
            disabled={streaming}
            className="pointer-events-auto grid size-10 place-items-center rounded-full text-[#1E1E24] hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none disabled:opacity-40 dark:text-white dark:hover:bg-white/10"
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <MessageSquarePlus className="size-5" />
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className={cn("relative z-10 min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 sm:px-8", empty ? "pt-16 pb-1" : "pt-20 pb-8")}
        >
          {loadingChat ? <p className="text-center text-sm text-[#8A8680]">Abriendo conversación…</p> : null}
          {empty && !loadingChat ? (
            <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-1 py-6 text-center">
              <div className="relative grid size-28 place-items-center sm:size-32">
                <span className="absolute inset-3 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.22),transparent_70%)] blur-xl dark:bg-[radial-gradient(circle,rgba(124,58,237,0.45),transparent_70%)]" aria-hidden />
                <AgentAvatar agent={activeAgent} mood={mood === "neutral" ? "happy" : mood} thinking={streaming} className="relative size-24 sm:size-28" />
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-[#1E1E24] sm:text-4xl dark:text-white">Hola, {firstName}</h2>
              <p className="mt-1.5 text-sm text-[#5C5854] dark:text-white/60">
                {activeAgent && !activeAgent.isDefault ? `Soy ${agentName}, tu agente de ${activeAgent.specialty.toLowerCase()}. ¿En qué te ayudo?` : "Soy Vega. Dime qué necesitas y me pongo a trabajar."}
              </p>
              <div className="mt-8 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                {launches.map((launch) => {
                  const Icon = launch.icon;
                  return (
                    <button
                      key={launch.label}
                      type="button"
                      onClick={() => (launch.brief ? openBrief(launch.brief) : void send(launch.prompt, { files: [], links: [] }))}
                      className="group flex flex-col items-center gap-2.5 rounded-3xl bg-[#F6F5F2] px-2 py-4 transition hover:-translate-y-0.5 hover:bg-[#EFEDE8] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none active:scale-[0.98] dark:bg-white/[0.05] dark:hover:bg-white/[0.09]"
                    >
                      <span className="grid size-11 place-items-center rounded-2xl bg-white text-[#7C3AED] shadow-sm ring-1 ring-black/[0.04] transition group-hover:text-[#0891B2] dark:bg-white/10 dark:text-[#C4B5FD] dark:ring-0">
                        <Icon className="size-5" />
                      </span>
                      <span className="text-[13px] font-medium text-[#1E1E24] dark:text-white">{launch.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className={cn("mx-auto space-y-7", column)}>
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-[#7C3AED] px-4 py-2.5 text-base leading-[1.5] text-white sm:max-w-[75%]">
                    {message.attachments?.length ? (
                      <ul className={cn("flex flex-wrap gap-1.5", message.content ? "mb-2" : "")}>
                        {message.attachments.map((item) => (
                          <li key={`${item.kind}-${item.name}-${item.url ?? ""}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px]">
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
                <div key={message.id} className="flex flex-col items-start gap-1.5">
                  {index === 0 || index === messages.length - 1 || messages[index - 1]?.role === "user" ? (
                    <span className="flex items-center gap-1.5 pl-1 text-xs font-medium text-[#8A8680]">
                      <AgentAvatar
                        agent={activeAgent}
                        className="size-6"
                        mood={index === messages.length - 1 ? mood : "neutral"}
                        thinking={streaming && index === messages.length - 1}
                      />
                      {agentName}
                    </span>
                  ) : null}
                  <div className="vega-reply w-full max-w-full min-w-0 text-base leading-[1.5] text-[#1E1E24] dark:text-[#ECEAF3]">
                    {message.statuses?.length ? (
                      <ul className="mb-2 space-y-0.5">
                        {message.statuses.map((status, statusIndex) => (
                          <li key={statusIndex} className="flex items-center gap-1.5 text-xs text-[#8A8680]">
                            <Check className="size-3 text-[#10B981]" aria-hidden /> {status}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {message.content ? <RichText text={message.content} /> : null}
                    {message.status ? (
                      <p className="flex items-center gap-2 pt-1 text-xs text-[#7C3AED] dark:text-[#C4B5FD]">
                        <span className="size-1.5 animate-pulse rounded-full bg-[#06B6D4]" />
                        {message.status}
                      </p>
                    ) : !message.content && !message.actions?.length ? (
                      <span className="inline-flex gap-1 pt-2" aria-label={`${agentName} está escribiendo`}>
                        <span className="size-1.5 animate-bounce rounded-full bg-[#7C3AED] [animation-delay:-0.3s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[#06B6D4] [animation-delay:-0.15s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-[#10B981]" />
                      </span>
                    ) : null}
                    {message.brief ? (
                      <BriefingCard
                        request={message.brief}
                        disabled={streaming || index !== messages.length - 1}
                        onSubmit={(text) => void send(text, { files: [], links: [] })}
                      />
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
                        {message.sources.map((source, sourceIndex) => (
                          <a
                            key={`${source.url}-${sourceIndex}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            title={source.url}
                            className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-[#E7E2DA] px-2.5 py-1 text-xs text-[#5C5854] hover:border-[#C4B5FD] hover:text-[#1E1E24] dark:border-white/12"
                          >
                            <Globe className="size-3 shrink-0 text-[#06B6D4]" />
                            <span className="shrink-0 font-medium">[{sourceIndex + 1}]</span>
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
          className="relative z-10 shrink-0 px-3 pt-1 pb-3 sm:px-6 sm:pb-4"
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
          {!empty && !atBottom ? (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute -top-12 left-1/2 z-20 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-white text-[#1E1E24] shadow-[0_4px_16px_-4px_rgba(16,12,32,0.25)] ring-1 ring-black/[0.08] transition hover:bg-[#F6F5F2] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:bg-[#262231] dark:text-white dark:ring-white/10 dark:hover:bg-[#2E2A3B]"
              aria-label="Ir al final de la conversación"
            >
              <ArrowDown className="size-5" />
            </button>
          ) : null}
          <div
            className={cn(
              "mx-auto rounded-[28px] border bg-[#FFFFFF] p-1.5 shadow-[0_2px_12px_-6px_rgba(16,12,32,0.18)] transition dark:bg-[#1F1C29] dark:shadow-none",
              column,
              dragging
                ? "border-[#7C3AED] bg-[#F5F3FF] shadow-[0_0_0_4px_rgba(124,58,237,0.2)]"
                : "border-black/[0.09] focus-within:border-[#C4B5FD] focus-within:shadow-[0_10px_40px_-24px_rgba(76,29,149,0.6)] dark:border-white/[0.08] dark:focus-within:border-[#7C3AED]/50",
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
                    <Link2 className="size-3 shrink-0 text-[#06B6D4]" />
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
                  className="h-9 min-w-0 flex-1 rounded-xl border border-[#E7E2DA] bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED] dark:border-white/12 dark:bg-[#0B0A10] dark:text-[#F2F0F7]"
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
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPlusOpen((open) => !open)}
                  className={cn(
                    "grid size-10 place-items-center rounded-full text-[#1E1E24] transition hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:text-white dark:hover:bg-white/10",
                    plusOpen && "rotate-45 bg-black/[0.05] dark:bg-white/10",
                  )}
                  aria-label="Adjuntar"
                  aria-haspopup="menu"
                  aria-expanded={plusOpen}
                >
                  <Plus className="size-5" />
                </button>
                {plusOpen ? (
                  <>
                    <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setPlusOpen(false)} />
                    <div role="menu" className="absolute bottom-12 left-0 z-20 w-56 rounded-2xl bg-white p-1.5 shadow-[0_20px_50px_-20px_rgba(16,12,32,0.45)] ring-1 ring-black/[0.06] dark:bg-[#211E2B] dark:ring-white/10">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setPlusOpen(false);
                          fileRef.current?.click();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-[#1E1E24] hover:bg-[#F4F3F0] dark:text-white dark:hover:bg-white/8"
                      >
                        <Paperclip className="size-4 text-[#7C3AED]" /> Adjuntar archivo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setPlusOpen(false);
                          setLinkOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-[#1E1E24] hover:bg-[#F4F3F0] dark:text-white dark:hover:bg-white/8"
                      >
                        <Link2 className="size-4 text-[#06B6D4]" /> Agregar enlace
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
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
                aria-label={`Mensaje para ${agentName}`}
                placeholder={empty ? `Pídeselo a ${agentName}…` : `Escríbele a ${agentName}…`}
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base text-[#1E1E24] outline-none field-sizing-content placeholder:text-[#A8A29E] sm:max-h-40 dark:text-white dark:placeholder:text-white/35"
              />
              {canDictate ? (
                <button
                  type="button"
                  onClick={toggleDictation}
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full transition focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none",
                    listening ? "bg-[#FEE2E2] text-[#DC2626] dark:bg-[#DC2626]/20 dark:text-[#FCA5A5]" : "text-[#5C5854] hover:bg-black/[0.05] dark:text-white/70 dark:hover:bg-white/10",
                  )}
                  aria-label={listening ? "Detener dictado" : "Dictar mensaje"}
                  aria-pressed={listening}
                >
                  {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>
              ) : null}
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1E1E24] text-white dark:bg-white dark:text-[#0B0A10]"
                  aria-label="Detener"
                >
                  <Square className="size-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim() && files.length === 0 && links.length === 0}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[#7C3AED] text-white transition hover:bg-[#6D28D9] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:ring-offset-2 focus-visible:outline-none disabled:bg-[#E7E5E4] disabled:text-[#A8A29E] dark:hover:bg-[#8B5CF6] dark:focus-visible:ring-offset-[#1F1C29] dark:disabled:bg-white/10 dark:disabled:text-white/40"
                  aria-label="Enviar"
                >
                  <ArrowUp className="size-5 sm:size-4" />
                </button>
              )}
            </div>
          </div>
          <p className={cn("mx-auto mt-2 hidden text-center text-[11px] text-[#A8A29E] sm:block", column)}>
            {agentName} puede equivocarse. Revisa lo que importa antes de enviarlo.
          </p>
        </form>
      </section>

        </>
      )}

      {settingsOpen ? (
        <SettingsModal
          agentId={activeAgent?.id}
          agentName={activeAgent?.name}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
