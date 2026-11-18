"use client";

import {
  ArrowUp,
  Bot,
  Check,
  ChevronLeft,
  FileText,
  Globe,
  Link2,
  MessageSquarePlus,
  PanelLeftOpen,
  PanelRight,
  Paperclip,
  Search,
  Smartphone,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
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
import { CreditRing } from "@/components/vega/credit-ring";
import { UsageMeter } from "@/components/vega/usage-meter";
import type { CostMeterView } from "@/lib/vega/cost-shared";
import { VegaGreeting } from "@/components/vega/vega-mark";
import { AgentAvatar } from "@/components/vega/agent-avatar";
import { AgentEditor, type AgentDraft } from "@/components/vega/agent-editor";
import { AgentSidebar } from "@/components/vega/agent-sidebar";
import { InfoPane, type PaneTab } from "@/components/vega/info-pane";
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
  { icon: Search, label: "Buscar", prompt: "Búscame ideas para crecer mi negocio esta semana" },
];

const briefIntro: Record<BriefKind, string> = {
  sitio: "¡Va! Para que tu sitio sea tuyo y no una plantilla, cuéntame lo esencial:",
  app: "¡Va! Antes de armar tu app, dime para qué es y qué datos maneja:",
  agente: "¡Va! Para que tu agente hable como tu negocio, necesito esto:",
};

