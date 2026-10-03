"use client";

import {
  Activity,
  Bot,
  Check,
  Copy,
  Link2,
  Megaphone,
  Pause,
  Play,
  Plug,
  RefreshCw,
  Send,
  ShieldCheck,
  Unplug,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  connectTelegram,
  disconnectTelegram,
  replyTelegramChat,
  saveTelegramSettings,
  sendTelegramTest,
  setTelegramChatAutomation,
  telegramChatMessages,
  telegramDeepLink,
  telegramOverview,
  telegramOwnerLink,
  verifyTelegram,
  type TelegramMessageView,
  type TelegramOverview,
} from "@/app/dashboard/telegram/actions";
import { cn } from "@/lib/utils";

const statusText: Record<string, { label: string; tone: string }> = {
  active: { label: "Conectado", tone: "bg-[#ECFDF3] text-[#067647]" },
  pending: { label: "Configurando", tone: "bg-[#FFF7E6] text-[#B54708]" },
  paused: { label: "En pausa", tone: "bg-[#F2F4F7] text-[#475467]" },
  error: { label: "Con error", tone: "bg-[#FEF3F2] text-[#B42318]" },
};

const automationText: Record<string, string> = {
  active: "Agente activo",
  paused_by_human: "Lo atiendes tú",
  paused_by_contact: "Pidió la baja",
  escalated: "Pide hablar contigo",
  closed: "Cerrada",
};

const stageText: Record<string, string> = {
  nuevo: "Nuevo",
  interesado: "Interesado",
  calificado: "Calificado",
  cita: "Cita",
  cliente: "Cliente",
  perdido: "Perdido",
};

const card = "rounded-2xl border border-[#E7E2DA] bg-white p-5";

function when(iso: string | null) {
  if (!iso) return "Todavía no";
  return new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
}

async function copy(text: string, label = "Copiado") {
  await navigator.clipboard.writeText(text).catch(() => null);
  toast.success(label);
}

