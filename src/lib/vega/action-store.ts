import { getPrisma } from "@/lib/prisma";
import { ACTION_TTL_HOURS, sendsPerHour } from "@/lib/vega/policy";

const HOUR = 3_600_000;

export function expiryFrom(now: Date) {
  return new Date(now.getTime() + ACTION_TTL_HOURS * HOUR);
}

/** Una acción pendiente venció si pasó su expiresAt (o, en las viejas, 24 h desde que se creó). */
export function isExpired(action: { status: string; expiresAt?: Date | null; createdAt?: Date | null }, now = new Date()) {
  if (action.status !== "pending") return false;
  const limit = action.expiresAt ?? (action.createdAt ? new Date(action.createdAt.getTime() + ACTION_TTL_HOURS * HOUR) : null);
  return Boolean(limit && limit.getTime() <= now.getTime());
}

/** Marca como vencidas las acciones pendientes del socio que ya pasaron su hora. */
export async function expireStaleActions(userId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - ACTION_TTL_HOURS * HOUR);
  const expired = await getPrisma().vegaAction.updateMany({
    where: {
      userId,
      status: "pending",
      OR: [{ expiresAt: { lte: now } }, { expiresAt: null, createdAt: { lte: cutoff } }],
    },
    data: { status: "expired", result: "Venció sin confirmación. No se envió nada.", decidedAt: now, executedBy: "system" },
  });
  return expired.count;
}

/** ¿El socio ya rechazó esta misma acción en los últimos 7 días? */
export async function wasDeclined(userId: string, fingerprint: string, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 24 * HOUR);
  const found = await getPrisma().vegaAction.findFirst({
    where: { userId, fingerprint, status: "cancelled", createdAt: { gte: since } },
    select: { id: true },
  });
  return Boolean(found);
}

/** Envíos (riesgo «send») ejecutados por el socio en la última hora. */
export async function sendsInLastHour(userId: string, now = new Date()) {
  return getPrisma().vegaAction.count({
    where: { userId, riskClass: "send", status: { in: ["running", "done"] }, decidedAt: { gte: new Date(now.getTime() - HOUR) } },
  });
}

export async function sendRateLimit(userId: string, now = new Date()) {
  const limit = sendsPerHour();
  const used = await sendsInLastHour(userId, now);
  return used >= limit
    ? { ok: false as const, limit, message: `Llegaste al límite de ${limit} envíos por hora. Por seguridad, confirma este más tarde; la tarjeta sigue lista.` }
    : { ok: true as const, limit, used };
}

export function describeAction(kind: string, payload: unknown) {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (kind === "send_email") return `correo a ${String(data.to ?? "")}: ${String(data.subject ?? "")}`;
  if (kind === "whatsapp_message") return `WhatsApp${data.name ? ` a ${String(data.name)}` : ""}`;
  if (kind === "create_event") return `evento «${String(data.title ?? "")}»`;
  if (kind === "app_action") return String(data.title ?? "acción en una app");
  return kind;
}

/** Acciones que el socio rechazó en las últimas 24 h, para avisarle al modelo. */
export async function recentlyDeclined(userId: string, now = new Date()) {
  const rows = await getPrisma().vegaAction.findMany({
    where: { userId, status: "cancelled", createdAt: { gte: new Date(now.getTime() - 24 * HOUR) } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { kind: true, payload: true },
  });
  return rows.map((row) => describeAction(row.kind, row.payload));
}

export type ActionLogEntry = {
  id: string;
  kind: string;
  description: string;
  status: string;
  riskClass: string | null;
  executedBy: string | null;
  result: string | null;
  createdAt: string;
  decidedAt: string | null;
};

/** Bitácora de acciones del socio (más recientes primero). */
export async function actionLog(userId: string, take = 50): Promise<ActionLogEntry[]> {
  const rows = await getPrisma().vegaAction.findMany({
    where: { userId, kind: { notIn: ["create_image", "create_video", "deliver_project", "connect_app"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, payload: true, status: true, riskClass: true, executedBy: true, result: true, createdAt: true, decidedAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    description: describeAction(row.kind, row.payload),
    status: row.status,
    riskClass: row.riskClass,
    executedBy: row.executedBy,
    result: row.result,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }));
}
