export const HOME_TIMEZONE = "America/Mexico_City";

export type HomeActivity = {
  id: string;
  kind: "commission" | "credits" | "spend" | "rebuy" | "adjustment" | "referral";
  title: string;
  amount: number | null;
  credits: number | null;
  at: string;
};

export type TrendPoint = { day: string; value: number };

export type ActivityGroup = {
  id: string;
  kind: HomeActivity["kind"];
  title: string;
  count: number;
  amount: number | null;
  credits: number | null;
  at: string;
  items: HomeActivity[];
};

export type ActivityDay = {
  day: string;
  label: string;
  items: ActivityGroup[];
};

type TxLike = {
  kind: string;
  amount: unknown;
  creditDelta: number | null;
  createdAt: Date | string;
};

function hourInZone(now: Date, timeZone = HOME_TIMEZONE) {
  const hour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).formatToParts(now).find((part) => part.type === "hour")?.value ?? "0";
  return hour === "24" ? 0 : Number(hour);
}

function dayKey(iso: string | Date, timeZone = HOME_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function firstNameOf(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] || name;
}

/** Saludo según la hora en Ciudad de México. */
export function greetingFor(name: string, now = new Date(), timeZone = HOME_TIMEZONE) {
  const hour = hourInZone(now, timeZone);
  const first = firstNameOf(name);
  if (hour < 5 || hour >= 20) return `Buenas noches, ${first}`;
  if (hour < 12) return `Buenos días, ${first}`;
  return `Buenas tardes, ${first}`;
}

export function todayLabel(now = new Date(), timeZone = HOME_TIMEZONE) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now);
}

export function dayLabel(day: string, now = new Date(), timeZone = HOME_TIMEZONE) {
  const today = dayKey(now, timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);
  if (day === today) return "Hoy";
  if (day === yesterday) return "Ayer";
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone }).format(new Date(Date.UTC(year, month - 1, date, 18)));
}

function groupKey(item: HomeActivity) {
  const title = item.title.trim();
  if (item.kind === "spend" && /^Vega · mensaje$/i.test(title)) return "spend:vega-mensaje";
  if (item.kind === "spend" && /^Vega · herramienta$/i.test(title)) return "spend:vega-herramienta";
  if (item.kind === "spend" && /^Vega · recordatorio:/i.test(title)) return "spend:vega-recordatorio";
  return `${item.kind}:${title}`;
}

function groupedTitle(key: string, count: number, sample: string) {
  if (count === 1) return sample;
  if (key === "spend:vega-mensaje") return `Vega · ${count} mensajes`;
  if (key === "spend:vega-herramienta") return `Vega · ${count} herramientas`;
  if (key === "spend:vega-recordatorio") return `Vega · ${count} recordatorios`;
  return sample;
}

/** Agrupa la actividad por día (CDMX) y comprime eventos repetidos del mismo tipo. */
export function groupActivityByDay(items: HomeActivity[], now = new Date(), timeZone = HOME_TIMEZONE): ActivityDay[] {
  const days = new Map<string, HomeActivity[]>();
  const ordered = [...items].sort((left, right) => right.at.localeCompare(left.at));
  for (const item of ordered) {
    const day = dayKey(item.at, timeZone);
    const list = days.get(day) ?? [];
    list.push(item);
    days.set(day, list);
  }

  return [...days.entries()].map(([day, rows]) => {
    const groups: ActivityGroup[] = [];
    for (const item of rows) {
      const key = groupKey(item);
      const current = groups.find((group) => groupKey(group.items[0]) === key);
      if (!current || key.startsWith("referral:")) {
        groups.push({
          id: item.id,
          kind: item.kind,
          title: item.title,
          count: 1,
          amount: item.amount,
          credits: item.credits,
          at: item.at,
          items: [item],
        });
        continue;
      }
      current.count += 1;
      current.items.push(item);
      current.amount = current.items.reduce((sum, row) => sum + (row.amount ?? 0), 0) || null;
      current.credits = current.items.reduce((sum, row) => sum + (row.credits ?? 0), 0) || null;
      current.title = groupedTitle(key, current.count, current.items[0].title);
    }
    return { day, label: dayLabel(day, now, timeZone), items: groups };
  });
}

function lastDays(count: number, now: Date, timeZone = HOME_TIMEZONE) {
  const today = dayKey(now, timeZone);
  const [year, month, date] = today.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, date, 18));
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const point = new Date(cursor.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(dayKey(point, timeZone));
  }
  return days;
}

/** Serie diaria de 14 días. Si no hay valores distintos de cero, devuelve un arreglo vacío. */
export function buildDailyTrend(
  rows: TxLike[],
  metric: "commissions" | "credits",
  now = new Date(),
  days = 14,
  timeZone = HOME_TIMEZONE,
): TrendPoint[] {
  const keys = lastDays(days, now, timeZone);
  const totals = new Map(keys.map((day) => [day, 0]));
  for (const row of rows) {
    const day = dayKey(row.createdAt, timeZone);
    if (!totals.has(day)) continue;
    if (metric === "commissions") {
      if (row.kind !== "COMMISSION") continue;
      totals.set(day, (totals.get(day) ?? 0) + Number(row.amount ?? 0));
    } else if (row.creditDelta) {
      totals.set(day, (totals.get(day) ?? 0) + row.creditDelta);
    }
  }
  const points = keys.map((day) => ({ day, value: Math.round(((totals.get(day) ?? 0) + Number.EPSILON) * 100) / 100 }));
  return points.some((point) => point.value !== 0) ? points : [];
}

