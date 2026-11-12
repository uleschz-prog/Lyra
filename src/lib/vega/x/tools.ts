// Herramientas de Vega para inteligencia de mercado en X (Fase 8).
// buscar_en_x, analizar_competidor y tendencias_x son de lectura (clase read de la Fase 5);
// configurar_monitor_x crea rutinas dentro de LYRA (clase internal). Publicar en X queda fuera.
import type { FunctionDeclaration } from "@/lib/vega/gemini-stream";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/vega/schedule";
import { competitorSummary, countHashtags, postView, topicSummary, volumeTrend } from "@/lib/vega/x/analysis";
import { createXMonitor } from "@/lib/vega/x/monitor";
import { cleanHandle, topicQuery, userQuery } from "@/lib/vega/x/query";
import { classifyPost, summarizeSentiment } from "@/lib/vega/x/sentiment";
import { loadXUser, xAvailable, xCounts, xSearch, X_NOT_CONFIGURED_MESSAGE, type XServiceDeps } from "@/lib/vega/x/service";

export const xReadTools = ["buscar_en_x", "analizar_competidor", "tendencias_x"] as const;
export const xToolNames = new Set<string>([...xReadTools, "configurar_monitor_x"]);

export const xStatusLabels: Record<string, string> = {
  buscar_en_x: "Buscando en X…",
  analizar_competidor: "Analizando la cuenta en X…",
  tendencias_x: "Revisando tendencias en X…",
  configurar_monitor_x: "Configurando el monitor de X…",
};

export function xTools(): FunctionDeclaration[] {
  return [
    {
      name: "buscar_en_x",
      description:
        "Busca posts recientes en X (Twitter) de los últimos 7 días. Acepta operadores de X: from:usuario, @usuario, #hashtag, \"frase exacta\", -palabra, lang:es. Devuelve posts con autor, fecha, interacción, sentimiento y enlace. Cada post leído cuesta: pide solo los necesarios.",
      parameters: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "Búsqueda de X, p. ej. «\"tacos al pastor\" Pachuca» o «@marca -is:reply»." },
          idioma: { type: "string", description: "Código de 2 letras para filtrar (es, en). Opcional." },
          cantidad: { type: "integer", description: "Posts a leer, entre 10 y 50. Por defecto 20." },
        },
        required: ["consulta"],
      },
    },
    {
      name: "analizar_competidor",
      description:
        "Analiza una cuenta de X (competidor o marca): perfil, posts de los últimos 7 días, frecuencia, interacción promedio, temas y hashtags, sentimiento y sus mejores posts.",
      parameters: {
        type: "object",
        properties: {
          cuenta: { type: "string", description: "Usuario de X, con o sin @, p. ej. «@competidor»." },
          cantidad: { type: "integer", description: "Posts a revisar, entre 10 y 50. Por defecto 30." },
        },
        required: ["cuenta"],
      },
    },
    {
      name: "tendencias_x",
      description:
        "Tendencias en X sobre un tema o palabras clave: volumen por día de los últimos 7 días y cambio de las últimas 24 h, hashtags en aceleración, palabras frecuentes, cuentas más activas, sentimiento y posts destacados.",
      parameters: {
        type: "object",
        properties: {
          palabras_clave: { type: "array", items: { type: "string" }, description: "1 a 5 palabras clave o frases del tema." },
          idioma: { type: "string", description: "Código de 2 letras (es, en). Opcional." },
        },
        required: ["palabras_clave"],
      },
    },
    {
      name: "configurar_monitor_x",
      description:
        "Crea un monitor de X: una rutina que revisa palabras clave y menciones de cuentas por sondeo y avisa al socio (chat, correo y WhatsApp) solo si detecta un pico de comentarios negativos (alerta de crisis). Opcionalmente agrega un reporte programado diario o semanal. Se administra con ver_rutinas, pausar_rutina y borrar_rutina.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Nombre corto, p. ej. «Mi marca en X»." },
          palabras_clave: { type: "array", items: { type: "string" }, description: "Hasta 10 palabras clave o frases (marca, producto)." },
          cuentas: { type: "array", items: { type: "string" }, description: "Hasta 5 cuentas de X cuyas menciones vigilar (con o sin @)." },
          idioma: { type: "string", description: "Código de 2 letras (es, en). Opcional." },
          frecuencia: { type: "string", enum: ["cada_hora", "cada_3_horas", "cada_6_horas", "diario"], description: "Cada cuánto revisar. Por defecto cada_3_horas." },
          reporte: { type: "string", enum: ["nunca", "diario", "semanal"], description: "Reporte programado con análisis. Por defecto nunca." },
          hora_reporte: { type: "string", description: "HH:MM local del reporte. Por defecto 09:00." },
          zona_horaria: { type: "string", description: `Zona IANA. Por defecto ${DEFAULT_TIMEZONE}.` },
        },
        required: ["titulo"],
      },
    },
  ];
}

type XToolOutcome = { kind: "result"; response: Record<string, unknown>; status: string } | { kind: "invalid"; response: Record<string, unknown> };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const amount = (value: unknown, fallback: number) => Math.min(50, Math.max(10, Math.round(Number(value)) || fallback));
const fail = (error: string): XToolOutcome => ({ kind: "invalid", response: { error, sugerencia: "Explícale al socio en una frase; si sirve, usa buscar_web como alternativa." } });

function note(cached: boolean, remaining: number | null) {
  return {
    ...(cached ? { nota: "Resultado reciente en caché (no consumió consultas)." } : {}),
    ...(remaining !== null ? { posts_restantes_hoy: remaining } : {}),
  };
}

