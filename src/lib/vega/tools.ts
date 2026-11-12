import { runUserTool, toolFailure } from "@/lib/ai/composio-user";
import { searchWeb, type WebResult } from "@/lib/ai/search";
import { submitHiggsfieldImage } from "@/lib/ai/higgsfield-image";
import { appToolNames, appTools, executeAppAction, runAppTool, type AppDraft } from "@/lib/vega/app-tools";
import { commandAllowlist, findCommand, generateImage, isSafeArgument } from "@/lib/vega/assistant-tools";
import { listWorkspace, MAX_FILE_BYTES, readWorkspaceFile, searchWorkspace, writeWorkspaceFile } from "@/lib/vega/files";
import { buildProject, buildStoryboard, type ProjectDraft } from "@/lib/vega/build-project";
import { generateClip } from "@/lib/ai/media";
import { saveVegaImageToLibrary, saveVegaVideoToLibrary } from "@/lib/vega/library-media";
import { scenesFromScript } from "@/lib/studio/video-plan";
import { isUserToolkit, toolkitHints, toolkitLabels, userToolkits, type UserToolkit, type VegaConnections } from "@/lib/vega/apps";
import type { FunctionDeclaration } from "@/lib/vega/gemini-stream";
import { runXTool, xToolNames, xTools } from "@/lib/vega/x/tools";
import { forgetMemory, MEMORY_MAX_LENGTH, saveMemory, searchMemories } from "@/lib/vega/memory";
import { memoryKindLabels, parseKind } from "@/lib/vega/memory-logic";
import { saveVegaProfile } from "@/lib/vega/profile";
import { DEFAULT_TIMEZONE, isValidTimezone, MIN_INTERVAL_MINUTES } from "@/lib/vega/schedule";
import {
  createTask,
  DEFAULT_TIME,
  deleteTask,
  listRoutineRuns,
  listTasks,
  maxRoutines,
  pauseTask,
  resumeTask,
  type TaskKind,
  type TaskRepeat,
} from "@/lib/vega/tasks";

export type { VegaConnections } from "@/lib/vega/apps";
export type { AppDraft } from "@/lib/vega/app-tools";

export type ActionKind =
  | "send_email"
  | "create_event"
  | "whatsapp_message"
  | "app_action"
  | "run_command"
  | "create_image"
  | "create_video"
  | "deliver_project"
  | "connect_app";
export type ActionPayload = EmailDraft | EventDraft | WhatsappDraft | AppDraft | CommandDraft | ImageDraft | VideoDraft | ProjectDraft | ConnectDraft;

/** Tarjeta para conectar (o reconectar) una app del socio. No ejecuta nada por sí sola. */
export type ConnectDraft = { toolkit: UserToolkit; label: string; reason: string; reconnect: boolean };

export function connectDraft(toolkit: UserToolkit, reason: string, reconnect = false): ConnectDraft {
  return { toolkit, label: toolkitLabels[toolkit], reason: reason || toolkitHints[toolkit], reconnect };
}