export function startOfTrendWindow(now = new Date(), days = 14, timeZone = HOME_TIMEZONE) {
  const first = lastDays(days, now, timeZone)[0];
  return new Date(`${first}T00:00:00-06:00`);
}

/** Acumulado de una serie diaria. No inventa valores: solo suma lo que ya vino en la tendencia. */
export function accumulateTrend(points: TrendPoint[]): TrendPoint[] {
  let sum = 0;
  return points.map((point) => {
    sum += point.value;
    return { day: point.day, value: Math.round((sum + Number.EPSILON) * 100) / 100 };
  });
}

export function hasTrend(points: TrendPoint[]): boolean {
  return points.length >= 2 && points.some((point) => point.value !== 0);
}

export const VEGA_DRAFT_MAX = 2000;

/** Limpia un borrador que se manda a Vega por la URL. */
export function sanitizeVegaDraft(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, VEGA_DRAFT_MAX);
}

export function isVegaAgentId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{10,40}$/i.test(value);
}

/** Abre Vega, opcionalmente con un borrador o un agente concreto. */
export function vegaHref(input: { mensaje?: string; agente?: string } = {}) {
  const params = new URLSearchParams();
  const mensaje = sanitizeVegaDraft(input.mensaje ?? "");
  if (mensaje) params.set("mensaje", mensaje);
  if (isVegaAgentId(input.agente)) params.set("agente", input.agente);
  const query = params.toString();
  return query ? `/dashboard/super-agent?${query}` : "/dashboard/super-agent";
}

export const homeQuickActions = [
  {
    id: "sitio",
    label: "Crear un sitio",
    mensaje: "Crea un sitio web para mi negocio: estructura, textos y un formulario de contacto.",
  },
  {
    id: "agente",
    label: "Agente de atención",
    mensaje: "Arma un agente de atención a clientes con el tono de mi marca. Si no sabe algo, que me pase el caso.",
  },
  {
    id: "seguimiento",
    label: "Mensaje a un prospecto",
    mensaje: "Redacta un mensaje corto de seguimiento para un prospecto. Lo reviso yo antes de enviarlo.",
  },
] as const;

export type HomeStep = {
  id: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
};

export type HomeStepInput = {
  canUseVega: boolean;
  talkedToVega: boolean;
  projectCount: number;
  publishedCount: number;
  customAgentCount: number;
  connectedApps: number;
  showConnections: boolean;
  directs: number;
};

/** Checklist honesta a partir del estado real del socio. */
export function buildHomeSteps(input: HomeStepInput): HomeStep[] {
  const steps: HomeStep[] = [];
  if (!input.canUseVega) {
    steps.push({
      id: "plan",
      title: "Activa tu membresía para usar Vega",
      hint: "Vega está incluido en los planes de LYRA.",
      href: "/dashboard/upgrade",
      done: false,
    });
  } else {
    steps.push({
      id: "vega",
      title: "Habla con Vega",
      hint: "Pídele un sitio, un texto o un agente desde el chat.",
      href: "/dashboard/super-agent",
      done: input.talkedToVega,
    });
  }
  steps.push({
    id: "project",
    title: "Crea tu primer proyecto",
    hint: "Un sitio, una app o un agente que Vega construye contigo.",
    href: input.canUseVega ? vegaHref({ mensaje: homeQuickActions[0].mensaje }) : "/dashboard/proyectos",
    done: input.projectCount > 0,
  });
  if (input.projectCount > 0) {
    steps.push({
      id: "publish",
      title: "Publica tu primer sitio o app",
      hint: "Cuando esté listo, queda en línea con tu enlace de LYRA.",
      href: "/dashboard/proyectos",
      done: input.publishedCount > 0,
    });
  }
  if (input.canUseVega) {
    steps.push({
      id: "agent",
      title: "Crea un agente para tu negocio",
      hint: "Atención, ventas o seguimiento, con su propia voz.",
      href: vegaHref({ mensaje: homeQuickActions[1].mensaje }),
      done: input.customAgentCount > 0,
    });
  }
  if (input.showConnections) {
    steps.push({
      id: "connect",
      title: "Conecta una de tus apps",
      hint: "Correo, calendario u otras herramientas, desde el chat de Vega.",
      href: "/dashboard/super-agent",
      done: input.connectedApps > 0,
    });
  }
  steps.push({
    id: "invite",
    title: "Invita a tu primer socio",
    hint: "Comparte tu enlace cuando quieras; está en Invitar, arriba.",
    href: "#invitar",
    done: input.directs > 0,
  });
  return steps;
}

export function publishStatusLabel(status: string | null): { label: string; tone: "live" | "draft" | "off" } {
  if (status === "published") return { label: "Publicado", tone: "live" };
  if (status === "unpublished") return { label: "Fuera de línea", tone: "off" };
  if (status === "draft") return { label: "Borrador", tone: "draft" };
  return { label: "Sin publicar", tone: "draft" };
}

