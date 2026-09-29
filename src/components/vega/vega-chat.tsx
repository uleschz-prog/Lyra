"use client";

import {
  ArrowUp,
  Brain,
  CalendarClock,
  ChevronLeft,
  EllipsisVertical,
  Globe,
  MessageSquarePlus,
  MessagesSquare,
  Pencil,
  Plug,
  Square,
  Trash2,
  User,
  X,
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
  type VegaChatMessage,
  type VegaChatSummary,
} from "@/app/dashboard/super-agent/actions";
import { useCredits } from "@/components/dashboard/credit-provider";
import { ActionCard } from "@/components/vega/action-card";
import { ConnectionsPanel } from "@/components/vega/connections-panel";
import { MemoryPanel } from "@/components/vega/memory-panel";
import { ProfilePanel } from "@/components/vega/profile-panel";
import { TasksPanel } from "@/components/vega/tasks-panel";
import { VegaGreeting, VegaMark } from "@/components/vega/vega-mark";
import { RichText } from "@/components/vega/rich-text";
import { isUserToolkit, toolkitLabels } from "@/lib/vega/apps";
import type { VegaActionView, VegaEvent, VegaMood } from "@/lib/vega/events";
import { cn } from "@/lib/utils";

type ChatItem = VegaChatMessage & { status?: string };

const suggestions = [
  "Escríbeme un mensaje de WhatsApp para invitar a un amigo a conocer LYRA",
  "Organiza mi semana para prospectar 10 personas nuevas",
  "Dame 5 ideas de publicaciones para Instagram sobre emprender con IA",
  "Ayúdame a responder a alguien que dice que no tiene tiempo",
];

