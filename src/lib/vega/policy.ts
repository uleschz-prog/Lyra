/**
 * Política de confirmación de Vega.
 *
 * - read: solo lee (correo, agenda, Drive, web, memoria). Corre sin preguntar.
 * - internal: escribe solo dentro de LYRA (memoria, archivos, tareas, perfil). Corre sin preguntar.
 * - write: cambia algo en una app del socio y se puede deshacer (fila en una hoja,
 *   documento, reunión de Zoom, evento sin invitados). Respeta la autonomía del socio.
 * - send: sale a otras personas o no se puede deshacer (correos, mensajes,
 *   publicaciones, cobros, invitaciones). SIEMPRE con tarjeta de Confirmar.
 */
import type { AppDraft } from "@/lib/vega/app-tools";

export type RiskClass = "read" | "internal" | "write" | "send";

const readTools = new Set([
  "leer_correos",
  "ver_agenda",
  "buscar_web",
  "buscar_en_drive",
  "leer_hoja",
  "ver_calendly",
  "ver_cobros",
  "ver_plantillas_whatsapp",
  "ver_rutinas",
  "ver_comandos",
  "buscar_memoria",
  "listar_archivos",
  "buscar_archivos",
  "leer_archivo",
]);

const internalTools = new Set([
  "recordar",
  "olvidar",
  "actualizar_perfil",
  "programar_rutina",
  "pausar_rutina",
  "reanudar_rutina",
  "borrar_rutina",
  "escribir_archivo",
  "no_molestar_whatsapp",
  "pedir_conexion",
  "crear_imagen",
  "crear_video",
  "entregar_proyecto",
]);

/** Herramientas que preparan algo para una app externa (su riesgo final depende del borrador). */
const preparingTools = new Set([
  "preparar_correo",
  "preparar_whatsapp",
  "preparar_evento",
  "preparar_comando",
  "preparar_fila",
  "preparar_documento",
  "preparar_zoom",
  "preparar_publicacion",
  "preparar_link_pago",
  "preparar_whatsapp_negocio",
]);

/** ¿La herramienta tiene una clase explícita? (las nuevas deben agregarse aquí). */
export function isClassified(name: string) {
  return readTools.has(name) || internalTools.has(name) || preparingTools.has(name);
}

/** Clase de una herramienta por su nombre. Lo desconocido se trata como envío (lo más seguro). */
export function classifyTool(name: string): RiskClass {
  if (readTools.has(name)) return "read";
  if (internalTools.has(name)) return "internal";
  if (preparingTools.has(name)) return name === "preparar_fila" || name === "preparar_documento" || name === "preparar_zoom" || name === "preparar_comando" ? "write" : "send";
  return "send";
}

/** Herramientas cuyo resultado trae texto escrito por terceros (posible inyección de instrucciones). */
export const externalContentTools = new Set(["leer_correos", "ver_agenda", "buscar_web", "buscar_en_drive", "leer_hoja", "ver_calendly", "ver_cobros", "leer_archivo"]);

/** Clase de una acción concreta ya preparada (lo que se guarda en VegaAction). */
export function classifyAction(kind: string, payload: unknown): RiskClass {
  if (kind === "send_email" || kind === "whatsapp_message") return "send";
  if (kind === "create_event") {
    const attendees = (payload as { attendees?: unknown } | null)?.attendees;
    // Con invitados, Google les manda correo: ya es un envío a terceros.
    return Array.isArray(attendees) && attendees.length > 0 ? "send" : "write";
  }
  if (kind === "app_action") {
    const op = (payload as Partial<AppDraft> | null)?.op;
    if (op === "sheet_append" || op === "doc_create" || op === "zoom_meeting") return "write";
    return "send"; // whatsapp_send, social_post, payment_link y lo que se agregue después.
  }
  if (kind === "run_command") return "write";
  if (kind === "create_image" || kind === "create_video" || kind === "deliver_project" || kind === "connect_app") return "internal";
  return "send";
}

export type ExecutionInput = {
  risk: RiskClass;
  /** Permiso de autonomía del socio para este tipo (horario y tope diario incluidos). */
  autonomyOk: boolean;
  /** En este turno Vega leyó contenido de terceros (correo, web, hojas…). */
  tainted: boolean;
  /** El socio ya había rechazado esta misma acción. */
  declinedBefore: boolean;
};

export type ExecutionDecision = { auto: true } | { auto: false; reason: string };

/** ¿Se ejecuta sola o espera la tarjeta de Confirmar? */
export function decideExecution(input: ExecutionInput): ExecutionDecision {
  if (input.risk === "send") return { auto: false, reason: "los envíos a otras personas siempre se confirman" };
  if (input.risk === "read" || input.risk === "internal") return { auto: true };
  if (input.declinedBefore) return { auto: false, reason: "el socio ya la había rechazado" };
  if (input.tainted) return { auto: false, reason: "en este turno se leyó contenido externo" };
  if (!input.autonomyOk) return { auto: false, reason: "no está en la autonomía del socio" };
  return { auto: true };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((key) => !["requestId", "statusUrl", "imageUrl", "dataUrl"].includes(key))
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().toLowerCase() : value;
}

/** Huella de una acción (tipo + contenido normalizado) para reconocer repeticiones. */
export function actionFingerprint(kind: string, payload: unknown) {
  const text = `${kind}:${JSON.stringify(stable(payload))}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${kind}:${(hash >>> 0).toString(16)}:${text.length}`;
}

/** ¿El último mensaje del socio pide explícitamente volver a intentar o enviar? */
export function asksToRetry(message: string) {
  return /\b(s[ií],?\s+(env[ií]a|manda|publica|hazlo)|env[ií]a(lo|la)?|m[aá]nda(lo|la)?|publ[ií]ca(lo|la)?|reintenta|intenta de nuevo|otra vez|de nuevo|vuelve a)\b/i.test(message);
}

export const ACTION_TTL_HOURS = 24;

export function sendsPerHour(env: Record<string, string | undefined> = process.env) {
  const parsed = Number.parseInt(env.VEGA_SENDS_PER_HOUR?.trim() ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, parsed)) : 20;
}