export async function runXTool(userId: string, name: string, args: Record<string, unknown>, deps?: XServiceDeps, now = new Date()): Promise<XToolOutcome> {
  const user = await loadXUser(userId);
  if (!user) return fail("No encontré tu cuenta.");
  if (name !== "configurar_monitor_x" && !xAvailable(deps?.env)) return fail(X_NOT_CONFIGURED_MESSAGE);

  if (name === "buscar_en_x") {
    const query = userQuery(text(args.consulta, 400), { lang: text(args.idioma, 5) });
    if (!query) return { kind: "invalid", response: { error: "Escribe una búsqueda de X más concreta (máximo 512 caracteres)." } };
    const found = await xSearch(user, query, { kind: "search", maxResults: amount(args.cantidad, 20) }, deps);
    if (!found.ok) return fail(found.error);
    const labels = found.data.posts.map((post) => classifyPost(post.text));
    return {
      kind: "result",
      status: `Busqué en X: ${text(args.consulta, 80)} · ${found.data.posts.length} posts`,
      response: {
        consulta: query,
        posts: found.data.posts.length ? found.data.posts.map((post, index) => postView(post, labels[index])) : "(sin posts en los últimos 7 días)",
        sentimiento: summarizeSentiment(labels),
        hashtags: countHashtags(found.data.posts.flatMap((post) => post.hashtags)).slice(0, 8),
        instruccion: "Cita los posts con su enlace. El sentimiento es un filtro automático por palabras: no detecta ironía.",
        ...note(found.cached, found.remainingPosts),
      },
    };
  }

  if (name === "analizar_competidor") {
    const handle = cleanHandle(text(args.cuenta, 60));
    if (!handle) return { kind: "invalid", response: { error: "Ese usuario de X no es válido (letras, números y _; máximo 15)." } };
    const found = await xSearch(user, `from:${handle} -is:retweet`, { kind: "competitor", maxResults: amount(args.cantidad, 30) }, deps);
    if (!found.ok) return fail(found.error);
    if (!found.data.posts.length) {
      return {
        kind: "result",
        status: `Revisé @${handle} en X: sin posts recientes`,
        response: { cuenta: `@${handle}`, resultado: "La cuenta no publicó en los últimos 7 días, es privada o no existe.", ...note(found.cached, found.remainingPosts) },
      };
    }
    return {
      kind: "result",
      status: `Analicé @${handle} en X · ${found.data.posts.length} posts`,
      response: { ...competitorSummary(handle, found.data.posts, found.data.users, now), ...note(found.cached, found.remainingPosts) },
    };
  }

  if (name === "tendencias_x") {
    const raw = Array.isArray(args.palabras_clave) ? args.palabras_clave : typeof args.palabras_clave === "string" ? args.palabras_clave.split(",") : [];
    const keywords = raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 5);
    const query = topicQuery(keywords, text(args.idioma, 5) || undefined);
    if (!query) return { kind: "invalid", response: { error: "Dame de 1 a 5 palabras clave válidas." } };
    const [counts, sample] = await Promise.all([xCounts(user, query, deps), xSearch(user, query, { kind: "trends", maxResults: 30, withUsers: false }, deps)]);
    if (!sample.ok && !counts.ok) return fail(sample.error);
    return {
      kind: "result",
      status: `Revisé tendencias en X: ${keywords.join(", ").slice(0, 80)}`,
      response: {
        consulta: query,
        volumen: counts.ok ? volumeTrend(counts.data, now) : `(volumen no disponible: ${counts.error})`,
        muestra: sample.ok ? topicSummary(sample.data.posts, now) : `(muestra no disponible: ${sample.error})`,
        instruccion: "El volumen es el conteo de X; temas y sentimiento salen de una muestra de posts recientes. Cita posts con su enlace.",
        ...(sample.ok ? note(sample.cached && (!counts.ok || counts.cached), sample.remainingPosts) : {}),
      },
    };
  }

  if (name === "configurar_monitor_x") {
    const zone = text(args.zona_horaria, 64) || DEFAULT_TIMEZONE;
    if (!isValidTimezone(zone)) return { kind: "invalid", response: { error: "Zona horaria no válida; usa un nombre IANA como America/Mexico_City." } };
    const created = await createXMonitor(
      user,
      {
        title: text(args.titulo, 100),
        keywords: args.palabras_clave,
        handles: args.cuentas,
        lang: text(args.idioma, 5),
        frequency: text(args.frecuencia, 20) || undefined,
        report: text(args.reporte, 10),
        reportTime: text(args.hora_reporte, 5),
        timezone: zone,
      },
      now,
      deps?.env,
    );
    if (!created.ok) return { kind: "invalid", response: { error: created.error } };
    const { monitor, report, reportError } = created;
    return {
      kind: "result",
      status: `Creé el monitor de X «${monitor.title}» · ${monitor.frequency}`,
      response: {
        creado: true,
        id: monitor.taskId,
        vigila: { palabras_clave: monitor.keywords, cuentas: monitor.handles.map((handle) => `@${handle}`) },
        frecuencia: monitor.frequency,
        ...(monitor.adjusted ? { nota_frecuencia: "Ajusté la frecuencia al mínimo permitido." } : {}),
        primera_revision: monitor.nextRun,
        alerta: "Solo avisa si hay un pico de comentarios negativos; si todo está normal no manda nada.",
        reporte: report ? { id: report.id, horario: report.label } : reportError ? `No se pudo programar el reporte: ${reportError}` : "sin reporte",
        ...(!xAvailable(deps?.env) ? { aviso: X_NOT_CONFIGURED_MESSAGE + " El monitor quedó guardado y empezará cuando se active." } : {}),
      },
    };
  }

  return { kind: "invalid", response: { error: "Herramienta de X desconocida." } };
}