export type EmailDraft = { to: string; cc?: string[]; subject: string; body: string };
export type WhatsappDraft = { phone?: string; name?: string; text: string };
export type CommandDraft = { commandId: string; label: string };
export type ImageDraft = { prompt: string; size?: string; dataUrl?: string; imageUrl?: string; requestId?: string; statusUrl?: string };
export type VideoDraft = {
  title: string;
  script: string;
  scenes: string[];
  html: string;
  videoUrl?: string;
  libraryPieceId?: string;
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
export const freeTools = new Set(["recordar", "olvidar", "buscar_memoria", "programar_rutina", "ver_rutinas", "pausar_rutina", "reanudar_rutina", "borrar_rutina", "preparar_whatsapp", "no_molestar_whatsapp", "actualizar_perfil", "listar_archivos", "buscar_archivos", "leer_archivo", "escribir_archivo", "ver_comandos", "pedir_conexion", "configurar_monitor_x"]);
const taskTools: FunctionDeclaration[] = [
  {
    name: "programar_rutina",
    description: `Crea una rutina: un recordatorio único a una hora exacta o un horario recurrente (diario, lunes a viernes, semanal, mensual o cron personalizado) en la zona horaria del socio. Cuando se cumple, Vega la ejecuta en segundo plano: un recordatorio llega como aviso; una tarea corre un turno completo de Vega con la instrucción guardada. Llega al chat «Recordatorios de Vega», por correo si conectó Gmail y por WhatsApp si lo activó en el panel Rutinas. Los envíos a terceros nunca salen solos: quedan como tarjetas para que el socio confirme. Mínimo ${MIN_INTERVAL_MINUTES} minutos entre ejecuciones; máximo ${maxRoutines()} rutinas.`,
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Nombre corto, p. ej. «Llamar a Mariana»." },
        que_hacer: {
          type: "string",
          description: "Para un recordatorio: el mensaje que recibirá. Para una tarea: la instrucción completa que Vega ejecutará cada vez (sin preguntas: el socio no estará en línea).",
        },
        tipo: { type: "string", enum: ["recordatorio", "tarea"], description: "recordatorio = aviso simple; tarea = Vega redacta, investiga o prepara algo." },
        fecha: { type: "string", description: "YYYY-MM-DD: el día del aviso único o de la primera ejecución." },
        hora: { type: "string", description: `HH:MM en 24 horas, hora local del socio. Si no dio hora, usa ${DEFAULT_TIME} y díselo.` },
        repetir: { type: "string", enum: ["nunca", "diario", "entre_semana", "semanal", "mensual", "personalizado"] },
        cron: {
          type: "string",
          description: "Solo con repetir = personalizado: cron de 5 campos «min hora día mes díaSemana» en hora local, p. ej. «0 9,17 * * 1-5» o «*/30 8-12 * * 1».",
        },
        zona_horaria: { type: "string", description: `Zona IANA si el socio pide otra, p. ej. America/Bogota. Por defecto ${DEFAULT_TIMEZONE}.` },
        usar_web: { type: "boolean", description: "Solo para tareas que necesitan información actual de internet." },
      },
      required: ["titulo", "que_hacer", "tipo", "fecha", "repetir"],
    },
  },
  {
    name: "ver_rutinas",
    description: "Lista las rutinas del socio (activas y en pausa) con su próxima ejecución, y los resultados de las últimas ejecuciones.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "pausar_rutina",
    description: "Pausa una rutina activa sin borrarla. Usa el id que devuelve ver_rutinas.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "reanudar_rutina",
    description: "Reanuda una rutina en pausa; las recurrentes siguen en su próxima hora (no recupera las que se saltaron).",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "borrar_rutina",
    description: "Borra una rutina o recordatorio para siempre. Usa el id que devuelve ver_rutinas.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

export function vegaTools(connections: VegaConnections, webSearch: boolean): FunctionDeclaration[] {
  const tools: FunctionDeclaration[] = [
    {
      name: "recordar",
      description:
        "Guarda un dato duradero del socio para futuras conversaciones: su negocio, metas, clientes, preferencias de tono, horarios, avances o cualquier cosa que pida recordar. Si ya existe un dato casi igual, se actualiza. No guardes datos pasajeros, contraseñas, tarjetas, datos bancarios, llaves ni información de salud.",
      parameters: {
        type: "object",
        properties: {
          dato: { type: "string", description: "El dato en una frase corta en tercera persona, por ejemplo: «Vende suplementos en Guadalajara»." },
          tipo: {
            type: "string",
            enum: ["perfil", "preferencia", "dato", "diario"],
            description: "perfil = quién es y su negocio; preferencia = cómo le gusta trabajar; dato = clientes, metas, cifras; diario = avances o sucesos con fecha.",
          },
        },
        required: ["dato"],
      },
    },
    {
      name: "buscar_memoria",
      description: "Busca en todo lo que recuerdas del socio por palabras clave. Úsalo antes de decir que no sabes algo de él.",
      parameters: {
        type: "object",
        properties: { busqueda: { type: "string", description: "Palabras clave, p. ej. «cliente Mariana» o «meta ventas»." } },
        required: ["busqueda"],
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
      description: "Busca archivos del espacio de trabajo del socio por nombre o por contenido.",
      parameters: {
        type: "object",
        properties: { busqueda: { type: "string", description: "Parte del nombre o del texto a buscar." } },
        required: ["busqueda"],
      },
    },
    {
      name: "leer_archivo",
      description: "Lee un archivo de texto del espacio de trabajo del socio. Devuelve su contenido completo.",
      parameters: {
        type: "object",
        properties: { ruta: { type: "string", description: "Ruta relativa del archivo, p. ej. «notas/ideas.md»." } },
        required: ["ruta"],
      },
    },
    {
      name: "escribir_archivo",
      description:
        "Crea o actualiza un archivo de texto en el espacio de trabajo persistente del socio (las carpetas salen de la ruta). Para reemplazar todo el archivo usa «sobrescribir: true»; por omisión agrega al final. Límite 200 KB por archivo.",
      parameters: {
        type: "object",
        properties: {
          ruta: { type: "string", description: "Ruta relativa del archivo." },
          contenido: { type: "string", description: "Texto a escribir (hasta 200 KB)." },
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
        "Entrega una pieza premium y específica: sitio web, prototipo de app o especificación de agente. Usa nombres, oferta y tono del socio; no inventes precios, reseñas, certificaciones o resultados. Si falta un dato esencial, pregunta antes de llamar esta herramienta; si no, completa la pieza y declara las suposiciones. Sitios: portada con propuesta de valor y CTA, servicios, diferenciadores/proceso, FAQ o testimonios sólo si hay datos, contacto y pie. Apps: una tarea principal completa y probada mediante agenda, herramienta CRUD local o contacto; incluye estados vacíos/confirmación/eliminación. Agentes: misión clara, 3+ reglas concretas, flujo de atención y 3+ ejemplos. La vista previa de app guarda localmente en ese navegador; la vista previa de agente es una simulación por ejemplos. No las describas como sistemas con servidor, IA en vivo, pagos o datos compartidos. Usa mínimo 5 secciones de valor para landing y 3–6 bloques para otras piezas; copy final, no texto placeholder.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          tipo: { type: "string", enum: ["app", "sitio", "agente"] },
          resumen: { type: "string", description: "Una frase de qué hace." },
          color: { type: "string", description: "Color hexadecimal, por ejemplo #0F766E." },
          secciones: {
            type: "array",
            description: "Bloques específicos y en orden. portada={tipo,titulo,texto,boton}; servicios={tipo,titulo,items:[{nombre,detalle,precio?}]}; pasos/preguntas/testimonios/precios={tipo,titulo,items:[{titulo,texto}]}; texto={tipo,titulo,parrafos:[...]}; agenda={tipo,titulo,servicios:[...],nota}; herramienta={tipo,titulo,etiqueta,campos:[...],nota}; contacto={tipo,titulo,campos:[...],nota}; agente={tipo,nombre,mision,reglas:[3 o más],ejemplos:[{persona,respuesta} x3 o más]}. Tipos: portada, servicios, texto, pasos, preguntas, testimonios, precios, agenda, herramienta, contacto o agente. Cada bloque debe aportar valor y llevar copy final.",
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
  // Fase 8: X siempre aparece; si falta la credencial, la herramienta responde con un aviso claro.
  tools.push(...xTools());
  const missing = userToolkits.filter((toolkit) => !connections[toolkit]);
  if (missing.length) {
    tools.push({
      name: "pedir_conexion",
      description:
        "Muestra al socio una tarjeta con el botón para conectar una app que todavía no conecta (o que hay que reconectar) cuando su pedido la necesita. Úsala en lugar de solo decirle que vaya a Conexiones.",
      parameters: {
        type: "object",
        properties: {
          app: { type: "string", enum: missing },
          motivo: { type: "string", description: "Para qué la necesitas, en una frase (p. ej. «para enviar el correo a Mariana»)." },
        },
        required: ["app"],
      },
    });
  }
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
  | { kind: "delivery"; action: ActionKind; payload: ActionPayload; summary: string; modelNote: string; status?: "running" | "done" }
  | { kind: "invalid"; response: Record<string, unknown> };

export async function runVegaTool(userId: string, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  if (appToolNames.has(name)) {
    const outcome = await runAppTool(userId, name, args);
    return outcome.kind === "app" ? { kind: "action", action: "app_action", payload: outcome.payload, summary: outcome.summary } : outcome;
  }

  if (xToolNames.has(name)) return runXTool(userId, name, args);

  if (name === "pedir_conexion") {
    const app = text(args.app, 40).toLowerCase();
    if (!isUserToolkit(app)) return { kind: "invalid", response: { error: "Esa app no se puede conectar desde Vega." } };
    const draft = connectDraft(app, text(args.motivo, 200));
    return {
      kind: "delivery",
      action: "connect_app",
      payload: draft,
      summary: `Te dejé el botón para conectar ${draft.label}`,
      modelNote: `El socio ve una tarjeta con el botón Conectar ${draft.label}. Dile en una frase para qué la necesitas y que cuando la conecte le escriba «listo» para seguir. No inventes que ya está conectada.`,
    };
  }

  if (name === "recordar") {
    const saved = await saveMemory(userId, text(args.dato, MEMORY_MAX_LENGTH), parseKind(args.tipo));
    if (!saved.ok) return { kind: "invalid", response: { error: saved.error } };
    return {
      kind: "result",
      status: saved.duplicate
        ? `Ya lo tenía en memoria: ${saved.memory.content}`
        : saved.updated
          ? `Actualicé en memoria: ${saved.memory.content}`
          : `Guardé en memoria: ${saved.memory.content}`,
      response: { guardado: true, id: saved.memory.id, actualizado: saved.updated },
    };
  }

  if (name === "buscar_memoria") {
    const query = text(args.busqueda, 120);
    if (!query) return { kind: "invalid", response: { error: "Falta qué buscar." } };
    const found = await searchMemories(userId, query);
    return {
      kind: "result",
      status: `Busqué en tu memoria: ${found.length} dato${found.length === 1 ? "" : "s"}`,
      response: {
        recuerdos: found.length
          ? found.map((item) => ({ id: item.id, tipo: memoryKindLabels[parseKind(item.kind)], dato: item.content }))
          : "(sin coincidencias)",
      },
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

  if (name === "programar_rutina") {
    const repeatMap: Record<string, TaskRepeat> = {
      nunca: "once",
      diario: "daily",
      entre_semana: "weekdays",
      semanal: "weekly",
      mensual: "monthly",
      personalizado: "custom",
    };
    const kind: TaskKind = args.tipo === "tarea" ? "task" : "reminder";
    const title = text(args.titulo, 120);
    const instruction = text(args.que_hacer, 1000);
    if (!title || !instruction) return { kind: "invalid", response: { error: "Falta el título o qué hacer." } };
    const zone = text(args.zona_horaria, 64) || DEFAULT_TIMEZONE;
    if (!isValidTimezone(zone)) return { kind: "invalid", response: { error: "Zona horaria no válida; usa un nombre IANA como America/Mexico_City." } };
    const created = await createTask(userId, {
      title,
      instruction,
      kind,
      repeat: repeatMap[text(args.repetir, 20)] ?? "once",
      useWeb: args.usar_web === true,
      date: text(args.fecha, 10),
      time: text(args.hora, 5) || DEFAULT_TIME,
      timezone: zone,
      cron: text(args.cron, 100) || undefined,
    });
    if (!created.ok) return { kind: "invalid", response: { error: created.error } };
    const next = new Date(created.task.runAt).toLocaleString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: created.task.timezone,
    });
    return {
      kind: "result",
      status: `Programé «${title}» · ${created.task.label}`,
      response: { programada: true, id: created.task.id, horario: created.task.label, proxima: next, zona_horaria: created.task.timezone },
    };
  }

  if (name === "ver_rutinas") {
    const [tasks, runs] = await Promise.all([listTasks(userId), listRoutineRuns(userId, 5)]);
    return {
      kind: "result",
      status: "Revisé tus rutinas",
      response: {
        rutinas: tasks.map((task) => ({
          id: task.id,
          titulo: task.title,
          tipo: task.kind === "task" ? "tarea" : task.kind === "x_monitor" ? "monitor de X" : "recordatorio",
          horario: task.label,
          proxima: new Date(task.runAt).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: task.timezone }),
          estado: task.status === "paused" ? "pausada" : "activa",
          ultimo_resultado: task.lastResult,
        })),
        ultimas_ejecuciones: runs.map((run) => ({ rutina: run.title, estado: run.status, resultado: run.result?.slice(0, 300) ?? null, pendientes: run.pendingActions })),
      },
    };
  }

  if (name === "pausar_rutina") {
    const paused = await pauseTask(userId, text(args.id, 40));
    if (!paused.ok) return { kind: "invalid", response: { error: paused.error } };
    return { kind: "result", status: "Pausé una rutina", response: { pausada: true } };
  }

  if (name === "reanudar_rutina") {
    const resumed = await resumeTask(userId, text(args.id, 40));
    if (!resumed.ok) return { kind: "invalid", response: { error: resumed.error } };
    return { kind: "result", status: "Reanudé una rutina", response: { reanudada: true, proxima: resumed.runAt.toISOString() } };
  }

  if (name === "borrar_rutina") {
    const removed = await deleteTask(userId, text(args.id, 40));
    if (!removed) return { kind: "invalid", response: { error: "No encontré esa rutina." } };
    return { kind: "result", status: "Borré una rutina", response: { borrada: true } };
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
    if (!result.ok) return { kind: "invalid", response: toolFailure(result) };
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
    if (!result.ok) return { kind: "invalid", response: toolFailure(result) };
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
    const written = await writeWorkspaceFile(userId, route, content.slice(0, MAX_FILE_BYTES), args.sobrescribir !== true);
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
    const submitted = await submitHiggsfieldImage(prompt, size).catch(() => ({
      ok: false as const,
      error: "No pudimos enviar la solicitud de imagen a Higgsfield.",
    }));
    if (!submitted.ok) return { kind: "invalid", response: { error: submitted.error } };
    return {
      kind: "delivery",
      action: "create_image",
      payload: {
        prompt,
        ...(size ? { size } : {}),
        requestId: submitted.submission.requestId,
        statusUrl: submitted.submission.statusUrl,
      },
      summary: "Generando imagen",
      modelNote:
        "Higgsfield aceptó la solicitud y la imagen se está generando en segundo plano. Di que está en proceso, no afirmes que ya quedó. La imagen aparecerá aquí automáticamente.",
      status: "running",
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
    const savedVideo = await saveVegaVideoToLibrary(userId, {
      title,
      script,
      scenes,
      html,
      ...(videoUrl ? { videoUrl } : {}),
      files: [],
    });
    const libraryVideoUrl = savedVideo.media
      ? `/api/library/video?pieceId=${encodeURIComponent(savedVideo.id)}`
      : undefined;
    const files = [
      { path: "guion.txt", content: `${title}\n\n${script}\n` },
      { path: "pieza.html", content: html },
    ];
    return {
      kind: "delivery",
      action: "create_video",
      payload: {
        title,
        script,
        scenes,
        html,
        libraryPieceId: savedVideo.id,
        ...(libraryVideoUrl ? { videoUrl: libraryVideoUrl } : {}),
        files,
      },
      summary: videoUrl ? "Video listo" : "Pieza de video lista para ver",
      modelNote: videoUrl
        ? "El video ya se reproduce en el chat, se puede descargar y quedó guardado en la Biblioteca. No pidas confirmación."
        : "La pieza ya se ve en el chat como secuencia de escenas, se puede descargar y el guion quedó guardado en la Biblioteca. El archivo mp4 no salió en este servidor; no digas que el mp4 está listo.",
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
    const piece = await saveVegaImageToLibrary(userId, draft.prompt, generated.dataUrl);
    const imageUrl = `/api/library/image?pieceId=${encodeURIComponent(piece.id)}`;
    return { ok: true as const, message: `Listo, generé tu imagen y la guardé en la Biblioteca.\n\n![imagen](${imageUrl})` };
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

  if (kind !== "create_event") return { ok: false as const, message: "Esta acción no se ejecuta con confirmación." };

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
