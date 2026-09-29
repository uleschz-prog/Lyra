import { getPrisma } from "@/lib/prisma";

export type VegaProfile = {
  business: string | null;
  goals: string | null;
  tone: string | null;
  markets: string | null;
  services: string | null;
  hours: string | null;
  team: string | null;
  notes: string | null;
};

export const profileFields: { key: keyof VegaProfile; label: string }[] = [
  { key: "business", label: "Negocio" },
  { key: "goals", label: "Metas" },
  { key: "tone", label: "Tono preferido" },
  { key: "markets", label: "Mercados o nichos" },
  { key: "services", label: "Productos o servicios" },
  { key: "hours", label: "Horarios y disponibilidad" },
  { key: "team", label: "Personas clave" },
  { key: "notes", label: "Notas de contexto" },
];

const clean = (value: string | null | undefined) => (value && value.trim().length > 0 ? value.trim().slice(0, 2000) : null);

export async function getVegaProfile(userId: string): Promise<VegaProfile> {
  const prisma = getPrisma();
  const row = await prisma.userProfile.findUnique({ where: { userId } });
  if (!row) return { business: null, goals: null, tone: null, markets: null, services: null, hours: null, team: null, notes: null };
  return {
    business: row.business,
    goals: row.goals,
    tone: row.tone,
    markets: row.markets,
    services: row.services,
    hours: row.hours,
    team: row.team,
    notes: row.notes,
  };
}

export async function saveVegaProfile(
  userId: string,
  input: Partial<VegaProfile>,
): Promise<{ ok: true; profile: VegaProfile } | { ok: false; error: string }> {
  const data = {
    ...(input.business !== undefined ? { business: clean(input.business) } : {}),
    ...(input.goals !== undefined ? { goals: clean(input.goals) } : {}),
    ...(input.tone !== undefined ? { tone: clean(input.tone) } : {}),
    ...(input.markets !== undefined ? { markets: clean(input.markets) } : {}),
    ...(input.services !== undefined ? { services: clean(input.services) } : {}),
    ...(input.hours !== undefined ? { hours: clean(input.hours) } : {}),
    ...(input.team !== undefined ? { team: clean(input.team) } : {}),
    ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
  };
  const prisma = getPrisma();
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return { ok: true, profile: await getVegaProfile(userId) };
}

/** Convierte el perfil en el bloque de contexto que Vega ve al inicio de cada turno. */
export function profilePrompt(profile: VegaProfile): string {
  const lines = profileFields
    .map(({ key, label }) => {
      const value = profile[key];
      return value ? `${label}: ${value}` : null;
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return "Todavía no tiene perfil estructurado (negocio, metas, tono). Si lo menciona en la conversación, invítalo a completarlo en el panel Perfil de Vega para responderle mejor.";
  }
  return ["Perfil del socio (contexto estructurado, actualízalo con la herramienta actualizar_perfil cuando cambie algo):", ...lines].join("\n");
}