export function VegaChat({
  firstName,
  initialAgents,
  initialAgentId,
  initialChats,
  justConnected,
  initialMessages = [],
  creditAllowance = 0,
}: {
  firstName: string;
  initialAgents: VegaAgentSummary[];
  initialAgentId: string;
  initialChats: VegaChatSummary[];
  justConnected?: string | null;
  initialMessages?: ChatItem[];
  creditAllowance?: number;
}) {
  const { balance, syncBalance } = useCredits();
  const [agents, setAgents] = useState(initialAgents);
  const [activeAgentId, setActiveAgentId] = useState(initialAgentId);
  const [chats, setChats] = useState(initialChats);
  const [agentForm, setAgentForm] = useState<AgentDraft | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>(initialMessages);
  const [paneTab, setPaneTab] = useState<PaneTab>(justConnected ? "conexiones" : "resumen");
  const [paneOpen, setPaneOpen] = useState(Boolean(justConnected));
  const [paneHidden, setPaneHidden] = useState(false);
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
  const [chatsHidden, setChatsHidden] = useState(false);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0];

  useEffect(() => {
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, files, links]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTank((current) => Math.max(current, balance, creditAllowance));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [balance, creditAllowance]);

  useEffect(() => {
    if (!justConnected) return;
    toast.success(
      `${isUserToolkit(justConnected) ? toolkitLabels[justConnected] : "La app"}: revisa que aparezca como conectada.`,
    );
    window.history.replaceState(null, "", window.location.pathname);
  }, [justConnected]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        if (sessionStorage.getItem("lyra-vega-chats") === "0") setChatsHidden(true);
        if (sessionStorage.getItem("lyra-vega-pane") === "0") setPaneHidden(true);
      } catch {
        /* modo privado */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || agentForm) return;
      setListOpen(false);
      setPaneOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agentForm]);

  function setPaneCollapsed(hidden: boolean) {
    setPaneHidden(hidden);
    try {
      sessionStorage.setItem("lyra-vega-pane", hidden ? "0" : "1");
    } catch {
      /* modo privado */
    }
  }

  /** En pantallas grandes muestra u oculta la columna; en móvil y tableta abre la hoja. */
  function togglePane(tab?: PaneTab) {
    if (tab) setPaneTab(tab);
    if (window.matchMedia("(min-width: 1280px)").matches) {
      setPaneCollapsed(!paneHidden && !tab ? true : false);
      return;
    }
    setPaneOpen((open) => (tab ? true : !open));
  }

  function editAgent(agent: VegaAgentSummary) {
    setAgentForm({ id: agent.id, isDefault: agent.isDefault, name: agent.name, specialty: agent.specialty, instructions: agent.instructions, avatar: agent.avatar });
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
        const { id, name, specialty, instructions, avatar } = agentForm;
        const result = await updateVegaAgent({ id, name, specialty, instructions, avatar });
        if (!result.ok) {
          toast.error("error" in result ? result.error : "No se pudo guardar el agente.");
          return;
        }
      } else {
        const { name, specialty, instructions, avatar } = agentForm;
        const result = await createVegaAgent({ name, specialty, instructions, avatar });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setActiveAgentId(result.agent.id);
        setActiveId(null);
        setMessages([]);
        setChats([]);
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
    if (streaming || agent.isDefault || !window.confirm(`¿Eliminar a ${agent.name} y todas sus conversaciones?`)) return;
    try {
      const result = await deleteVegaAgent(agent.id);
      if (!result.ok) {
        toast.error("No se pudo eliminar el agente.");
        return;
      }
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
  const overlay = listOpen || paneOpen;
  const paneScopeNote = "Por ahora la memoria, los archivos, las rutinas y las conexiones son compartidos entre todos tus agentes.";
  const renderPaneTab = undefined;

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 bottom-[var(--lyra-tab)] z-20 flex min-h-0 flex-col overflow-hidden bg-white md:relative md:inset-auto md:bottom-auto md:z-auto md:h-[calc(100dvh-3rem)] md:min-h-[560px] md:flex-row md:rounded-3xl md:border md:border-[#E7E2DA] md:shadow-[0_30px_80px_-50px_rgba(76,29,149,0.45)] dark:bg-[#0B0A10] dark:md:border-white/10",
      )}
    >
      {overlay ? (
        <button
          type="button"
          aria-label="Cerrar paneles"
          className={cn("fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:absolute", !listOpen && "xl:hidden", listOpen && !paneOpen && "md:hidden")}
          onClick={() => {
            setListOpen(false);
            setPaneOpen(false);
          }}
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
        onClose={() => setListOpen(false)}
        onCollapse={() => setChatsCollapsed(true)}
        onNewChat={newChat}
        onSelectAgent={(agent) => void selectAgent(agent)}
        onCreateAgent={() => setAgentForm({ name: "", specialty: "", instructions: "", avatar: "🤖" })}
        onEditAgent={editAgent}
        onDeleteAgent={(agent) => void removeAgent(agent)}
        onSelectChat={(id) => void selectChat(id)}
        onRenameChat={(chat) => void renameChat(chat)}
        onDeleteChat={(id) => void removeChat(id)}
      />

      {agentForm ? (
        <AgentEditor draft={agentForm} saving={savingAgent} onChange={setAgentForm} onCancel={() => setAgentForm(null)} onSubmit={(event) => void saveAgent(event)} />
      ) : null}

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label={`Chat con ${agentName}`}>
        {empty ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <span className="absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.22)_0%,transparent_65%)] dark:bg-[radial-gradient(circle,rgba(124,58,237,0.45)_0%,transparent_65%)]" />
            <span className="absolute -right-32 bottom-10 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.16)_0%,transparent_65%)] dark:bg-[radial-gradient(circle,rgba(6,182,212,0.22)_0%,transparent_65%)]" />
            <span className="absolute -bottom-40 -left-24 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.12)_0%,transparent_65%)] dark:bg-[radial-gradient(circle,rgba(16,185,129,0.16)_0%,transparent_65%)]" />
          </div>
        ) : null}

        <header className="relative z-10 flex items-center gap-2 border-b border-[#F0ECE6] bg-white/85 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:px-4 md:py-3 dark:border-white/8 dark:bg-[#0B0A10]/80">
          <Link href="/dashboard" className="grid size-10 place-items-center rounded-full text-[#1E1E24] hover:bg-[#F3F0EB] md:hidden dark:text-white dark:hover:bg-white/10" aria-label="Volver a LYRA">
            <ChevronLeft className="size-6" />
          </Link>
          <button
            type="button"
            onClick={() => (window.matchMedia("(min-width: 768px)").matches ? setChatsCollapsed(!chatsHidden) : setListOpen(true))}
            className={cn("grid size-10 place-items-center rounded-full text-[#1E1E24] hover:bg-[#F3F0EB] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:text-white dark:hover:bg-white/10", !chatsHidden && "md:hidden")}
            aria-label="Ver agentes y conversaciones"
            aria-controls="vega-agents"
            aria-expanded={listOpen}
          >
            <PanelLeftOpen className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => activeAgent && editAgent(activeAgent)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none"
            aria-label={`Ajustar a ${agentName}`}
          >
            <AgentAvatar agent={activeAgent} mood={mood} thinking={streaming} className="size-9 text-lg" ring />
            <span className="min-w-0">
              <span className="block truncate text-[15px] leading-tight font-semibold text-[#1E1E24] md:text-sm dark:text-white">{agentName}</span>
              <span className="flex items-center gap-1.5 truncate text-xs text-[#8A8680] md:text-[11px]" aria-live="polite">
                <span className={cn("size-1.5 rounded-full", streaming ? "animate-pulse bg-[#06B6D4]" : "bg-[#10B981]")} aria-hidden />
                {streaming ? "Trabajando…" : activeAgent?.specialty || "Listo"}
              </span>
            </span>
          </button>
          <UsageMeter view={costMeter} className="hidden lg:inline-flex" />
          <CreditRing balance={balance} tank={tank} className="hidden md:block" />
          <button
            type="button"
            onClick={newChat}
            disabled={streaming}
            className="hidden size-10 place-items-center rounded-full text-[#1E1E24] hover:bg-[#F3F0EB] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none disabled:opacity-40 sm:grid dark:text-white dark:hover:bg-white/10"
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <MessageSquarePlus className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => togglePane()}
            className={cn(
              "grid size-10 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none",
              paneOpen || !paneHidden ? "text-[#7C3AED] hover:bg-[#F5F3FF] dark:text-[#C4B5FD] dark:hover:bg-white/10" : "text-[#1E1E24] hover:bg-[#F3F0EB] dark:text-white dark:hover:bg-white/10",
            )}
            aria-label="Información del agente"
            aria-controls="vega-info"
            aria-expanded={paneOpen}
            title="Resumen, rutinas, archivos, memoria y conexiones"
          >
            <PanelRight className="size-5" />
          </button>
        </header>

        <div className={cn("relative z-10 min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 sm:px-8", empty ? "pt-3 pb-1 sm:pt-4" : "py-5 sm:py-6")}>
          {loadingChat ? <p className="text-center text-sm text-[#8A8680]">Abriendo conversación…</p> : null}
          {empty && !loadingChat ? (
            <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-1 py-6 text-center">
              <div className="relative grid size-28 place-items-center sm:size-32">
                <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_180deg,rgba(124,58,237,0.5),rgba(6,182,212,0.4),rgba(16,185,129,0.35),rgba(124,58,237,0.5))] opacity-60 blur-xl" aria-hidden />
                <span className="absolute inset-1 animate-[spin_18s_linear_infinite] rounded-full border border-dashed border-[#7C3AED]/30 dark:border-white/25" aria-hidden />
                <span className="absolute inset-4 rounded-full border border-[#7C3AED]/15 dark:border-white/15" aria-hidden />
                {activeAgent && !activeAgent.isDefault ? (
                  <AgentAvatar agent={activeAgent} className="relative size-20 text-4xl sm:size-24" />
                ) : (
                  <VegaGreeting className="relative size-20 text-[#7C3AED] drop-shadow-[0_18px_40px_rgba(124,58,237,0.55)] sm:size-24 dark:text-white" />
                )}
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
                      className="group flex flex-col items-center gap-2.5 rounded-3xl border border-[#EEE9E2] bg-white/80 px-2 py-4 shadow-[0_12px_30px_-24px_rgba(76,29,149,0.6)] backdrop-blur transition hover:-translate-y-1 hover:border-[#C4B5FD] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:hover:border-white/25 dark:hover:bg-white/10"
                    >
                      <span className="grid size-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#8B5CF6,#7C3AED_45%,#0891B2)] text-white shadow-[0_14px_30px_-14px_rgba(124,58,237,0.95)] transition group-hover:shadow-[0_18px_36px_-12px_rgba(6,182,212,0.7)]">
                        <Icon className="size-5" />
                      </span>
                      <span className="text-[13px] font-medium text-[#1E1E24] dark:text-white">{launch.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className={cn("mx-auto space-y-6", column)}>
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[linear-gradient(135deg,#7C3AED,#6D28D9)] px-4 py-2.5 text-sm text-white shadow-[0_10px_24px_-16px_rgba(124,58,237,0.9)]">
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
                <div key={message.id} className="flex gap-3">
                  <AgentAvatar
                    agent={activeAgent}
                    className="mt-0.5 size-7 text-sm"
                    mood={index === messages.length - 1 ? mood : "neutral"}
                    thinking={streaming && index === messages.length - 1}
                  />
                  <div className="min-w-0 flex-1 text-[#1E1E24] dark:text-[#ECEAF3]">
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
          className={cn("relative z-10 shrink-0 px-3 pt-2 pb-3 sm:p-4", !empty && "border-t border-[#F0ECE6] bg-white dark:border-white/8 dark:bg-[#0B0A10]")}
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
              "mx-auto rounded-3xl border bg-white p-1.5 shadow-[0_18px_50px_-30px_rgba(76,29,149,0.55)] transition sm:p-2 dark:bg-[#16131F]",
              column,
              dragging
                ? "border-[#7C3AED] bg-[#F5F3FF] shadow-[0_0_0_4px_rgba(124,58,237,0.2)]"
                : "border-[#E7E2DA] focus-within:border-[#7C3AED] focus-within:shadow-[0_0_0_4px_rgba(124,58,237,0.14)] dark:border-white/12 dark:focus-within:border-[#8B5CF6]",
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
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="grid size-10 shrink-0 place-items-center rounded-full text-[#5C5854] hover:bg-[#F3F0EB] hover:text-[#1E1E24] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:text-[#A9A3B8] dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Adjuntar archivos"
              >
                <Paperclip className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setLinkOpen((open) => !open)}
                className="grid size-10 shrink-0 place-items-center rounded-full text-[#5C5854] hover:bg-[#F3F0EB] hover:text-[#1E1E24] focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none dark:text-[#A9A3B8] dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Agregar enlace"
                aria-expanded={linkOpen}
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
                aria-label={`Mensaje para ${agentName}`}
                placeholder={empty ? `Pídeselo a ${agentName}…` : `Escríbele a ${agentName}, adjunta archivos o un enlace…`}
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base text-[#1E1E24] outline-none field-sizing-content placeholder:text-[#A8A29E] sm:max-h-40 sm:text-sm dark:text-white dark:placeholder:text-white/35"
              />
              <CreditRing balance={balance} tank={tank} size={26} className="mb-2 md:hidden" />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1E1E24] text-white sm:rounded-xl dark:bg-white dark:text-[#0B0A10]"
                  aria-label="Detener"
                >
                  <Square className="size-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim() && files.length === 0 && links.length === 0}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#0891B2)] text-white shadow-[0_10px_22px_-12px_rgba(124,58,237,0.9)] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#06B6D4] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40 disabled:shadow-none sm:rounded-xl dark:focus-visible:ring-offset-[#16131F]"
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

      <InfoPane
        open={paneOpen}
        hidden={paneHidden}
        tab={paneTab}
        agent={activeAgent}
        balance={balance}
        tank={tank}
        costMeter={costMeter}
        scopeNote={paneScopeNote}
        renderTab={renderPaneTab}
        onTab={setPaneTab}
        onClose={() => {
          setPaneOpen(false);
          if (window.matchMedia("(min-width: 1280px)").matches) setPaneCollapsed(true);
        }}
        onEditAgent={() => activeAgent && editAgent(activeAgent)}
      />
    </div>
  );
}
