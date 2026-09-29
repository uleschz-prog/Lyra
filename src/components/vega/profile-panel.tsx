"use client";

import { Loader2, Save, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { updateVegaProfile, vegaProfile } from "@/app/dashboard/super-agent/actions";
import { sheetClass } from "@/components/vega/sheet";
import type { VegaProfile } from "@/lib/vega/profile";

const fields: { key: keyof VegaProfile; label: string; placeholder: string }[] = [
  { key: "business", label: "Negocio", placeholder: "¿Qué vendes o haces? p. ej. «Suplementos en Guadalajara»" },
  { key: "goals", label: "Metas", placeholder: "p. ej. «20 socios activos este año»" },
  { key: "services", label: "Productos o servicios", placeholder: "p. ej. «Proteína, pre-entreno, asesoría»" },
  { key: "markets", label: "Mercados o nichos", placeholder: "p. ej. «Gym bros, mamás fitness»" },
  { key: "tone", label: "Tono preferido", placeholder: "p. ej. «Cercano y directo, sin emojis»" },
  { key: "hours", label: "Horarios", placeholder: "p. ej. «Lunes a viernes, 9 a 6»" },
  { key: "team", label: "Personas clave", placeholder: "p. ej. «Ana (asistente), Luis (entrenador)»" },
  { key: "notes", label: "Notas", placeholder: "Cualquier otro contexto que Vega deba saber" },
];

const empty: VegaProfile = { business: null, goals: null, tone: null, markets: null, services: null, hours: null, team: null, notes: null };

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<VegaProfile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void vegaProfile().then((loaded) => {
      if (alive) setProfile(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    if (!profile || busy) return;
    setBusy(true);
    const result = await updateVegaProfile(profile);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Perfil guardado. Vega lo usa en todas tus conversaciones.");
  }

  return (
    <div className={sheetClass}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24]">
          <User className="size-4 text-[#7C3AED]" />
          Tu perfil en Vega
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#8A8680]" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#8A8680]">
        Vega lee estos datos en cada conversación para responder como conoce tu negocio. También los actualiza solo cuando se los cuentas.
      </p>

      {profile === null ? (
        <p className="mt-4 text-sm text-[#8A8680]">Cargando…</p>
      ) : (
        <>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {fields.map(({ key, label, placeholder }) => (
              <label key={key} className="block text-xs font-medium text-[#5C5854]">
                {label}
                <textarea
                  value={profile[key] ?? ""}
                  rows={2}
                  maxLength={2000}
                  onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                  placeholder={placeholder}
                  className="mt-1 w-full resize-none rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm text-[#1E1E24] outline-none placeholder:text-[#B0B0B0] focus:border-[#7C3AED]"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1E1E24] text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar perfil
          </button>
        </>
      )}
    </div>
  );
}