function Connect({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const steps = [
    "Abre Telegram y busca @BotFather (con la palomita azul).",
    "Escribe /newbot.",
    "Elige el nombre visible de tu bot, por ejemplo «Asistente de Ana».",
    "Elige un usuario que termine en bot, por ejemplo ana_ventas_bot.",
    "Copia el token que te entrega BotFather.",
    "Pégalo aquí y presiona Conectar.",
    "Abre tu bot y presiona Iniciar para probarlo.",
  ];

  async function submit() {
    setBusy(true);
    const result = await connectTelegram(token);
    setBusy(false);
    setToken("");
    if (result.ok) {
      toast.success(`Listo, @${result.connection.botUsername} ya atiende en Telegram`);
      onDone();
    } else {
      toast.error(result.error);
      if ("connection" in result) onDone();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <section className={card}>
        <p className="text-[11px] font-medium tracking-[0.2em] text-[#7C3AED] uppercase">Paso a paso</p>
        <h2 className="mt-2 text-lg font-semibold text-[#1E1E24]">Crea tu bot con BotFather</h2>
        <ol className="mt-4 space-y-2.5">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm text-[#3F3B37]">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#F3EEFF] text-xs font-semibold text-[#7C3AED]">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>
      <section className={cn(card, "flex flex-col")}>
        <p className="text-[11px] font-medium tracking-[0.2em] text-[#7C3AED] uppercase">Conectar</p>
        <h2 className="mt-2 text-lg font-semibold text-[#1E1E24]">Pega el token de tu bot</h2>
        <p className="mt-1 text-sm text-[#5C5854]">LYRA lo valida con Telegram y lo guarda cifrado. Nadie vuelve a verlo, ni tú.</p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="123456789:AAH…"
            className="rounded-xl border border-[#E7E2DA] bg-[#FCFBF9] px-4 py-3 font-mono text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]"
          />
          <button
            type="submit"
            disabled={busy || token.trim().length < 30}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plug className="size-4" />
            {busy ? "Conectando…" : "Conectar"}
          </button>
        </form>
        <p className="mt-auto flex items-start gap-2 pt-4 text-xs text-[#8A8680]">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#7C3AED]" />
          Cada bot pertenece a una sola cuenta. Tus prospectos, conversaciones y datos quedan separados de los de otros socios.
        </p>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
      <Icon className="size-4 text-[#7C3AED]" />
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#1E1E24]">{value.toLocaleString("es-MX")}</p>
      <p className="text-xs text-[#8A8680]">{label}</p>
    </div>
  );
}

function Conversations({ overview, onChange }: { overview: TelegramOverview; onChange: () => void }) {
  const [selected, setSelected] = useState<string | null>(overview.chats[0]?.id ?? null);
  const [messages, setMessages] = useState<TelegramMessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const chat = overview.chats.find((item) => item.id === selected) ?? null;

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    void telegramChatMessages(selected).then((rows) => {
      if (alive) setMessages(rows);
    });
    return () => {
      alive = false;
    };
  }, [selected]);

  async function reply() {
    if (!chat) return;
    setBusy(true);
    const result = await replyTelegramChat(chat.id, draft);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDraft("");
    setMessages(await telegramChatMessages(chat.id));
    onChange();
  }

  async function toggle(active: boolean) {
    if (!chat) return;
    const result = await setTelegramChatAutomation(chat.id, active);
    if (!result.ok) toast.error(result.error);
    else toast.success(active ? "El agente vuelve a atender este chat" : "Pausaste el agente en este chat");
    onChange();
  }

  if (!overview.chats.length) {
    return (
      <section className={cn(card, "text-center")}>
        <Users className="mx-auto size-6 text-[#C4B5FD]" />
        <p className="mt-2 text-sm font-medium text-[#1E1E24]">Aún no tienes conversaciones</p>
        <p className="mt-1 text-sm text-[#5C5854]">Comparte un enlace de campaña. Cada persona que presione Iniciar aparece aquí como prospecto.</p>
      </section>
    );
  }

  return (
    <section className="grid overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white lg:grid-cols-[300px_1fr]">
      <ul className="max-h-[520px] overflow-y-auto border-b border-[#F0ECE6] lg:border-r lg:border-b-0">
        {overview.chats.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setSelected(item.id)}
              className={cn("w-full px-4 py-3 text-left transition-colors hover:bg-[#FAF8F5]", item.id === selected && "bg-[#F6F2FF]")}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-[#1E1E24]">{item.name}</p>
                <span className="shrink-0 text-[10px] text-[#8A8680]">{when(item.lastAt)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-[#5C5854]">{item.lastText || "Sin mensajes"}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="rounded-full bg-[#F3EEFF] px-2 py-0.5 text-[10px] font-medium text-[#6D28D9]">{stageText[item.stage] ?? item.stage}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", item.automation === "escalated" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#F2F4F7] text-[#475467]")}>
                  {automationText[item.automation] ?? item.automation}
                </span>
                {item.campaign ? <span className="rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[10px] text-[#067647]">{item.campaign}</span> : null}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {chat ? (
        <div className="flex min-h-[420px] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0ECE6] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#1E1E24]">{chat.name}</p>
              <p className="text-xs text-[#8A8680]">
                {chat.username ? `@${chat.username} · ` : ""}
                {chat.intent ?? "Sin intención registrada"}
                {chat.isBlocked ? " · Bloqueó al bot" : ""}
              </p>
            </div>
            {chat.automation === "active" ? (
              <button type="button" onClick={() => void toggle(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-medium text-[#1E1E24]">
                <Pause className="size-3.5" />
                Pausar agente
              </button>
            ) : chat.optedIn ? (
              <button type="button" onClick={() => void toggle(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white">
                <Play className="size-3.5" />
                Reactivar agente
              </button>
            ) : null}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-[#FCFBF9] px-4 py-4" style={{ maxHeight: 400 }}>
            {messages.map((message) => (
              <div key={message.id} className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                    message.direction === "outbound" ? "bg-[#7C3AED] text-white" : "border border-[#E7E2DA] bg-white text-[#1E1E24]",
                  )}
                >
                  {message.text}
                  <p className={cn("mt-1 text-[10px]", message.direction === "outbound" ? "text-white/70" : "text-[#8A8680]")}>
                    {message.direction === "outbound" ? (message.senderType === "human" ? "Tú" : message.senderType === "system" ? "Sistema" : "Agente") : "Contacto"} ·{" "}
                    {when(message.createdAt)}
                    {message.status === "failed" ? " · no entregado" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <form
            className="flex gap-2 border-t border-[#F0ECE6] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void reply();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={chat.isBlocked}
              placeholder={chat.isBlocked ? "El contacto bloqueó al bot" : "Responde tú; el agente se pausa en este chat"}
              className="min-w-0 flex-1 rounded-xl border border-[#E7E2DA] bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED]"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E1E24] px-4 text-sm font-medium text-white disabled:opacity-50">
              <Send className="size-4" />
              Enviar
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export function TelegramWorkspace({ initial }: { initial: TelegramOverview }) {
  const [overview, setOverview] = useState(initial);
  const [instructions, setInstructions] = useState(initial.connection?.instructions ?? "");
  const [campaign, setCampaign] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const connection = overview.connection;

  async function refresh() {
    const next = await telegramOverview();
    setOverview(next);
    if (next.connection && busy !== "save") setInstructions(next.connection.instructions);
  }

  async function run(key: string, task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(key);
    const result = await task().catch(() => ({ ok: false, error: "No se pudo completar." }));
    setBusy(null);
    if (result.ok) toast.success(success);
    else toast.error(result.error ?? "No se pudo completar.");
    await refresh();
  }

  async function link() {
    const result = await telegramOwnerLink();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
    toast.success("Abre el enlace en Telegram y presiona Iniciar");
  }

  async function createLink() {
    const result = await telegramDeepLink(campaign);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLastLink(result.url);
    setCampaign("");
    await copy(result.url, "Enlace copiado");
  }

  if (!overview.allowed) {
    return (
      <section className={cn(card, "text-center")}>
        <Bot className="mx-auto size-7 text-[#7C3AED]" />
        <h2 className="mt-3 text-lg font-semibold text-[#1E1E24]">Tu bot de ventas en Telegram</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#5C5854]">Está incluido en Negocio, Pro y Corporate. Atiende prospectos, captura campañas y te pasa la conversación cuando alguien quiere comprar.</p>
      </section>
    );
  }

  if (!connection) return <Connect onDone={() => void refresh()} />;

  const status = statusText[connection.status] ?? statusText.error;

  return (
    <div className="space-y-4">
      <section className={cn(card, "flex flex-wrap items-center justify-between gap-4")}>
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#229ED9] text-white">
            <Send className="size-5 -rotate-12" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <a href={`https://t.me/${connection.botUsername}`} target="_blank" rel="noreferrer" className="text-base font-semibold text-[#1E1E24] hover:text-[#7C3AED]">
                @{connection.botUsername}
              </a>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status.tone)}>{status.label}</span>
            </div>
            <p className="text-xs text-[#8A8680]">
              {connection.botName} · conectado {when(connection.createdAt)} · último mensaje {when(connection.lastWebhookAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void run("verify", verifyTelegram, "El bot está funcionando")} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            <RefreshCw className={cn("size-3.5", busy === "verify" && "animate-spin")} />
            Verificar
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void run("test", sendTelegramTest, "Te envié un mensaje de prueba")} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            <Send className="size-3.5" />
            Enviar prueba
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("pause", () => saveTelegramSettings({ paused: connection.status !== "paused" }), connection.status === "paused" ? "Bot reactivado" : "Bot en pausa")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {connection.status === "paused" ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {connection.status === "paused" ? "Reactivar" : "Pausar"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm("¿Desconectar el bot? Las conversaciones quedan guardadas y los seguimientos se cancelan.")) {
                void run("disconnect", disconnectTelegram, "Bot desconectado");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#FDA29B] px-3 py-1.5 text-xs font-medium text-[#B42318] disabled:opacity-50"
          >
            <Unplug className="size-3.5" />
            Desconectar
          </button>
        </div>
        {connection.lastError ? <p className="w-full rounded-xl bg-[#FEF3F2] px-3 py-2 text-xs text-[#B42318]">{connection.lastError}</p> : null}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={Users} label="Prospectos" value={overview.stats.chats} />
        <Stat icon={UserRound} label="Nuevos en 7 días" value={overview.stats.leads7d} />
        <Stat icon={Activity} label="Mensajes recibidos (7 días)" value={overview.stats.inbound7d} />
        <Stat icon={Send} label="Respuestas enviadas (7 días)" value={overview.stats.outbound7d} />
        <Stat icon={Megaphone} label="Piden hablar contigo" value={overview.stats.escalated} />
        <Stat icon={Pause} label="Bajas" value={overview.stats.optOuts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className={card}>
          <h2 className="text-base font-semibold text-[#1E1E24]">Instrucciones del agente</h2>
          <p className="mt-1 text-sm text-[#5C5854]">Qué vendes, precios, horarios, enlaces y cómo quieres que hable. El agente solo usa lo que escribas aquí.</p>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={8}
            maxLength={4000}
            placeholder="Ejemplo: Vendo la membresía Negocio de LYRA a $99 USD. Explica que incluye 1,500 créditos y agentes. Si quieren inscribirse, pásame la conversación. Horario: lunes a sábado de 9 a 8."
            className="mt-3 w-full rounded-xl border border-[#E7E2DA] bg-[#FCFBF9] p-3 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED]"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4 text-sm text-[#3F3B37]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={connection.automation} onChange={(event) => void run("auto", () => saveTelegramSettings({ automation: event.target.checked }), event.target.checked ? "El agente responde solo" : "El agente dejó de responder")} className="accent-[#7C3AED]" />
                Responder automáticamente
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={connection.followups} onChange={(event) => void run("follow", () => saveTelegramSettings({ followups: event.target.checked }), event.target.checked ? "Seguimientos activados" : "Seguimientos desactivados")} className="accent-[#7C3AED]" />
                Seguimientos automáticos
              </label>
            </div>
            <button type="button" disabled={busy !== null} onClick={() => void run("save", () => saveTelegramSettings({ instructions }), "Instrucciones guardadas")} className="inline-flex items-center gap-1.5 rounded-xl bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              <Check className="size-4" />
              Guardar
            </button>
          </div>
          <p className="mt-3 text-xs text-[#8A8680]">Cada respuesta automática o seguimiento cuesta 1 crédito. Los seguimientos salen a las 24 horas y a los 3 días sin respuesta, entre 9:00 y 21:00, y se cancelan en cuanto el contacto escribe o manda /stop.</p>
        </section>

        <div className="space-y-4">
          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#1E1E24]">
              <UserRound className="size-4 text-[#7C3AED]" />
              Tu Telegram
            </h2>
            <p className="mt-1 text-sm text-[#5C5854]">
              {connection.ownerLinked
                ? "Vinculado. Te aviso de prospectos nuevos y de quienes pidan hablar contigo; con Pro o Corporate, escríbele a tu bot y te responde Vega Bot."
                : "Vincúlate para recibir avisos y, con Pro o Corporate, platicar con Vega Bot desde tu bot."}
            </p>
            <button type="button" onClick={() => void link()} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[#E7E2DA] px-3 py-2 text-sm font-medium text-[#1E1E24]">
              <Link2 className="size-4" />
              {connection.ownerLinked ? "Vincular otra vez" : "Vincular mi Telegram"}
            </button>
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#1E1E24]">
              <Megaphone className="size-4 text-[#7C3AED]" />
              Enlaces de campaña
            </h2>
            <p className="mt-1 text-sm text-[#5C5854]">Un enlace por anuncio o publicación. Cada prospecto queda etiquetado con su campaña.</p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void createLink();
              }}
            >
              <input
                value={campaign}
                onChange={(event) => setCampaign(event.target.value)}
                maxLength={64}
                placeholder="facebook_septiembre"
                className="min-w-0 flex-1 rounded-xl border border-[#E7E2DA] bg-[#FCFBF9] px-3 py-2 text-sm outline-none focus:border-[#7C3AED]"
              />
              <button type="submit" disabled={!campaign.trim()} className="rounded-xl bg-[#1E1E24] px-3 text-sm font-medium text-white disabled:opacity-50">
                Crear
              </button>
            </form>
            {lastLink ? (
              <button type="button" onClick={() => void copy(lastLink)} className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-[#F6F2FF] px-3 py-2 text-left text-xs text-[#6D28D9]">
                <span className="truncate">{lastLink}</span>
                <Copy className="size-3.5 shrink-0" />
              </button>
            ) : null}
            {overview.campaigns.length ? (
              <ul className="mt-3 space-y-1.5">
                {overview.campaigns.slice(0, 6).map((item) => (
                  <li key={item.code} className="flex items-center justify-between gap-2 text-sm">
                    <button type="button" onClick={() => void copy(`https://t.me/${connection.botUsername}?start=${item.code}`, "Enlace copiado")} className="flex min-w-0 items-center gap-1.5 text-[#1E1E24] hover:text-[#7C3AED]">
                      <Copy className="size-3.5 shrink-0 text-[#8A8680]" />
                      <span className="truncate">{item.code}</span>
                    </button>
                    <span className="shrink-0 text-xs text-[#8A8680]">{item.chats} prospecto{item.chats === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-[#1E1E24]">Conversaciones</h2>
        <Conversations key={overview.chats.length} overview={overview} onChange={() => void refresh()} />
      </div>
    </div>
  );
}
