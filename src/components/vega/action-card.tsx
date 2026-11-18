"use client";

import {
  Check,
  Copy,
  CreditCard,
  FileText,
  Link2,
  Mail,
  Megaphone,
  MessageCircle,
  ShieldAlert,
  Sheet,
  Terminal,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { connectVegaApp, decideVegaAction } from "@/app/dashboard/super-agent/actions";
import { BuildCard, buildRefOf } from "@/components/vega/build-card";
import { JobCard } from "@/components/vega/job-card";
import { ProjectCard } from "@/components/vega/project-card";
import type { AppOp } from "@/lib/vega/app-tools";
import type { ProjectDraft } from "@/lib/vega/build-project";
import type { VegaActionView } from "@/lib/vega/events";
import type { AppDraft, CommandDraft, ConnectDraft, EmailDraft, EventDraft, WhatsappDraft } from "@/lib/vega/tools";

const appIcons: Record<AppOp, LucideIcon> = {
  sheet_append: Sheet,
  doc_create: FileText,
  zoom_meeting: Video,
  social_post: Megaphone,
  payment_link: CreditCard,
  whatsapp_send: MessageCircle,
};

function when(value: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return `${label}, ${time.slice(0, 5)}`;
}

function WhatsappCard({
  action,
  onChange,
}: {
  action: VegaActionView;
  onChange: (action: VegaActionView, message: string) => void;
}) {
  const draft = action.payload as WhatsappDraft;
  const [text, setText] = useState(draft.text);
  const href = `https://wa.me/${draft.phone ?? ""}?text=${encodeURIComponent(text)}`;

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => null);
    toast.success("Mensaje copiado");
  }

  function opened() {
    if (action.status !== "pending") return;
    void decideVegaAction(action.id, true)
      .then((result) => {
        if (result.action) onChange(result.action, result.message);
      })
      .catch(() => null);
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9]">
      <div className="flex items-center gap-2 border-b border-[#F0ECE6] px-4 py-2.5 text-xs font-medium text-[#5C5854]">
        <MessageCircle className="size-4 text-[#16A34A]" />
        {draft.name || draft.phone
          ? `WhatsApp para ${draft.name ?? ""}${draft.name && draft.phone ? " · " : ""}${draft.phone ? `+${draft.phone}` : ""}`
          : "Mensaje de WhatsApp listo"}
      </div>
      <div className="px-4 py-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={Math.min(10, Math.max(3, text.split("\n").length + 1))}
          className="w-full resize-none rounded-lg bg-white p-3 text-base text-[#252525] outline-none sm:text-sm focus:ring-1 focus:ring-[#C4B5FD]"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#F0ECE6] px-4 py-2.5">
        <p className="text-xs text-[#8A8680]">
          {action.status === "done" ? "Abierto en WhatsApp" : draft.phone ? "Se envía desde tu WhatsApp" : "Eliges el contacto al abrir WhatsApp"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-xs font-medium text-[#1E1E24]"
          >
            <Copy className="size-3.5" />
            Copiar
          </button>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={opened}
            className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-3 py-1.5 text-xs font-medium text-white"
          >
            <MessageCircle className="size-3.5" />
            Abrir en WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

export function ActionCard({
  action,
  onChange,
  onSuggest,
}: {
  action: VegaActionView;
  onChange: (action: VegaActionView, message: string) => void;
  onSuggest?: (text: string) => void;
}) {
  if (action.kind === "background_job") return <JobCard action={action} onChange={onChange} />;
  if (action.kind === "connect_app") return <ConnectCard draft={action.payload as ConnectDraft} />;
  if (action.kind === "whatsapp_message") return <WhatsappCard action={action} onChange={onChange} />;
  if (action.kind === "deliver_project") {
    // PR C: generador v2. Si falló sin respaldo guardado, se muestra la versión v1 del chat.
    const build = buildRefOf(action.payload);
    const editing = Boolean((action.payload as { edit?: unknown }).edit);
    if (build && (editing || build.status !== "failed" || build.projectId)) return <BuildCard action={action} onChange={onChange} onSuggest={onSuggest} />;
    if (editing) {
      return (
        <div className="mt-3 rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] px-4 py-3 text-sm text-[#5C5854]">
          {action.result || "No se pudo editar el proyecto."} No se cobraron créditos.
        </div>
      );
    }
    return <ProjectCard project={action.payload as ProjectDraft} actionId={action.id} onSuggest={onSuggest} />;
  }
  // P1: imágenes y videos se retiraron; los historiales viejos muestran un aviso, sin botones.
  if (action.kind === "create_image" || action.kind === "create_video") return <RetiredMediaCard kind={action.kind} />;
  return <ConfirmCard action={action} onChange={onChange} />;
}

function RetiredMediaCard({ kind }: { kind: "create_image" | "create_video" }) {
  return (
    <div className="mt-3 rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] px-4 py-3 text-xs text-[#8A8680]">
      {kind === "create_image" ? "Esta imagen" : "Este video"} se creó con una función que ya no está disponible en LYRA.
    </div>
  );
}

function ConfirmCard({
  action,
  onChange,
}: {
  action: VegaActionView;
  onChange: (action: VegaActionView, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const email = action.kind === "send_email" ? (action.payload as EmailDraft) : null;
  const event = action.kind === "create_event" ? (action.payload as EventDraft) : null;
  const app = action.kind === "app_action" ? (action.payload as AppDraft) : null;
  const command = action.kind === "run_command" ? (action.payload as CommandDraft) : null;
  const AppIcon = app ? appIcons[app.op] : Mail;
  const HeaderIcon = command ? Terminal : AppIcon;
  const headerLabel = app
    ? app.title
    : email
      ? "Correo listo para enviar desde tu Gmail"
      : command
        ? `Comando del servidor: ${command.label}`
        : "Evento listo para tu Google Calendar";
  const confirmLabel = app
    ? app.confirm
    : email
      ? "Enviar correo"
      : command
        ? "Ejecutar comando"
        : "Crear evento";

  async function decide(confirm: boolean) {
    setBusy(true);
    const result = await decideVegaAction(action.id, confirm).catch(() => ({
      ok: false,
      action: undefined,
      message: "No se pudo completar. Intenta de nuevo.",
    }));
    setBusy(false);
    if (result.action) onChange(result.action, result.message);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  }

  const statusText: Record<VegaActionView["status"], string> = {
    pending: "Esperando tu confirmación",
    running: "Enviando…",
    done: action.result?.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") ?? "Hecho",
    failed: action.result ?? "No se completó",
    cancelled: "Cancelado",
    expired: "Venció sin confirmación. No se envió nada.",
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9]">
      <div className="flex items-center gap-2 border-b border-[#F0ECE6] px-4 py-2.5 text-xs font-medium text-[#5C5854]">
        {app ? (
          <AppIcon className="size-4 text-[#7C3AED]" />
        ) : email ? (
          <Mail className="size-4 text-[#7C3AED]" />
        ) : (
          <HeaderIcon className="size-4 text-[#7C3AED]" />
        )}
        {headerLabel}
      </div>
      {action.status === "pending" && (action.risk === "send" || action.tainted) ? (
        <div className="flex items-start gap-2 border-b border-[#F0ECE6] bg-[#FFFAEB] px-4 py-2 text-xs text-[#93370D]">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {action.risk === "send" ? "Esto sale a otras personas o no se puede deshacer. Revisa destinatario y contenido antes de confirmar." : ""}
            {action.risk === "send" && action.tainted ? " " : ""}
            {action.tainted ? "Vega leyó correos, páginas u hojas de terceros en este turno: confirma solo si tú lo pediste." : ""}
          </span>
        </div>
      ) : null}
      <div className="space-y-1.5 px-4 py-3 text-sm text-[#1E1E24]">
        {app ? (
          <>
            {app.lines.map((line) => (
              <p key={line.label} className="break-words">
                <span className="text-[#8A8680]">{line.label}:</span> {line.value}
              </p>
            ))}
            {app.body ? (
              <p className="max-h-60 overflow-y-auto rounded-lg bg-white p-3 whitespace-pre-wrap text-[#252525]">{app.body}</p>
            ) : null}
          </>
        ) : email ? (
          <>
            <p>
              <span className="text-[#8A8680]">Para:</span> {email.to}
              {email.cc?.length ? <span className="text-[#8A8680]"> · CC: {email.cc.join(", ")}</span> : null}
            </p>
            <p>
              <span className="text-[#8A8680]">Asunto:</span> {email.subject}
            </p>
            <p className="max-h-48 overflow-y-auto rounded-lg bg-white p-3 whitespace-pre-wrap text-[#252525]">{email.body}</p>
          </>
        ) : event ? (
          <>
            <p className="font-medium">{event.title}</p>
            <p className="text-[#5C5854]">
              {when(event.start)} a {event.end.split("T")[1]?.slice(0, 5)} · hora de Ciudad de México
            </p>
            {event.location ? <p className="text-[#5C5854]">Lugar: {event.location}</p> : null}
            {event.attendees?.length ? <p className="text-[#5C5854]">Invitados: {event.attendees.join(", ")}</p> : null}
            {event.meet ? <p className="text-[#5C5854]">Con enlace de Google Meet</p> : null}
            {event.description ? <p className="whitespace-pre-wrap text-[#5C5854]">{event.description}</p> : null}
          </>
        ) : command ? (
          <>
            <p className="font-medium">{command.label}</p>
            <p className="text-[#5C5854]">Vega ejecutará este comando de solo lectura y te mostrará el resultado.</p>
          </>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#F0ECE6] px-4 py-2.5">
        <p
          className={
            action.status === "done"
              ? "text-xs text-[#067647]"
              : action.status === "failed"
                ? "text-xs text-[#B42318]"
                : "text-xs text-[#8A8680]"
          }
        >
          {statusText[action.status]}
        </p>
        {action.status === "pending" ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide(false)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-xs font-medium text-[#1E1E24] disabled:opacity-50"
            >
              <X className="size-3.5" />
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              <Check className="size-3.5" />
              {busy ? "Enviando…" : confirmLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConnectCard({ draft }: { draft: ConnectDraft }) {
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    const result = await connectVegaApp(draft.toolkit).catch(() => ({ ok: false as const, error: "No se pudo preparar la conexión." }));
    setBusy(false);
    if (result.ok) window.location.href = result.url;
    else toast.error(result.error);
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9]">
      <div className="flex items-center gap-2 border-b border-[#F0ECE6] px-4 py-2.5 text-xs font-medium text-[#5C5854]">
        <Link2 className="size-4 text-[#7C3AED]" />
        {draft.reconnect ? `Vuelve a conectar ${draft.label}` : `Conecta ${draft.label}`}
      </div>
      <p className="px-4 py-3 text-sm text-[#1E1E24]">{draft.reason}</p>
      <div className="flex items-center justify-between gap-2 border-t border-[#F0ECE6] px-4 py-2.5">
        <p className="text-xs text-[#8A8680]">Lo que Vega envíe o publique por ti siempre te lo pregunta antes.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void connect()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          <Link2 className="size-3.5" />
          {busy ? "Abriendo…" : draft.reconnect ? "Reconectar" : "Conectar"}
        </button>
      </div>
    </div>
  );
}
