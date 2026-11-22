/**
 * Capa única de modelos de Vega y del generador.
 *
 * - Con Vercel AI Gateway (AI_GATEWAY_API_KEY, o VEGA_AI_GATEWAY=oidc en Vercel) se usan dos niveles:
 *   «fuerte» (generador, apps, juegos, tareas de varios pasos con herramientas) y «rápido»
 *   (chat sencillo, resúmenes, clasificación), cada uno con su lista ordenada de respaldos.
 * - Sin Gateway todo sigue como antes: Gemini directo (GEMINI_MODEL) y respaldo OpenRouter.
 *
 * Los ids salen del catálogo público https://ai-gateway.vercel.sh/v1/models (revisado el 2026-11-21).
 */

export type ModelTier = "fuerte" | "rapido";
type Env = Record<string, string | undefined>;

export const MODELS_CHECKED_AT = "2026-11-21";

/**
 * Nivel fuerte: Claude Sonnet 5.5 (herramientas, visión y PDF; uptime y velocidad medidos en el Gateway),
 * luego Grok 4.7 (xAI, salida más barata) y GPT-5.6 Terra (OpenAI): tres proveedores distintos.
 */
export const defaultFuerte = ["anthropic/claude-sonnet-5.5", "spacexai/grok-4.7", "openai/gpt-5.6-terra"];
/** Nivel rápido: Claude Haiku 5.5 (muy barato, herramientas y PDF), luego GPT y Gemini. */
export const defaultRapido = ["anthropic/claude-haiku-5.5", "openai/gpt-5.6-luna", "google/gemini-3.5-flash-lite"];

/** Modelos del catálogo que no aceptan PDF (solo texto e imagen). */
const noPdfModel = /^spacexai\//;

/** Lo único que ve el socio cuando ningún modelo responde. El detalle se queda en los logs. */
export const saturatedMessage = "Vega está saturada en este momento, intenta en unos minutos.";
export const unconfiguredMessage = "Vega no está configurada en el servidor.";

const modelId = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._:-]*$/i;

function list(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => modelId.test(item));
}

function unique(items: string[]) {
  return [...new Set(items)];
}

export type GatewayMode = { enabled: false } | { enabled: true; auth: "key"; apiKey: string } | { enabled: true; auth: "oidc" };

/**
 * ¿Usar AI Gateway? Con AI_GATEWAY_API_KEY, sí. Con VEGA_AI_GATEWAY=oidc (u «on»), usa el token OIDC
 * del proyecto en Vercel. VEGA_AI_GATEWAY=off lo apaga aunque exista la clave. Sin nada, ruta Gemini.
 */
export function gatewayMode(env: Env = process.env): GatewayMode {
  const flag = env.VEGA_AI_GATEWAY?.trim().toLowerCase() ?? "";
  if (["off", "false", "0"].includes(flag)) return { enabled: false };
  const apiKey = env.AI_GATEWAY_API_KEY?.trim() ?? "";
  if (apiKey) return { enabled: true, auth: "key", apiKey };
  if (["oidc", "on", "true", "1"].includes(flag)) return { enabled: true, auth: "oidc" };
  return { enabled: false };
}

/**
 * Modelos de un nivel en orden: principal y respaldos. VEGA_MODEL_FUERTE / VEGA_MODEL_RAPIDO aceptan
 * uno o varios ids separados por comas; VEGA_MODEL_FUERTE_FALLBACKS / VEGA_MODEL_RAPIDO_FALLBACKS
 * reemplazan los respaldos del nivel y VEGA_MODEL_FALLBACKS se agrega al final de ambos.
 */
export function tierModels(tier: ModelTier, env: Env = process.env): string[] {
  const key = tier === "fuerte" ? "FUERTE" : "RAPIDO";
  const defaults = tier === "fuerte" ? defaultFuerte : defaultRapido;
  const primary = list(env[`VEGA_MODEL_${key}`]);
  const fallbacks = env[`VEGA_MODEL_${key}_FALLBACKS`] !== undefined ? list(env[`VEGA_MODEL_${key}_FALLBACKS`]) : null;
  const head = primary.length ? primary : [defaults[0]];
  const rest = fallbacks ?? (primary.length > 1 ? [] : defaults.filter((model) => model !== head[0]));
  return unique([...head, ...rest, ...list(env.VEGA_MODEL_FALLBACKS)]).slice(0, 8);
}

/** Si hay un PDF adjunto, empieza por el primer modelo que sí lo lee (sin quitar a nadie de la lista). */
export function orderForInputs(models: string[], hasPdf: boolean) {
  if (!hasPdf || !models.length || !noPdfModel.test(models[0])) return models;
  const index = models.findIndex((model) => !noPdfModel.test(model));
  if (index < 0) return models;
  return [models[index], ...models.filter((_, i) => i !== index)];
}

const heavyWords =
  /\b(crea|cr[eé]a(me|r)|arma(me|r)?|constru(ye|ir)|genera(r)?|hazme|dise[ñn]a|programa|edita(r)?|modifica|cambia(le)?|app|aplicaci[oó]n|sitio|p[aá]gina|web|landing|juego|videojuego|agente|rutina|automatiza|anali[zc]a|compara|investiga|estrategia|plan(ea)?|campa[ñn]a|correo|correos|email|gmail|whatsapp|publica|calendario|agenda(r)?|cotiza|factura|reporte|presupuesto|excel|tabla|c[oó]digo|tareas?|segundo plano|busca(me)?|tendencias)\b/i;

/**
 * Nivel para un turno de chat (VEGA_CHAT_TIER = auto | fuerte | rapido; por defecto auto).
 * Rápido solo para mensajes cortos y sencillos sin adjuntos (chat o WhatsApp); lo demás, y los
 * trabajos en segundo plano y rutinas, va por el fuerte. Si el turno usa herramientas, los pasos
 * siguientes suben al fuerte.
 */
export function chatTier(input: { message: string; attachments?: number; source?: string }, env: Env = process.env): ModelTier {
  const forced = env.VEGA_CHAT_TIER?.trim().toLowerCase();
  if (forced === "fuerte" || forced === "rapido") return forced;
  if (input.source && input.source !== "chat" && input.source !== "whatsapp") return "fuerte";
  if ((input.attachments ?? 0) > 0) return "fuerte";
  const message = input.message.trim();
  if (message.length > 280 || message.split("\n").length > 4) return "fuerte";
  return heavyWords.test(message) ? "fuerte" : "rapido";
}

/** Ruta anterior (sin Gateway): clave y modelo de Gemini directo. */
export function geminiCredentials(env: Env = process.env) {
  const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
  const model = env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  return { apiKey, model };
}
