import { getPrisma } from "@/lib/prisma";

export type AutonomySettings = {
  enabled: boolean;
  sendEmail: boolean;
  whatsapp: boolean;
  events: boolean;
  appActions: boolean;
  dailyLimit: number;
};

export const defaultAutonomy: AutonomySettings = {
  enabled: false,
  sendEmail: false,
  whatsapp: false,
  events: false,
  appActions: false,
  dailyLimit: 5,
};

const QUIET_START = 21;
const QUIET_END = 9;

export function autonomyLabel(kind: string) {
  if (kind === "send_email") return "enviar correos";
  if (kind === "whatsapp_message") return "enviar WhatsApp";
  if (kind === "create_event") return "agendar eventos sin invitados";
  if (kind === "run_command") return "ejecutar comandos del servidor";
  if (kind === "create_image") return "generar imágenes";
  if (kind === "app_action") return "agregar filas, crear documentos y reuniones de Zoom";
  return "acciones en tus apps";
}

/**
 * Permiso de autonomía para escrituras reversibles. Los envíos (correo, WhatsApp,
 * publicaciones, cobros, invitaciones) nunca se ejecutan solos: ver policy.ts.
 * sendEmail y whatsapp se conservan en la base por compatibilidad, pero ya no autorizan nada.
 */
export function autonomyAllowed(kind: string, settings: AutonomySettings) {
  if (!settings.enabled) return false;
  if (kind === "send_email" || kind === "whatsapp_message") return false;
  if (kind === "create_event") return settings.events;
  if (kind === "app_action") return settings.appActions;
  return false;
}

function localHourCdmx(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

export type AutonomyDecision = { ok: true } | { ok: false; reason: string };

/** Decide si una acción puede ejecutarse sola: permiso, horario y tope diario. */
export async function evaluateAutonomy(userId: string, kind: string, now = new Date()): Promise<AutonomyDecision> {
  const prisma = getPrisma();
  const row = await prisma.vegaAutonomy.findUnique({ where: { userId } });
  const settings: AutonomySettings = row
    ? {
        enabled: row.enabled,
        sendEmail: row.sendEmail,
        whatsapp: row.whatsapp,
        events: row.events,
        appActions: row.appActions,
        dailyLimit: row.dailyLimit,
      }
    : defaultAutonomy;

  if (!autonomyAllowed(kind, settings)) return { ok: false, reason: "no permitido" };
  const hour = localHourCdmx(now);
  if (hour < QUIET_END || hour >= QUIET_START) {
    return { ok: false, reason: `fuera de horario (Vega ejecuta sola de ${QUIET_END}:00 a ${QUIET_START}:00, Ciudad de México)` };
  }
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(startOfDay.getUTCHours() - 6, 0, 0, 0);
  const executed = await prisma.vegaAction.count({
    // Solo cuenta lo que Vega ejecutó sola: lo que confirma el socio no gasta el tope de autonomía.
    where: { userId, createdAt: { gte: startOfDay }, executedBy: "autonomy" },
  });
  if (executed >= settings.dailyLimit) {
    return { ok: false, reason: `tope diario alcanzado (${settings.dailyLimit} acciones ejecutadas solas hoy)` };
  }
  return { ok: true };
}

/** Texto del system prompt sobre qué puede ejecutar sola. */
export function autonomyPrompt(userId: string): Promise<string> {
  return (async () => {
    const prisma = getPrisma();
    const row = await prisma.vegaAutonomy.findUnique({ where: { userId } }).catch(() => null);
    if (!row || !row.enabled) {
      return "Autonomía: cada acción se queda lista para que el socio la confirme con un botón.";
    }
    const kinds = (["create_event", "app_action"] as const).filter((kind) =>
      autonomyAllowed(kind, {
        enabled: row.enabled,
        sendEmail: row.sendEmail,
        whatsapp: row.whatsapp,
        events: row.events,
        appActions: row.appActions,
        dailyLimit: row.dailyLimit,
      }),
    );
    if (kinds.length === 0) {
      return "Autonomía: cada acción se queda lista para que el socio la confirme con un botón.";
    }
    return [
      `Autonomía activa: puedes ejecutar directamente ${kinds.map((kind) => autonomyLabel(kind)).join(", ")}.`,
      "Cuando uses una herramienta preparar_ de esos tipos, la acción se ejecuta sola y el resultado llega en la respuesta de la herramienta: si dice ejecutada, puedes decir que ya se hizo.",
      "Correos, WhatsApp, publicaciones, enlaces de pago, invitaciones y cualquier cosa que salga a otras personas SIEMPRE quedan pendientes de confirmación, igual que todo lo demás fuera del horario 9:00 a 21:00 de Ciudad de México o del tope diario.",
    ].join(" ");
  })();
}
