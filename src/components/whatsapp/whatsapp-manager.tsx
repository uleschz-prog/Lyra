"use client";

import { Check, Clock3, MessageCircle, Pause, Play, Send, Settings2, Trash2, Unplug } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  cancelWhatsappSchedule,
  disconnectWhatsappBusiness,
  saveWhatsappSettings,
  sendWhatsappFromInbox,
  setWhatsappChatAutomation,
  whatsappChatMessages,
  whatsappChats,
  whatsappDashboard,
  whatsappSchedules,
  whatsappTemplates,
} from "@/app/dashboard/super-agent/actions";
import { MetaWhatsappConnect } from "@/components/whatsapp/meta-connect";

type Dashboard = NonNullable<Awaited<ReturnType<typeof whatsappDashboard>>>;
type Chat = Awaited<ReturnType<typeof whatsappChats>>[number];
type Message = Awaited<ReturnType<typeof whatsappChatMessages>>[number];
type Schedule = Awaited<ReturnType<typeof whatsappSchedules>>[number];
type Template = Extract<Awaited<ReturnType<typeof whatsappTemplates>>, { ok: true }>["templates"][number];

function localDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

export function WhatsappManager({
  initialDashboard,
  initialChats,
  initialSchedules,
  now,
}: {
  initialDashboard: Dashboard;
  initialChats: Chat[];
  initialSchedules: Schedule[];
  now: string;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [chats, setChats] = useState(initialChats);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [selectedId, setSelectedId] = useState(initialChats[0]?.id ?? "");
  const [loadedMessages, setLoadedMessages] = useState<{ chatId: string; messages: Message[] } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templateKey, setTemplateKey] = useState("");
  const [variables, setVariables] = useState("");
  const [draft, setDraft] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [instructions, setInstructions] = useState(initialDashboard.instructions);
  const [automation, setAutomation] = useState(initialDashboard.automation);
  const [busy, setBusy] = useState(false);

  const selectedChat = chats.find((chat) => chat.id === selectedId) ?? null;
  const messages = loadedMessages?.chatId === selectedId ? loadedMessages.messages : [];
  const selectedTemplate = useMemo(
    () => templates.find((template) => `${template.name}:${template.language}` === templateKey) ?? null,
    [templateKey, templates],
  );
  const windowOpen = Boolean(selectedChat?.windowOpen);

  async function refresh() {
    const [nextDashboard, nextChats, nextSchedules] = await Promise.all([
      whatsappDashboard(),
      whatsappChats(),
      whatsappSchedules(),
    ]);
    if (nextDashboard) {
      setDashboard(nextDashboard);
      setInstructions(nextDashboard.instructions);
      setAutomation(nextDashboard.automation);
    }
    setChats(nextChats);
    setSchedules(nextSchedules);
    setSelectedId((current) => current && nextChats.some((chat) => chat.id === current) ? current : (nextChats[0]?.id ?? ""));
  }

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void whatsappChatMessages(selectedId).then((value) => {
      if (active) setLoadedMessages({ chatId: selectedId, messages: value });
    });
    return () => {
      active = false;
    };
  }, [selectedId, chats]);

  async function loadTemplates() {
    if (templatesLoaded) return;
    const result = await whatsappTemplates();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setTemplates(result.templates);
    setTemplatesLoaded(true);
    if (!result.templates.length) toast.message("No hay plantillas aprobadas para este número en Meta.");
  }

  async function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChat) return;
    setBusy(true);
    const result = await sendWhatsappFromInbox({
      chatId: selectedChat.id,
      ...(selectedTemplate ? {
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        variables: variables.split("\n").map((value) => value.trim()).filter(Boolean),
      } : { text: draft }),
      ...(scheduleAt ? { scheduleAt: new Date(scheduleAt).toISOString() } : {}),
      consentConfirmed,
    }).catch(() => ({ ok: false as const, error: "No se pudo completar la solicitud." }));
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.scheduled) {
      toast.success("Mensaje programado.");
      setScheduleAt("");
      setConsentConfirmed(false);
      setDraft("");
      setTemplateKey("");
      setVariables("");
      setSchedules(await whatsappSchedules());
      return;
    }
    toast.success("Mensaje enviado.");
    setDraft("");
    setConsentConfirmed(false);
    setTemplateKey("");
    setVariables("");
    await refresh();
  }

  async function toggleChat(chat: Chat) {
    const active = chat.automation !== "active";
    const result = await setWhatsappChatAutomation(chat.id, active);
    if (!result.ok) {
      toast.error("No se pudo actualizar la automatización.");
      return;
    }
    setChats((current) => current.map((item) => item.id === chat.id ? { ...item, automation: active ? "active" : "paused_by_human" } : item));
  }

  async function removeSchedule(id: string) {
    const result = await cancelWhatsappSchedule(id);
    if (!result.ok) {
      toast.error("El mensaje ya se está procesando o no se encontró.");
      return;
    }
    setSchedules((current) => current.filter((item) => item.id !== id));
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await saveWhatsappSettings({ instructions, automation });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Configuración guardada.");
  }

  async function disconnect() {
    if (!window.confirm("Se desconectará Meta y se eliminarán de LYRA los contactos, conversaciones y mensajes guardados de esta conexión. ¿Continuar?")) return;
    const result = await disconnectWhatsappBusiness();
    if (!result.ok) {
      toast.error("No se pudo desconectar.");
      return;
    }
    toast.success("WhatsApp Business desconectado.");
    await refresh();
  }

  const statusLabel = dashboard.connection?.needsReconnect
    ? "Autorización vencida"
    : dashboard.connection
      ? "Conectado"
      : "Sin conectar";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#7C3AED] uppercase">Canal de negocio</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1E1E24]">WhatsApp Business</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C5854]">
            Conecta con Meta, atiende conversaciones individuales y programa seguimientos autorizados desde LYRA.
          </p>
        </div>
        {dashboard.connection ? (
          <button type="button" onClick={() => void disconnect()} className="inline-flex items-center gap-2 rounded-xl border border-[#E7E2DA] px-3 py-2 text-sm text-[#5C5854]">
            <Unplug className="size-4" /> Desconectar
          </button>
        ) : null}
      </header>

      <section className="rounded-2xl border border-[#E7E2DA] bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="size-5 text-[#16A34A]" />
          <p className="font-semibold text-[#1E1E24]">Conexión Meta · {statusLabel}</p>
        </div>
        <MetaWhatsappConnect
          connected={Boolean(dashboard.connection)}
          phone={dashboard.connection?.phone ?? ""}
          onConnected={() => void refresh()}
        />
        {dashboard.connection?.needsReconnect ? (
          <p className="mt-2 text-sm text-amber-800">La autorización venció. Vuelve a conectar para enviar y recibir mensajes.</p>
        ) : null}
      </section>

      {dashboard.connection ? (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
            <section className="grid min-h-[620px] overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white md:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="border-b border-[#E7E2DA] md:border-r md:border-b-0">
                <div className="flex items-center justify-between border-b border-[#F0ECE6] px-4 py-3">
                  <p className="text-sm font-semibold text-[#1E1E24]">Conversaciones</p>
                  <button type="button" onClick={() => void refresh()} className="text-xs text-[#7C3AED]">Actualizar</button>
                </div>
                <ul className="max-h-64 divide-y divide-[#F0ECE6] overflow-y-auto md:max-h-[560px]">
                  {chats.map((chat) => (
                    <li key={chat.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(chat.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-[#FCFBF9] ${selectedId === chat.id ? "bg-[#F5F3FF]" : ""}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-[#1E1E24]">{chat.name || `+${chat.phone}`}</span>
                          {chat.optedOutAt ? <span className="text-[10px] text-[#B42318]">Baja</span> : null}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[#8A8680]">{chat.messages[0]?.text || `+${chat.phone}`}</span>
                      </button>
                    </li>
                  ))}
                  {!chats.length ? <li className="px-4 py-8 text-center text-sm text-[#8A8680]">Las conversaciones aparecerán cuando alguien escriba a tu número.</li> : null}
                </ul>
              </aside>

              <div className="flex min-w-0 flex-col">
                {selectedChat ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0ECE6] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1E1E24]">{selectedChat.name || `+${selectedChat.phone}`}</p>
                        <p className="text-xs text-[#8A8680]">+{selectedChat.phone} · {selectedChat.stage}</p>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(selectedChat.optedOutAt)}
                        onClick={() => void toggleChat(selectedChat)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs disabled:opacity-40"
                      >
                        {selectedChat.automation === "active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        {selectedChat.automation === "active" ? "Pausar agente" : "Reanudar agente"}
                      </button>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto bg-[#FCFBF9] p-4">
                      {messages.map((message) => (
                        <div key={message.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-[#EDE9FE] text-[#2E1065]" : "bg-white text-[#1E1E24] ring-1 ring-[#F0ECE6]"}`}>
                          <p className="whitespace-pre-wrap break-words">{message.text}</p>
                          <p className="mt-1 text-[10px] opacity-60">{formatTime(message.createdAt)} · {message.status}</p>
                        </div>
                      ))}
                      {!messages.length ? <p className="py-12 text-center text-sm text-[#8A8680]">No hay mensajes guardados todavía.</p> : null}
                    </div>
                    <form onSubmit={(event) => void submitMessage(event)} className="space-y-3 border-t border-[#F0ECE6] p-4">
                      {!windowOpen ? (
                        <div className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                          La ventana de atención de Meta terminó. Para enviar necesitas una plantilla aprobada y consentimiento registrado.
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => { setTemplateKey(""); void loadTemplates(); }} className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs">
                          Plantillas aprobadas
                        </button>
                        {templates.length ? (
                          <select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#E7E2DA] bg-white px-2 py-1.5 text-xs">
                            <option value="">Mensaje de texto</option>
                            {templates.map((template) => (
                              <option key={`${template.name}:${template.language}`} value={`${template.name}:${template.language}`}>
                                {template.name} · {template.language}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                      {selectedTemplate?.variables ? (
                        <div>
                          <label className="mb-1 block text-xs text-[#5C5854]">Variables de la plantilla (una por línea)</label>
                          <textarea value={variables} onChange={(event) => setVariables(event.target.value)} rows={2} className="w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
                        </div>
                      ) : null}
                      {!selectedTemplate ? (
                        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4096} rows={3} placeholder="Escribe una respuesta…" className="w-full resize-y rounded-xl border border-[#E7E2DA] px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
                      ) : (
                        <p className="rounded-lg bg-[#FCFBF9] p-2 text-xs text-[#5C5854]">{selectedTemplate.body}</p>
                      )}
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs text-[#5C5854]">
                          Programar (opcional)
                          <input type="datetime-local" value={scheduleAt} min={localDateTime(new Date(new Date(now).getTime() + 60_000))} onChange={(event) => setScheduleAt(event.target.value)} className="mt-1 block rounded-lg border border-[#E7E2DA] px-2 py-1.5 text-xs" />
                        </label>
                        {scheduleAt || selectedTemplate ? (
                          <label className="flex items-start gap-2 text-xs leading-5 text-[#5C5854]">
                            <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} className="mt-1" />
                            Confirmo que este contacto aceptó recibir seguimientos por WhatsApp de este negocio.
                          </label>
                        ) : null}
                        <button
                          type="submit"
                          disabled={busy || Boolean(selectedChat.optedOutAt) || (!selectedTemplate && !draft.trim()) || (!windowOpen && !selectedTemplate) || (Boolean(scheduleAt || selectedTemplate) && !consentConfirmed)}
                          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                          {scheduleAt ? <Clock3 className="size-4" /> : selectedTemplate ? <Check className="size-4" /> : <Send className="size-4" />}
                          {busy ? "Procesando…" : scheduleAt ? "Programar" : "Enviar"}
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="grid flex-1 place-items-center p-8 text-center text-sm text-[#8A8680]">Elige una conversación para verla.</div>
                )}
              </div>
            </section>

            <div className="space-y-5">
              <section className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
                <h2 className="flex items-center gap-2 font-semibold text-[#1E1E24]"><Clock3 className="size-4 text-[#7C3AED]" /> Mensajes programados</h2>
                <p className="mt-1 text-xs leading-5 text-[#8A8680]">Se verifican cada minuto. El texto libre solo se envía dentro de las 24 horas desde el último mensaje del contacto; fuera de esa ventana se requiere plantilla aprobada y consentimiento.</p>
                <ul className="mt-3 space-y-2">
                  {schedules.map((item) => (
                    <li key={item.id} className="rounded-xl border border-[#F0ECE6] p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-[#1E1E24]">+{item.recipientPhone} · {formatTime(item.runAt)}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-[#5C5854]">{item.kind === "template" ? `Plantilla ${item.templateName}` : item.text}</p>
                          <p className={`mt-1 text-[10px] ${item.status === "failed" ? "text-[#B42318]" : "text-[#8A8680]"}`}>{item.status}{item.error ? ` · ${item.error}` : ""}</p>
                        </div>
                        {item.status === "scheduled" ? (
                          <button type="button" onClick={() => void removeSchedule(item.id)} aria-label="Cancelar mensaje programado" className="rounded p-1 text-[#8A8680] hover:text-[#B42318]">
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                  {!schedules.length ? <li className="py-5 text-center text-xs text-[#8A8680]">No tienes mensajes pendientes.</li> : null}
                </ul>
              </section>

              <form onSubmit={(event) => void saveSettings(event)} className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
                <h2 className="flex items-center gap-2 font-semibold text-[#1E1E24]"><Settings2 className="size-4 text-[#7C3AED]" /> Agente de atención</h2>
                <label className="mt-3 flex items-center gap-2 text-sm text-[#1E1E24]">
                  <input type="checkbox" checked={automation} onChange={(event) => setAutomation(event.target.checked)} />
                  Responder automáticamente a nuevos mensajes
                </label>
                <label className="mt-3 block text-xs text-[#5C5854]">
                  Instrucciones del negocio
                  <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={5} maxLength={4000} placeholder="Describe qué ofreces, precios, horarios y cuándo debe intervenir una persona." className="mt-1 w-full rounded-xl border border-[#E7E2DA] px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
                </label>
                <button type="submit" className="mt-3 rounded-xl bg-[#1E1E24] px-4 py-2 text-sm font-medium text-white">Guardar ajustes</button>
              </form>
            </div>
          </div>
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-[#D6D0C8] bg-white p-8 text-center">
          <MessageCircle className="mx-auto size-8 text-[#16A34A]" />
          <h2 className="mt-3 font-semibold text-[#1E1E24]">Vincula tu número de WhatsApp Business</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#5C5854]">
            La coexistencia oficial conserva la app del teléfono y conecta LYRA con la Cloud API de Meta. Meta mostrará una confirmación/código durante el alta; no se usa una sesión QR de WhatsApp Web.
          </p>
        </section>
      )}
    </div>
  );
}
