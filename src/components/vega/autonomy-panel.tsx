"use client";

import { Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { updateVegaAutonomy, vegaAutonomy } from "@/app/dashboard/super-agent/actions";
import type { AutonomySettings } from "@/lib/vega/autonomy";
import { sheetClass } from "@/components/vega/sheet";

// Correos, WhatsApp, publicaciones, cobros e invitaciones son envíos: siempre se confirman (no hay interruptor).
const toggles: { key: "events" | "appActions"; label: string; hint: string }[] = [
  { key: "events", label: "Agendar eventos", hint: "Eventos sin invitados en tu Google Calendar (con invitados siempre te pregunta)" },
  { key: "appActions", label: "Acciones en tus apps", hint: "Agregar filas a tus hojas, crear documentos y reuniones de Zoom" },
];

export function AutonomyPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AutonomySettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void vegaAutonomy().then((loaded) => {
      if (alive) setSettings(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    if (!settings || busy) return;
    setBusy(true);
    const result = await updateVegaAutonomy(settings);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Reglas de autonomía guardadas");
  }

  return (
    <div className={sheetClass}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24]">
          <ShieldCheck className="size-4 text-[#7C3AED]" />
          Autonomía de Vega
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#8A8680]" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#8A8680]">
        Lo que Vega puede ejecutar sin pedirte confirmación. Solo de 9:00 a 21:00 (Ciudad de México) y dentro de tu tope diario.
      </p>

      {settings === null ? (
        <p className="mt-4 text-sm text-[#8A8680]">Cargando…</p>
      ) : (
        <>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-[#E7E2DA] px-3 py-2.5">
              <span className="text-sm font-medium text-[#1E1E24]">Autonomía activada</span>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
                className="size-4 accent-[#7C3AED]"
              />
            </label>
            {toggles.map(({ key, label, hint }) => (
              <label
                key={key}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                  settings.enabled ? "border-[#E7E2DA]" : "border-[#F0ECE6] opacity-50"
                }`}
              >
                <span>
                  <span className="block text-sm font-medium text-[#1E1E24]">{label}</span>
                  <span className="block text-xs text-[#8A8680]">{hint}</span>
                </span>
                <input
                  type="checkbox"
                  disabled={!settings.enabled}
                  checked={settings[key]}
                  onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })}
                  className="size-4 accent-[#7C3AED]"
                />
              </label>
            ))}
            <p className="flex items-start gap-2 rounded-lg bg-[#F5F3FF] px-3 py-2 text-xs leading-5 text-[#5B21B6]">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Correos, mensajes de WhatsApp, publicaciones, enlaces de pago e invitaciones siempre te piden confirmar, aunque actives la autonomía.
            </p>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-[#E7E2DA] px-3 py-2.5">
              <span className="text-sm font-medium text-[#1E1E24]">Tope diario de acciones</span>
              <input
                type="number"
                min={1}
                max={20}
                value={settings.dailyLimit}
                onChange={(event) => setSettings({ ...settings, dailyLimit: Number(event.target.value) })}
                disabled={!settings.enabled}
                className="w-16 rounded-md border border-[#E7E2DA] px-2 py-1 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED] disabled:opacity-50"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1E1E24] text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Guardar reglas
          </button>
        </>
      )}
    </div>
  );
}
