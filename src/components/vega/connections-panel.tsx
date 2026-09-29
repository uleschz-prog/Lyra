"use client";

import {
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  Camera,
  CreditCard,
  FolderOpen,
  Mail,
  MessageCircle,
  Plug,
  ThumbsUp,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { sheetClass } from "@/components/vega/sheet";
import { connectVegaApp, disconnectVegaApp, vegaConnections } from "@/app/dashboard/super-agent/actions";
import { toolkitHints, toolkitLabels, type UserToolkit, type VegaConnections } from "@/lib/vega/apps";

type Status = { available: boolean; connections: VegaConnections };

const groups: { title: string; apps: { id: UserToolkit; icon: LucideIcon }[] }[] = [
  {
    title: "Correo y agenda",
    apps: [
      { id: "gmail", icon: Mail },
      { id: "googlecalendar", icon: CalendarDays },
      { id: "calendly", icon: CalendarCheck },
      { id: "zoom", icon: Video },
    ],
  },
  { title: "Mensajes", apps: [{ id: "whatsapp", icon: MessageCircle }] },
  { title: "Archivos", apps: [{ id: "googledrive", icon: FolderOpen }] },
  {
    title: "Redes sociales",
    apps: [
      { id: "instagram", icon: Camera },
      { id: "facebook", icon: ThumbsUp },
      { id: "linkedin", icon: BriefcaseBusiness },
    ],
  },
  { title: "Cobros", apps: [{ id: "stripe", icon: CreditCard }] },
];

export function ConnectionsPanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<UserToolkit | null>(null);

  useEffect(() => {
    let alive = true;
    void vegaConnections().then((value) => {
      if (alive) setStatus(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function connect(toolkit: UserToolkit) {
    setBusy(toolkit);
    const result = await connectVegaApp(toolkit).catch(() => ({ ok: false as const, error: "No se pudo abrir la conexión." }));
    if (result.ok) {
      window.location.assign(result.url);
      return;
    }
    setBusy(null);
    toast.error(result.error);
  }

  async function disconnect(toolkit: UserToolkit) {
    const label = toolkitLabels[toolkit];
    if (!window.confirm(`¿Desconectar ${label}? Vega Bot dejará de tener acceso.`)) return;
    setBusy(toolkit);
    const result = await disconnectVegaApp(toolkit);
    setBusy(null);
    if (!result.ok) {
      toast.error("No se pudo desconectar. Intenta de nuevo.");
      return;
    }
    setStatus((current) => (current ? { ...current, connections: { ...current.connections, [toolkit]: false } } : current));
    toast.success(`${label} desconectado`);
  }

  return (
    <div className={sheetClass}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24]">
          <Plug className="size-4 text-[#7C3AED]" />
          Conexiones
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#8A8680]" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      {!status ? (
        <p className="mt-4 text-sm text-[#8A8680]">Revisando…</p>
      ) : !status.available ? (
        <p className="mt-4 text-sm text-[#8A8680]">Las conexiones no están disponibles por ahora.</p>
      ) : (
        <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-[#A8A29E] uppercase">{group.title}</p>
              <ul className="space-y-1.5">
                {group.apps.map((app) => {
                  const connected = status.connections[app.id];
                  const Icon = app.icon;
                  return (
                    <li key={app.id} className="rounded-xl border border-[#F0ECE6] px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <Icon className="size-4.5 shrink-0 text-[#5C5854]" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#1E1E24]">
                            {toolkitLabels[app.id]}
                            {connected ? <span className="ml-1.5 text-xs font-normal text-[#067647]">· Conectado</span> : null}
                          </p>
                          <p className="text-xs leading-4 text-[#8A8680]">{toolkitHints[app.id]}</p>
                        </div>
                        {connected ? (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void disconnect(app.id)}
                            className="shrink-0 rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs font-medium text-[#1E1E24] disabled:opacity-50"
                          >
                            Quitar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void connect(app.id)}
                            className="shrink-0 rounded-lg bg-[#1E1E24] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          >
                            {busy === app.id ? "Abriendo…" : "Conectar"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-4 text-[#A8A29E]">
        Cada cuenta es tuya y privada. Vega Bot nunca envía, publica, agenda ni cobra nada sin que lo confirmes.
      </p>
    </div>
  );
}
