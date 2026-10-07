import { runUserTool } from "@/lib/ai/composio-user";
import { searchWeb, type WebResult } from "@/lib/ai/search";
import { appToolNames, appTools, executeAppAction, runAppTool, type AppDraft } from "@/lib/vega/app-tools";
import {
  commandAllowlist,
  findCommand,
  generateImage,
  isSafeArgument,
  listWorkspace,
  readWorkspaceFile,
  searchWorkspace,
  writeWorkspaceFile,
} from "@/lib/vega/assistant-tools";
import { buildProject, buildStoryboard, type ProjectDraft } from "@/lib/vega/build-project";
import { generateClip } from "@/lib/ai/media";
import { scenesFromScript } from "@/lib/studio/video-plan";
import type { VegaConnections } from "@/lib/vega/apps";
import type { FunctionDeclaration } from "@/lib/vega/gemini-stream";
import { forgetMemory, MEMORY_MAX_LENGTH, saveMemory } from "@/lib/vega/memory";
import { profileFields, saveVegaProfile } from "@/lib/vega/profile";
import {
  createTask,
  DAILY_HOUR,
  deleteTask,
  listTasks,
  repeatLabels,
  type TaskKind,
  type TaskRepeat,
} from "@/lib/vega/tasks";

export type { VegaConnections } from "@/lib/vega/apps";
export type { AppDraft } from "@/lib/vega/app-tools";

export type ActionKind = "send_email" | "create_event" | "whatsapp_message" | "app_action" | "run_command" | "create_image" | "create_video" | "deliver_project";
export type ActionPayload = EmailDraft | EventDraft | WhatsappDraft | AppDraft | CommandDraft | ImageDraft | VideoDraft | ProjectDraft;

export type EmailDraft = { to: string; cc?: string[]; subject: string; body: string };
export type WhatsappDraft = { phone?: string; name?: string; text: string };
export type CommandDraft = { commandId: string; label: string };
export type ImageDraft = { prompt: string; size?: string; dataUrl?: string };
export type VideoDraft = {
  title: string;
  script: string;
  scenes: string[];
  html: string;
  videoUrl?: string;
  files: { path: string; content: string }[];
};
export type { ProjectDraft };
export type EventDraft = {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  meet?: boolean;
};