export function VegaChat({
  firstName,
  initialChats,
  justConnected,
}: {
  firstName: string;
  initialChats: VegaChatSummary[];
  justConnected?: string | null;
}) {
  const { balance, syncBalance } = useCredits();
  const [chats, setChats] = useState(initialChats);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [panel, setPanel] = useState<"connections" | "memory" | "tasks" | "profile" | null>(justConnected ? "connections" : null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [mood, setMood] = useState<VegaMood>("neutral");
  const [loadingChat, setLoadingChat] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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

  async function send(text = draft) {
    const message = text.trim();
    if (!message || streaming) return;
    if (balance < 1) {
      toast.error("Te quedaste sin créditos", { description: "Recarga en Billetera para seguir hablando con Vega." });
      return;
    }

    const userId = crypto.randomUUID();
    const replyId = crypto.randomUUID();
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: message },
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
        body: JSON.stringify({ conversationId: activeId, message, requestId: replyId }),
        signal: controller.signal,
      });

      const chatId = response.headers.get("x-conversation-id");
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; credits?: number };
        syncBalance(data.credits);
        update({ content: data.error ?? "Vega no pudo responder." });
        toast.error(data.error ?? "Vega no pudo responder.");
        setMood("sad");
        return;
      }

      if (chatId && chatId !== activeId) {
        setActiveId(chatId);
        setChats((current) => [
          { id: chatId, title: message.length > 60 ? `${message.slice(0, 57)}…` : message, updatedAt: new Date().toISOString() },
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
    { id: "tasks", label: "Tareas", hint: "Recordatorios y trabajos programados", icon: CalendarClock },
    { id: "memory", label: "Memoria", hint: "Lo que Vega recuerda de ti", icon: Brain },
    { id: "connections", label: "Conexiones", hint: "Correo, agenda y tus apps", icon: Plug },
  ] as const;

  function openPanel(id: (typeof panelButtons)[number]["id"]) {
    setMenuOpen(false);
    setPanel((open) => (open === id ? null : id));
  }

  return (
    <div className="fixed inset-0 z-30 flex h-dvh overflow-hidden bg-white md:relative md:inset-auto md:z-auto md:h-[calc(100dvh-7rem)] md:min-h-[520px] md:rounded-3xl md:border md:border-[#E7E2DA]">
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
          "fixed inset-y-0 left-0 z-50 flex w-[min(85vw,320px)] flex-col border-r border-[#F0ECE6] bg-[#FCFBF9] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-200 md:static md:z-auto md:w-72 md:translate-x-0 md:pt-0 md:pb-0",
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
          {chats.length === 0 ? <li className="px-3 py-2 text-xs text-[#8A8680]">Tus conversaciones aparecen aquí.</li> : null}
          {chats.map((chat) => (
            <li key={chat.id} className="group relative">
              <button
                type="button"
                onClick={() => void selectChat(chat.id)}
                className={cn(
                  "w-full truncate rounded-lg px-3 py-3 pr-16 text-left text-[15px] md:py-2 md:text-sm",
                  chat.id === activeId ? "bg-[#EDE9FE] text-[#1E1E24]" : "text-[#5C5854] hover:bg-[#F3F0EB]",
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
          className="mx-3 mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[#5C5854] hover:bg-[#F3F0EB] md:hidden"
        >
          <ChevronLeft className="size-4" />
          Volver a LYRA
        </Link>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-[#F0ECE6] bg-white/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:hidden">
          <Link href="/dashboard" className="grid size-10 place-items-center rounded-full text-[#1E1E24] active:bg-[#F3F0EB]" aria-label="Volver a LYRA">
            <ChevronLeft className="size-6" />
          </Link>
          <VegaMark className="size-9" mood={mood} thinking={streaming} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-tight font-semibold text-[#1E1E24]">Vega Bot</p>
            <p className={cn("truncate text-xs", streaming ? "text-[#7C3AED]" : "text-[#8A8680]")}>
              {streaming ? "Escribiendo…" : `En línea · ${balance} créditos`}
            </p>
          </div>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-[#1E1E24] active:bg-[#F3F0EB]"
            onClick={() => setListOpen(true)}
            aria-label="Ver conversaciones"
          >
            <MessagesSquare className="size-5" />
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-[#1E1E24] active:bg-[#F3F0EB]"
            onClick={() => setMenuOpen(true)}
            aria-label="Más opciones"
          >
            <EllipsisVertical className="size-5" />
          </button>
        </header>

        <header className="hidden items-center gap-3 border-b border-[#F0ECE6] px-4 py-3 md:flex">
          <VegaMark className="size-8" mood={mood} thinking={streaming} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#1E1E24]">Vega Bot</p>
            <p className="text-xs text-[#8A8680]">1 crédito por mensaje · 3 si busca en la web o usa tu correo o agenda</p>
          </div>
          {panelButtons.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => openPanel(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-[#1E1E24] hover:border-[#C4B5FD]",
                panel === id ? "border-[#C4B5FD] bg-[#F5F3FF]" : "border-[#E7E2DA]",
              )}
            >
              <Icon className="size-3.5 text-[#7C3AED]" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </header>

        {menuOpen ? (
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl md:hidden">
            <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-[#E7E2DA]" aria-hidden />
            <button
              type="button"
              onClick={newChat}
              disabled={streaming}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-[#F3F0EB] disabled:opacity-50"
            >
              <span className="grid size-10 place-items-center rounded-full bg-[#1E1E24] text-white">
                <MessageSquarePlus className="size-5" />
              </span>
              <span className="text-[15px] font-medium text-[#1E1E24]">Nueva conversación</span>
            </button>
            {panelButtons.map(({ id, label, hint, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => openPanel(id)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-[#F3F0EB]"
              >
                <span className="grid size-10 place-items-center rounded-full bg-[#F5F3FF] text-[#7C3AED]">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-[#1E1E24]">{label}</span>
                  <span className="block text-xs text-[#8A8680]">{hint}</span>
                </span>
              </button>
            ))}
            <p className="px-3 pt-2 text-center text-[11px] text-[#A8A29E]">
              1 crédito por mensaje · 3 si busca en la web o usa tu correo o agenda
            </p>
          </div>
        ) : null}

        {panel === "connections" ? <ConnectionsPanel onClose={() => setPanel(null)} /> : null}
        {panel === "profile" ? <ProfilePanel onClose={() => setPanel(null)} /> : null}
        {panel === "memory" ? <MemoryPanel onClose={() => setPanel(null)} /> : null}
        {panel === "tasks" ? <TasksPanel onClose={() => setPanel(null)} /> : null}

        <div className="flex-1 overscroll-contain overflow-y-auto px-3 py-5 sm:px-8 sm:py-6">
          {loadingChat ? <p className="text-center text-sm text-[#8A8680]">Abriendo conversación…</p> : null}
          {empty && !loadingChat ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center pt-6 text-center sm:pt-8">
              <VegaGreeting className="size-14 sm:size-16" />
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#1E1E24] sm:text-2xl">Hola, {firstName}. ¿En qué te ayudo hoy?</h2>
              <p className="mt-2 text-sm text-[#5C5854]">Vega Bot te ayuda a vender, prospectar y organizar tu día.</p>
              <div className="mt-6 grid w-full gap-2 sm:mt-8 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] px-4 py-3 text-left text-sm text-[#1E1E24] transition-colors hover:border-[#C4B5FD] hover:bg-[#FAF8FF] active:bg-[#F5F3FF] sm:bg-white"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#1E1E24] px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
                    {message.content}
                  </p>
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
          className="border-t border-[#F0ECE6] bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-[#E7E2DA] bg-[#FCFBF9] p-1.5 focus-within:border-[#7C3AED] sm:rounded-2xl sm:bg-white sm:p-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={4000}
              enterKeyHint="send"
              placeholder="Escríbele a Vega Bot…"
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-base text-[#1E1E24] outline-none placeholder:text-[#A8A29E] field-sizing-content sm:max-h-40 sm:px-2 sm:text-sm"
            />
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
                disabled={!draft.trim()}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[#7C3AED] text-white disabled:opacity-40 sm:rounded-xl"
                aria-label="Enviar"
              >
                <ArrowUp className="size-5 sm:size-4" />
              </button>
            )}
          </div>
          <p className="mx-auto mt-2 hidden max-w-3xl text-center text-[11px] text-[#A8A29E] sm:block">
            Vega Bot puede equivocarse. Revisa los datos importantes antes de enviarlos.
          </p>
        </form>
      </section>
    </div>
  );
}