export const TIMEZONE = "America/Mexico_City";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** Herramientas que no cobran el extra de créditos. */
export const freeTools = new Set(["recordar", "olvidar", "programar_tarea", "ver_tareas", "cancelar_tarea", "preparar_whatsapp", "no_molestar_whatsapp", "actualizar_perfil", "listar_archivos", "buscar_archivos", "leer_archivo", "escribir_archivo", "ver_comandos"]);
const taskTools: FunctionDeclaration[] = [
  {
    name: "programar_tarea",
    description: `Programa un recordatorio o una tarea para una fecha. Las tareas se entregan a las ${DAILY_HOUR}:00 am (Ciudad de México) del día indicado, en el chat de Vega, por correo si el socio conectó Gmail y por WhatsApp si lo activó en el panel Tareas. Un recordatorio cuesta 1 crédito y una tarea que requiere redactar o investigar cuesta 3, al ejecutarse.`,
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Nombre corto, p. ej. «Llamar a Mariana»." },
        que_hacer: {
          type: "string",
          description: "Para un recordatorio: el mensaje que recibirá. Para una tarea: la instrucción completa de lo que Vega debe preparar ese día.",
        },
        tipo: { type: "string", enum: ["recordatorio", "tarea"], description: "recordatorio = aviso simple; tarea = Vega redacta o investiga algo." },
        fecha: { type: "string", description: "YYYY-MM-DD, primera fecha de entrega." },
        repetir: { type: "string", enum: ["nunca", "diario", "semanal", "mensual"] },
        usar_web: { type: "boolean", description: "Solo para tareas que necesitan información actual de internet." },
      },
      required: ["titulo", "que_hacer", "tipo", "fecha", "repetir"],
    },
  },
  {
    name: "ver_tareas",
    description: "Lista los recordatorios y tareas programadas del socio.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "cancelar_tarea",
    description: "Cancela una tarea o recordatorio programado. Usa el id que devuelve ver_tareas.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

export function vegaTools(connections: VegaConnections, webSearch: boolean): FunctionDeclaration[] {
  const tools: FunctionDeclaration[] = [
    {
      name: "recordar",
      description:
        "Guarda un dato duradero del socio para futuras conversaciones: su negocio, metas, clientes, preferencias de tono, horarios o cualquier cosa que pida recordar. No guardes datos pasajeros, contraseñas, datos bancarios ni información de salud.",
      parameters: {
        type: "object",
        properties: {
          dato: { type: "string", description: "El dato en una frase corta en tercera persona, por ejemplo: «Vende suplementos en Guadalajara»." },
        },
        required: ["dato"],
      },
    },
    {
      name: "olvidar",
      description: "Borra un dato de la memoria cuando el socio lo pide o cuando quedó desactualizado.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "El id entre corchetes del dato recordado." } },
        required: ["id"],
      },
    },
    {
      name: "actualizar_perfil",
      description:
        "Actualiza el perfil estructurado del socio: su negocio, metas, tono preferido, mercados, servicios, horarios, personas clave o notas. Úsalo cuando el socio cuente o cambie alguno de estos datos. Solo envía el campo que cambia; lo que no mandes se conserva.",
      parameters: {
        type: "object",
        properties: {
          negocio: { type: "string", description: "Qué vende o hace el socio." },
          metas: { type: "string", description: "Metas de ventas, red o negocio." },
          tono: { type: "string", description: "Tono preferido en los mensajes." },
          mercados: { type: "string", description: "Mercados o nichos." },
          servicios: { type: "string", description: "Productos o servicios." },
          horarios: { type: "string", description: "Horarios y disponibilidad." },
          equipo: { type: "string", description: "Personas clave." },
          notas: { type: "string", description: "Contexto adicional." },
        },
      },
    },
    ...taskTools,
    {
      name: "preparar_whatsapp",
      description:
        "Prepara un mensaje de WhatsApp que el socio envía desde su propio WhatsApp con un botón. Úsalo cuando pida escribirle a un prospecto, cliente o socio por WhatsApp. El número es opcional: sin él, el socio elige el contacto al abrir WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          mensaje: { type: "string", description: "El mensaje final, listo para enviar, en texto plano y tono de WhatsApp." },
          telefono: { type: "string", description: "Número con código de país (opcional), p. ej. 5215512345678." },
          nombre: { type: "string", description: "Nombre del destinatario (opcional)." },
        },
        required: ["mensaje"],
      },
    },
    {
      name: "listar_archivos",
      description:
        "Lista los archivos y carpetas del espacio de trabajo del socio (una carpeta por vez). Úsalo para saber qué tiene antes de leer o escribir. Sin carpeta, lista la raíz.",
      parameters: {
        type: "object",
        properties: { carpeta: { type: "string", description: "Ruta relativa de la carpeta (opcional)." } },
      },
    },
    {
      name: "buscar_archivos",
      description: "Busca archivos y carpetas por nombre dentro del espacio de trabajo del socio.",
      parameters: {
        type: "object",
        properties: { busqueda: { type: "string", description: "Parte del nombre a buscar." } },
        required: ["busqueda"],
      },
    },
    {
      name: "leer_archivo",
      description: "Lee un archivo de texto del espacio de trabajo del socio. Devuelve su contenido (hasta 200 KB).",
      parameters: {
        type: "object",
        properties: { ruta: { type: "string", description: "Ruta relativa del archivo, p. ej. «notas/ideas.md»." } },
        required: ["ruta"],
      },
    },
    {
      name: "escribir_archivo",
      description:
        "Escribe o agrega texto en un archivo del espacio de trabajo del socio. Crea las carpetas necesarias. Para sobrescribir todo el archivo usa «sobrescribir: true»; por omisión agrega al final.",
      parameters: {
        type: "object",
        properties: {
          ruta: { type: "string", description: "Ruta relativa del archivo." },
          contenido: { type: "string", description: "Texto a escribir (hasta 500 KB)." },
          sobrescribir: { type: "boolean", description: "true para reemplazar todo el archivo; false para agregar al final." },
        },
        required: ["ruta", "contenido"],
      },
    },
    {
      name: "crear_imagen",
      description:
        "Crea ya una imagen, logo o foto a partir de una descripción y la muestra en el chat. Úsala en el mismo turno en que el socio la pide. No pidas confirmación. Escribe la descripción en español, concreta y visual.",
      parameters: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "Descripción visual de la imagen que se quiere generar." },
          tamano: { type: "string", enum: ["cuadrada", "horizontal", "vertical"], description: "Formato de la imagen (opcional)." },
        },
        required: ["descripcion"],
      },
    },
    {
      name: "crear_video",
      description:
        "Crea ya un video corto o un anuncio a partir de un guion y lo muestra en el chat. Úsala en el mismo turno en que el socio lo pide. El guion son 2 a 4 frases en español.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          guion: { type: "string", description: "Texto que se lee en el video, en 2 a 4 frases." },
          formato: { type: "string", enum: ["9:16", "1:1", "16:9"], description: "9:16 para teléfono, 16:9 para escritorio." },
        },
        required: ["titulo", "guion"],
      },
    },
    {
      name: "entregar_proyecto",
      description:
        "Entrega ya una app, un sitio web o un agente que el socio pidió. La persona ve la vista previa y descarga el código. Úsala en el mismo turno, sin pedir confirmación. Rellena secciones con lo que dijo; si falta el nombre del negocio o los servicios, usa un ejemplo concreto y dilo. Una app de citas lleva una sección agenda. Un sitio lleva portada, servicios y contacto. Un agente lleva una sección agente con reglas y ejemplos de respuesta.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          tipo: { type: "string", enum: ["app", "sitio", "agente"] },
          resumen: { type: "string", description: "Una frase de qué hace." },
          color: { type: "string", description: "Color hexadecimal, por ejemplo #0F766E." },
          secciones: {
            type: "array",
            description: "Bloques de la pieza. portada, servicios, agenda, contacto, texto o agente.",
            items: { type: "object" },
          },
          sugerencias: {
            type: "array",
            items: { type: "string" },
            description: "Dos o tres siguientes pasos concretos, por ejemplo un logo, un video o un mensaje de WhatsApp.",
          },
        },
        required: ["titulo", "tipo", "resumen", "secciones"],
      },
    },
    {
      name: "preparar_comando",
      description:
        "Prepara un comando del servidor de la lista permitida para que el socio lo confirme con un botón. NO lo ejecuta. Usa ver_comandos si no sabes cuáles hay. Solo hay comandos de solo lectura; no existe shell libre.",
      parameters: {
        type: "object",
        properties: {
          comando: { type: "string", enum: commandAllowlist.map((command) => command.id), description: "Id del comando permitido." },
        },
        required: ["comando"],
      },
    },
    {
      name: "ver_comandos",
      description: "Lista los comandos que Vega puede preparar, con lo que hace cada uno.",
      parameters: { type: "object", properties: {} },
    },
  ];
  if (webSearch) {
    tools.push({
      name: "buscar_web",
      description:
        "Busca en internet información actual: noticias, precios, tendencias, empresas o datos que pueden haber cambiado. Devuelve páginas numeradas para citar.",
      parameters: {
        type: "object",
        properties: { consulta: { type: "string", description: "Búsqueda concreta, en el idioma más útil." } },
        required: ["consulta"],
      },
    });
  }
  if (connections.gmail) {
    tools.push(
      {
        name: "leer_correos",
        description:
          "Lee correos del Gmail del socio. Acepta la sintaxis de búsqueda de Gmail (from:, subject:, is:unread, newer_than:2d).",
        parameters: {
          type: "object",
          properties: {
            busqueda: { type: "string", description: "Consulta de Gmail. Vacía para los más recientes de la bandeja." },
            cantidad: { type: "integer", description: "Entre 1 y 10." },
          },
        },
      },
      {
        name: "preparar_correo",
        description:
          "Prepara un correo para enviar desde el Gmail del socio. NO lo envía: el socio lo revisa y confirma con un botón.",
        parameters: {
          type: "object",
          properties: {
            para: { type: "string", description: "Correo del destinatario principal." },
            cc: { type: "array", items: { type: "string" }, description: "Correos en copia (opcional)." },
            asunto: { type: "string" },
            cuerpo: { type: "string", description: "Texto del correo, listo para enviar, en texto plano." },
          },
          required: ["para", "asunto", "cuerpo"],
        },
      },
    );
  }
  if (connections.googlecalendar) {
    tools.push(
      {
        name: "ver_agenda",
        description: "Consulta los eventos del Google Calendar del socio entre dos fechas.",
        parameters: {
          type: "object",
          properties: {
            desde: { type: "string", description: `Inicio en formato YYYY-MM-DDTHH:MM, hora de ${TIMEZONE}.` },
            hasta: { type: "string", description: `Fin en formato YYYY-MM-DDTHH:MM, hora de ${TIMEZONE}.` },
            busqueda: { type: "string", description: "Texto para filtrar eventos (opcional)." },
          },
          required: ["desde", "hasta"],
        },
      },
      {
        name: "preparar_evento",
        description:
          "Prepara un evento para el Google Calendar del socio. NO lo crea: el socio lo revisa y confirma con un botón.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            inicio: { type: "string", description: `YYYY-MM-DDTHH:MM, hora de ${TIMEZONE}.` },
            fin: { type: "string", description: `YYYY-MM-DDTHH:MM, hora de ${TIMEZONE}.` },
            descripcion: { type: "string" },
            lugar: { type: "string" },
            invitados: { type: "array", items: { type: "string" }, description: "Correos de invitados (opcional)." },
            con_meet: { type: "boolean", description: "true para agregar un enlace de Google Meet (videollamada)." },
          },
          required: ["titulo", "inicio", "fin"],
        },
      },
    );
  }
  tools.push(...appTools(connections));
  return tools;
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const emails = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && emailPattern.test(item.trim())).map((item) => item.trim()).slice(0, 10)
    : [];

function withOffset(local: string) {
  return `${local.length === 16 ? `${local}:00` : local}-06:00`;
}

/** Recorta la respuesta de un servicio para que quepa en el contexto del modelo. */
function compact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 700 ? `${value.slice(0, 700)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compact(item, depth + 1));
  if (value && typeof value === "object" && depth < 6) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (["payload", "attachmentList", "raw", "etag", "iCalUID", "conferenceData", "reminders"].includes(key)) continue;
      out[key] = compact(item, depth + 1);
    }
    return out;
  }
  return value;
}

function limited(data: unknown) {
  const json = JSON.stringify(compact(data));
  return json.length > 9000 ? `${json.slice(0, 9000)}…` : json;
}

export type ToolOutcome =
  | { kind: "result"; response: Record<string, unknown>; status: string; sources?: WebResult[] }
  | { kind: "action"; action: ActionKind; payload: ActionPayload; summary: string }
  | { kind: "delivery"; action: ActionKind; payload: ActionPayload; summary: string; modelNote: string }
  | { kind: "invalid"; response: Record<string, unknown> };

export async function runVegaTool(userId: string, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  if (appToolNames.has(name)) {
    const outcome = await runAppTool(userId, name, args);
    return outcome.kind === "app" ? { kind: "action", action: "app_action", payload: outcome.payload, summary: outcome.summary } : outcome;
  }

  if (name === "recordar") {
    const saved = await saveMemory(userId, text(args.dato, MEMORY_MAX_LENGTH));
    if (!saved.ok) return { kind: "invalid", response: { error: saved.error } };
    return {
      kind: "result",
      status: saved.duplicate ? `Ya lo tenía en memoria: ${saved.memory.content}` : `Guardé en memoria: ${saved.memory.content}`,
      response: { guardado: true, id: saved.memory.id },
    };
  }

  if (name === "olvidar") {
    const id = text(args.id, 40);
    const removed = id ? await forgetMemory(userId, id) : false;
    if (!removed) return { kind: "invalid", response: { error: "No encontré ese dato en la memoria." } };
    return { kind: "result", status: "Borré un dato de la memoria", response: { borrado: true } };
  }

  if (name === "actualizar_perfil") {
    const saved = await saveVegaProfile(userId, {
      ...(args.negocio !== undefined ? { business: text(args.negocio, 2000) } : {}),
      ...(args.metas !== undefined ? { goals: text(args.metas, 2000) } : {}),
      ...(args.tono !== undefined ? { tone: text(args.tono, 2000) } : {}),
      ...(args.mercados !== undefined ? { markets: text(args.mercados, 2000) } : {}),
      ...(args.servicios !== undefined ? { services: text(args.servicios, 2000) } : {}),
      ...(args.horarios !== undefined ? { hours: text(args.horarios, 2000) } : {}),
      ...(args.equipo !== undefined ? { team: text(args.equipo, 2000) } : {}),
      ...(args.notas !== undefined ? { notes: text(args.notas, 2000) } : {}),
    });
    if (!saved.ok) return { kind: "invalid", response: { error: saved.error } };
    return { kind: "result", status: "Actualicé el perfil del socio", response: { perfil: saved.profile } };
  }

  if (name === "programar_tarea") {
    const date = text(args.fecha, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { kind: "invalid", response: { error: "La fecha debe ser YYYY-MM-DD." } };
    const repeatMap: Record<string, TaskRepeat> = { nunca: "once", diario: "daily", semanal: "weekly", mensual: "monthly" };
    const kind: TaskKind = args.tipo === "tarea" ? "task" : "reminder";
    const title = text(args.titulo, 120);
    const instruction = text(args.que_hacer, 1000);
    if (!title || !instruction) return { kind: "invalid", response: { error: "Falta el título o qué hacer." } };
    const created = await createTask(userId, {
      title,
      instruction,
      kind,
      repeat: repeatMap[text(args.repetir, 10)] ?? "once",
      useWeb: args.usar_web === true,
      date,
      time: `${String(DAILY_HOUR).padStart(2, "0")}:00`,
    });
    if (!created.ok) return { kind: "invalid", response: { error: created.error } };
    const when = new Date(created.task.runAt).toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: TIMEZONE,
    });
    return {
      kind: "result",
      status: `Programé «${title}» para el ${when}${created.task.repeat === "once" ? "" : ` (${repeatLabels[created.task.repeat].toLowerCase()})`}`,
      response: { programada: true, id: created.task.id, entrega: `${when}, ${DAILY_HOUR}:00 am` },
    };
  }

  if (name === "ver_tareas") {
    const tasks = await listTasks(userId);
    return {
      kind: "result",
      status: "Revisé tus tareas programadas",
      response: {
        tareas: tasks.map((task) => ({
          id: task.id,
          titulo: task.title,
          tipo: task.kind === "task" ? "tarea" : "recordatorio",
          repetir: repeatLabels[task.repeat],
          proxima: new Date(task.runAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: TIMEZONE }),
          estado: task.status === "paused" ? "pausada" : "activa",
        })),
      },
    };
  }

  if (name === "cancelar_tarea") {
    const removed = await deleteTask(userId, text(args.id, 40));
    if (!removed) return { kind: "invalid", response: { error: "No encontré esa tarea." } };
    return { kind: "result", status: "Cancelé una tarea programada", response: { cancelada: true } };
  }

  if (name === "buscar_web") {
    const query = text(args.consulta, 300);
    if (query.length < 3) return { kind: "invalid", response: { error: "Consulta demasiado corta." } };
    const found = await searchWeb(query, 5);
    if (!found.ok) return { kind: "invalid", response: { error: found.error } };
    return {
      kind: "result",
      status: `Busqué en la web: ${query}`,
      sources: found.value,
      response: {
        resultados: found.value.map((item, index) => ({ n: index + 1, titulo: item.title, url: item.url, extracto: item.highlight })),
        instruccion: "Cita las fuentes con [n] junto a cada dato.",
      },
    };
  }

  if (name === "leer_correos") {
    const count = Math.max(1, Math.min(10, Number(args.cantidad) || 5));
    const query = text(args.busqueda, 200);
    const result = await runUserTool(userId, "gmail", "GMAIL_FETCH_EMAILS", {
      query: query || "in:inbox",
      max_results: count,
      include_payload: false,
      verbose: true,
    });
    if (!result.ok) return { kind: "invalid", response: { error: result.error } };
    return { kind: "result", status: query ? `Revisé tu Gmail: ${query}` : "Revisé tu bandeja de Gmail", response: { correos: limited(result.data) } };
  }

  if (name === "ver_agenda") {
    const from = text(args.desde, 19);
    const to = text(args.hasta, 19);
    if (!localDateTime.test(from) || !localDateTime.test(to)) {
      return { kind: "invalid", response: { error: "Usa fechas con formato YYYY-MM-DDTHH:MM." } };
    }
    const result = await runUserTool(userId, "googlecalendar", "GOOGLECALENDAR_EVENTS_LIST", {
      timeMin: withOffset(from),
      timeMax: withOffset(to),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 25,
      timeZone: TIMEZONE,
      ...(text(args.busqueda, 100) ? { query: text(args.busqueda, 100) } : {}),
      fields: "items(summary,start,end,location,attendees(email),htmlLink)",
    });
    if (!result.ok) return { kind: "invalid", response: { error: result.error } };
    return { kind: "result", status: "Revisé tu agenda", response: { eventos: limited(result.data) } };
  }

  if (name === "preparar_correo") {
    const to = text(args.para, 200);
    const subject = text(args.asunto, 200);
    const body = text(args.cuerpo, 8000);
    if (!emailPattern.test(to)) return { kind: "invalid", response: { error: "Falta un correo válido del destinatario. Pídeselo al socio." } };
    if (!subject || !body) return { kind: "invalid", response: { error: "El correo necesita asunto y cuerpo." } };
    const cc = emails(args.cc);
    return {
      kind: "action",
      action: "send_email",
      payload: { to, subject, body, ...(cc.length ? { cc } : {}) },
      summary: `Correo para ${to}: ${subject}`,
    };
  }

  if (name === "preparar_whatsapp") {
    const message = text(args.mensaje, 3000);
    if (!message) return { kind: "invalid", response: { error: "Falta el mensaje." } };
    let phone = text(args.telefono, 30).replace(/\D/g, "");
    if (phone.length === 10) phone = `52${phone}`;
    if (phone && (phone.length < 11 || phone.length > 15)) {
      return { kind: "invalid", response: { error: "El número debe incluir código de país. Pídeselo al socio o prepáralo sin número." } };
    }
    const name = text(args.nombre, 80);
    return {
      kind: "action",
      action: "whatsapp_message",
      payload: { text: message, ...(phone ? { phone } : {}), ...(name ? { name } : {}) },
      summary: `WhatsApp${name ? ` para ${name}` : ""}`,
    };
  }

  if (name === "preparar_evento") {
    const title = text(args.titulo, 200);
    const start = text(args.inicio, 19);
    const end = text(args.fin, 19);
    if (!title || !localDateTime.test(start) || !localDateTime.test(end) || end <= start) {
      return { kind: "invalid", response: { error: "El evento necesita título, inicio y fin válidos (YYYY-MM-DDTHH:MM)." } };
    }
    const attendees = emails(args.invitados);
    return {
      kind: "action",
      action: "create_event",
      payload: {
        title,
        start,
        end,
        ...(text(args.descripcion, 2000) ? { description: text(args.descripcion, 2000) } : {}),
        ...(text(args.lugar, 300) ? { location: text(args.lugar, 300) } : {}),
        ...(attendees.length ? { attendees } : {}),
        ...(args.con_meet === true ? { meet: true } : {}),
      },
      summary: `Evento: ${title}`,
    };
  }

  if (name === "listar_archivos") {
    const listed = await listWorkspace(userId, text(args.carpeta, 300) || ".");
    if (!listed.ok) return { kind: "invalid", response: { error: listed.error } };
    return {
      kind: "result",
      status: `Revisé tu espacio: ${listed.entries.length} elemento${listed.entries.length === 1 ? "" : "s"}`,
      response: { archivos: listed.entries.length ? listed.entries : "(vacío)" },
    };
  }

  if (name === "buscar_archivos") {
    const query = text(args.busqueda, 120);
    if (!query) return { kind: "invalid", response: { error: "Falta qué buscar." } };
    const found = await searchWorkspace(userId, query);
    if (!found.ok) return { kind: "invalid", response: { error: found.error } };
    return { kind: "result", status: `Encontré ${found.coincidencias.length} coincidencia${found.coincidencias.length === 1 ? "" : "s"}`, response: { archivos: found.coincidencias.length ? found.coincidencias : "(sin coincidencias)" } };
  }

  if (name === "leer_archivo") {
    const read = await readWorkspaceFile(userId, text(args.ruta, 300));
    if (!read.ok) return { kind: "invalid", response: { error: read.error } };
    return {
      kind: "result",
      status: `Leí ${read.path}`,
      response: { archivo: read.path, bytes: read.bytes, truncado: read.truncado, contenido: read.contenido },
    };
  }

  if (name === "escribir_archivo") {
    const route = text(args.ruta, 300);
    const content = typeof args.contenido === "string" ? args.contenido : "";
    if (!route || !content) return { kind: "invalid", response: { error: "Falta la ruta o el contenido." } };
    const written = await writeWorkspaceFile(userId, route, content.slice(0, 500_000), args.sobrescribir === true);
    if (!written.ok) return { kind: "invalid", response: { error: written.error } };
    return { kind: "result", status: `Guardé ${written.path}`, response: { archivo: written.path, bytes: written.bytes } };
  }

  if (name === "ver_comandos") {
    return {
      kind: "result",
      status: "Revisé los comandos disponibles",
      response: { comandos: commandAllowlist.map((command) => ({ id: command.id, nombre: command.label, descripcion: command.description })) },
    };
  }

  if (name === "preparar_comando") {
    const command = findCommand(text(args.comando, 40));
    if (!command) return { kind: "invalid", response: { error: "Ese comando no está en la lista permitida. Usa ver_comandos." } };
    return {
      kind: "action",
      action: "run_command",
      payload: { commandId: command.id, label: command.label },
      summary: `Comando: ${command.label}`,
    };
  }

  if (name === "crear_imagen") {
    const prompt = text(args.descripcion, 1000);
    if (prompt.length < 4) return { kind: "invalid", response: { error: "Describe la imagen con un poco más de detalle." } };
    const size = text(args.tamano, 20);
    const orientation = size === "horizontal" ? "Una imagen panorámica, " : size === "vertical" ? "Una imagen vertical, " : "";
    const generated = await generateImage(`${orientation}${prompt}`, size).catch(() => ({
      ok: false as const,
      error: "El proveedor de imagen no respondió.",
    }));
    if (!generated.ok) return { kind: "invalid", response: { error: generated.error } };
    return {
      kind: "delivery",
      action: "create_image",
      payload: { prompt, ...(size ? { size } : {}), dataUrl: generated.dataUrl },
      summary: "Imagen lista",
      modelNote: "La imagen ya se ve en el chat y se puede descargar. No pidas confirmación ni describas el archivo. Ofrece un siguiente paso útil, como usarla en un sitio o en un video.",
    };
  }

  if (name === "crear_video") {
    const title = text(args.titulo, 80);
    const script = text(args.guion, 800);
    if (title.length < 3 || script.length < 12) return { kind: "invalid", response: { error: "El video necesita título y un guion de al menos una frase." } };
    const format = text(args.formato, 8);
    const scenes = scenesFromScript(script).map((scene) => scene.line);
    const html = buildStoryboard(title || "Video", scenes);
    const clip = await generateClip({
      title,
      script,
      format: format === "16:9" || format === "1:1" ? format : "9:16",
      duration: "15 s",
      styleId: "cine",
    });
    const videoUrl = clip.ok ? clip.url : undefined;
    const files = [
      { path: "guion.txt", content: `${title}\n\n${script}\n` },
      { path: "pieza.html", content: html },
    ];
    return {
      kind: "delivery",
      action: "create_video",
      payload: { title, script, scenes, html, ...(videoUrl ? { videoUrl } : {}), files },
      summary: videoUrl ? "Video listo" : "Pieza de video lista para ver",
      modelNote: videoUrl
        ? "El video ya se reproduce en el chat y se puede descargar. No pidas confirmación."
        : "La pieza ya se ve en el chat como secuencia de escenas y se puede descargar. El archivo mp4 no salió en este servidor; no digas que el mp4 está listo.",
    };
  }

  if (name === "entregar_proyecto") {
    const built = buildProject(args);
    if (!built.ok) return { kind: "invalid", response: { error: built.error } };
    return {
      kind: "delivery",
      action: "deliver_project",
      payload: built.project,
      summary: `${built.project.kind === "agente" ? "Agente" : built.project.kind === "sitio" ? "Sitio" : "App"} listo: ${built.project.title}`,
      modelNote:
        "El socio ya ve la vista previa y puede descargar el código. No pegues el HTML. Di en una frase qué incluye y menciona dos sugerencias concretas. Las citas y los mensajes se guardan en el navegador de quien abre el archivo; no digas que hay base de datos, cobros ni hosting incluidos.",
    };
  }

  return { kind: "invalid", response: { error: "Herramienta desconocida." } };
}

export async function executeVegaAction(userId: string, kind: ActionKind, payload: ActionPayload) {
  if (kind === "app_action") return executeAppAction(userId, payload as AppDraft);

  if (kind === "run_command") {
    const draft = payload as CommandDraft;
    const command = findCommand(draft.commandId);
    if (!command) return { ok: false as const, message: "Ese comando ya no está permitido." };
    const built = command.build({});
    if (!built.ok) return { ok: false as const, message: built.error };
    if (!built.args.every((arg) => isSafeArgument(arg))) {
      return { ok: false as const, message: "El comando tenía un argumento no permitido." };
    }
    try {
      const { execFile } = await import("node:child_process");
      const output = await new Promise<{ ok: true; text: string } | { ok: false; text: string }>((resolve) => {
        execFile(built.cmd, built.args, { timeout: 8000, maxBuffer: 64 * 1024, windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            resolve({ ok: false, text: (stderr || error.message).slice(0, 2000) });
            return;
          }
          resolve({ ok: true, text: stdout.trim().slice(0, 2000) || "(sin salida)" });
        });
      });
      return output.ok
        ? { ok: true as const, message: `${command.label}:\n${output.text}` }
        : { ok: false as const, message: `${command.label} falló:\n${output.text}` };
    } catch (error) {
      return { ok: false as const, message: `No se pudo ejecutar: ${error instanceof Error ? error.message : "error desconocido"}` };
    }
  }

  if (kind === "create_image") {
    const draft = payload as ImageDraft;
    const orientation = draft.size === "horizontal" ? "Una imagen panorámica, " : draft.size === "vertical" ? "Una imagen vertical, " : "";
    const generated = await generateImage(`${orientation}${draft.prompt}`).catch(() => ({
      ok: false as const,
      error: "El proveedor de imagen no respondió.",
    }));
    if (!generated.ok) return { ok: false as const, message: `No se generó la imagen: ${generated.error}` };
    return { ok: true as const, message: `Listo, generé tu imagen.\n\n![imagen](${generated.dataUrl})` };
  }

  if (kind === "whatsapp_message") {
    const draft = payload as WhatsappDraft;
    return { ok: true as const, message: `Abriste el mensaje en WhatsApp${draft.name ? ` para ${draft.name}` : ""}.` };
  }

  if (kind === "send_email") {
    const email = payload as EmailDraft;
    const result = await runUserTool(userId, "gmail", "GMAIL_SEND_EMAIL", {
      recipient_email: email.to,
      subject: email.subject,
      body: email.body,
      ...(email.cc?.length ? { cc: email.cc } : {}),
    });
    return result.ok
      ? { ok: true as const, message: `Listo, envié el correo a ${email.to}.` }
      : { ok: false as const, message: `No se envió el correo: ${result.error}` };
  }

  const event = payload as EventDraft;
  const result = await runUserTool(userId, "googlecalendar", "GOOGLECALENDAR_CREATE_EVENT", {
    summary: event.title,
    start_datetime: event.start,
    end_datetime: event.end,
    timezone: TIMEZONE,
    create_meeting_room: event.meet === true,
    send_updates: event.attendees?.length ? "all" : "none",
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    ...(event.attendees?.length ? { attendees: event.attendees } : {}),
  });
  return result.ok
    ? {
        ok: true as const,
        message: `Listo, agendé "${event.title}" en tu calendario${event.meet ? " con enlace de Google Meet (lo ves en el evento)" : ""}.`,
      }
    : { ok: false as const, message: `No se creó el evento: ${result.error}` };
}
