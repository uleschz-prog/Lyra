import { runUserTool } from "@/lib/ai/composio-user";
import type { VegaConnections } from "@/lib/vega/apps";
import type { FunctionDeclaration } from "@/lib/vega/gemini-stream";
import { approvedTemplates, blockPhone, isBlocked, normalizePhone, sendBusinessWhatsapp, unblockPhone } from "@/lib/vega/whatsapp-business";

const TIMEZONE = "America/Mexico_City";
const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type AppOp = "sheet_append" | "doc_create" | "zoom_meeting" | "social_post" | "payment_link" | "whatsapp_send";

export type AppDraft = {
  op: AppOp;
  title: string;
  lines: { label: string; value: string }[];
  body?: string;
  confirm: string;
  data: Record<string, unknown>;
};

export type AppToolOutcome =
  | { kind: "result"; response: Record<string, unknown>; status: string }
  | { kind: "app"; payload: AppDraft; summary: string }
  | { kind: "invalid"; response: Record<string, unknown> };

type Social = "instagram" | "facebook" | "linkedin";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Primer valor dentro de una respuesta anidada cuyo nombre coincide y pasa el filtro. */
function findValue(data: unknown, key: string, accept: (value: unknown) => boolean = (value) => typeof value === "string" && value !== "", depth = 0): unknown {
  if (!data || typeof data !== "object" || depth > 8) return undefined;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findValue(item, key, accept, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = data as Record<string, unknown>;
  if (key in record && accept(record[key])) return record[key];
  for (const value of Object.values(record)) {
    const found = findValue(value, key, accept, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findString(data: unknown, key: string, test?: (value: string) => boolean) {
  const value = findValue(data, key, (item) => typeof item === "string" && item !== "" && (!test || test(item)));
  return typeof value === "string" ? value : "";
}

function findList(data: unknown, key: string) {
  const value = findValue(data, key, Array.isArray);
  return Array.isArray(value) ? value : [];
}

function brief(data: unknown, max = 8000) {
  const json = JSON.stringify(data);
  return json.length > max ? `${json.slice(0, max)}…` : json;
}

function sheetPrefix(sheet: string) {
  return sheet ? `'${sheet.replace(/'/g, "''")}'!` : "";
}

export function appTools(connections: VegaConnections): FunctionDeclaration[] {
  const tools: FunctionDeclaration[] = [];

  if (connections.googledrive) {
    tools.push(
      {
        name: "buscar_archivos",
        description: "Busca archivos del Google Drive del socio por nombre (documentos, hojas, presentaciones, PDFs). Devuelve id y enlace.",
        parameters: {
          type: "object",
          properties: { busqueda: { type: "string", description: "Parte del nombre del archivo." } },
          required: ["busqueda"],
        },
      },
      {
        name: "leer_hoja",
        description: "Lee una hoja de Google Sheets del socio, por ejemplo su lista de prospectos. Usa el id que devuelve buscar_archivos.",
        parameters: {
          type: "object",
          properties: {
            hoja_id: { type: "string", description: "Id del archivo de Sheets." },
            rango: { type: "string", description: "Rango A1 opcional, p. ej. «Prospectos!A1:F200». Por omisión lee la primera pestaña." },
          },
          required: ["hoja_id"],
        },
      },
      {
        name: "preparar_fila",
        description: "Prepara una fila nueva al final de una hoja de Google Sheets (p. ej. un prospecto nuevo). NO la escribe: el socio confirma con un botón. Lee antes la hoja para respetar el orden de las columnas.",
        parameters: {
          type: "object",
          properties: {
            hoja_id: { type: "string" },
            hoja_nombre: { type: "string", description: "Nombre del archivo, para mostrarlo al socio." },
            pestana: { type: "string", description: "Nombre de la pestaña (opcional; por omisión la primera)." },
            valores: { type: "array", items: { type: "string" }, description: "Valores de la fila en el orden de las columnas." },
          },
          required: ["hoja_id", "valores"],
        },
      },
      {
        name: "preparar_documento",
        description: "Prepara un documento nuevo de Google Docs en el Drive del socio (guiones, planes, presentaciones de texto). NO lo crea: el socio confirma con un botón.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            contenido: { type: "string", description: "Texto completo del documento, en texto plano con saltos de línea." },
          },
          required: ["titulo", "contenido"],
        },
      },
    );
  }

  if (connections.zoom) {
    tools.push({
      name: "preparar_zoom",
      description: "Prepara una reunión de Zoom del socio. NO la crea: el socio confirma con un botón y recibe el enlace.",
      parameters: {
        type: "object",
        properties: {
          tema: { type: "string" },
          inicio: { type: "string", description: `YYYY-MM-DDTHH:MM, hora de ${TIMEZONE}.` },
          duracion_min: { type: "integer", description: "Duración en minutos (15 a 240)." },
          agenda: { type: "string", description: "Descripción opcional." },
        },
        required: ["tema", "inicio"],
      },
    });
  }

  if (connections.calendly) {
    tools.push({
      name: "ver_calendly",
      description: "Consulta las próximas citas que le agendaron al socio en Calendly y su enlace personal para agendar.",
      parameters: { type: "object", properties: {} },
    });
  }

  const networks = (["instagram", "facebook", "linkedin"] as const).filter((network) => connections[network]);
  if (networks.length) {
    tools.push({
      name: "preparar_publicacion",
      description:
        "Prepara una publicación para una red social del socio. NO la publica: el socio la revisa y confirma con un botón. Instagram exige una imagen JPEG con enlace público; Facebook y LinkedIn aceptan solo texto.",
      parameters: {
        type: "object",
        properties: {
          red: { type: "string", enum: networks },
          texto: { type: "string", description: "Texto final de la publicación, con hashtags si aplica." },
          imagen_url: { type: "string", description: "Enlace público https a una imagen JPEG (obligatorio en Instagram)." },
          enlace: { type: "string", description: "Enlace para compartir (solo Facebook, opcional)." },
          pagina: { type: "string", description: "Nombre de la página de Facebook, si administra varias." },
        },
        required: ["red", "texto"],
      },
    });
  }

  if (connections.stripe) {
    tools.push(
      {
        name: "ver_cobros",
        description: "Consulta los pagos recientes que recibió el socio en Stripe.",
        parameters: {
          type: "object",
          properties: { dias: { type: "integer", description: "Días hacia atrás (1 a 90). Por omisión 30." } },
        },
      },
      {
        name: "preparar_link_pago",
        description: "Prepara un enlace de pago de Stripe para un producto o servicio del socio. NO lo crea: el socio confirma con un botón.",
        parameters: {
          type: "object",
          properties: {
            producto: { type: "string" },
            precio: { type: "number", description: "Precio en la moneda indicada, p. ej. 499.00." },
            moneda: { type: "string", enum: ["mxn", "usd"], description: "Por omisión mxn." },
          },
          required: ["producto", "precio"],
        },
      },
    );
  }

  if (connections.whatsapp) {
    tools.push(
      {
        name: "ver_plantillas_whatsapp",
        description: "Lista las plantillas aprobadas por Meta en el WhatsApp Business del socio, con su texto y número de variables.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "preparar_whatsapp_negocio",
        description:
          "Prepara un mensaje que sale desde el número de WhatsApp Business del socio. NO lo envía: el socio confirma con un botón. Usa «texto» solo si el contacto le escribió al socio en las últimas 24 horas; para un primer contacto o si pasaron más de 24 horas usa «plantilla» (consulta antes ver_plantillas_whatsapp).",
        parameters: {
          type: "object",
          properties: {
            telefono: { type: "string", description: "Número del contacto con código de país, p. ej. 5215512345678." },
            nombre: { type: "string", description: "Nombre del contacto (opcional)." },
            texto: { type: "string", description: "Mensaje libre (solo dentro de la ventana de 24 horas)." },
            plantilla: { type: "string", description: "Nombre exacto de la plantilla aprobada." },
            variables: { type: "array", items: { type: "string" }, description: "Valores de {{1}}, {{2}}… en orden." },
          },
          required: ["telefono"],
        },
      },
      {
        name: "no_molestar_whatsapp",
        description: "Agrega o quita un número de la lista de no molestar del socio. Úsala en cuanto un contacto pida no recibir mensajes. Vega nunca envía a números de esa lista.",
        parameters: {
          type: "object",
          properties: {
            telefono: { type: "string" },
            accion: { type: "string", enum: ["agregar", "quitar"] },
          },
          required: ["telefono", "accion"],
        },
      },
    );
  }

  return tools;
}

export const appToolNames = new Set([
  "ver_plantillas_whatsapp",
  "preparar_whatsapp_negocio",
  "no_molestar_whatsapp",
  "buscar_archivos",
  "leer_hoja",
  "preparar_fila",
  "preparar_documento",
  "preparar_zoom",
  "ver_calendly",
  "preparar_publicacion",
  "ver_cobros",
  "preparar_link_pago",
]);

export function appStatusLabel(name: string) {
  const labels: Record<string, string> = {
    buscar_archivos: "Buscando en tu Drive…",
    leer_hoja: "Leyendo tu hoja…",
    preparar_fila: "Preparando la fila…",
    preparar_documento: "Preparando el documento…",
    preparar_zoom: "Preparando la reunión de Zoom…",
    ver_calendly: "Revisando tu Calendly…",
    preparar_publicacion: "Preparando la publicación…",
    ver_cobros: "Revisando tus cobros…",
    preparar_link_pago: "Preparando el enlace de pago…",
    ver_plantillas_whatsapp: "Revisando tus plantillas de WhatsApp…",
    preparar_whatsapp_negocio: "Preparando el mensaje de WhatsApp…",
    no_molestar_whatsapp: "Actualizando tu lista de no molestar…",
  };
  return labels[name];
}

export async function runAppTool(userId: string, name: string, args: Record<string, unknown>): Promise<AppToolOutcome> {
  if (name === "buscar_archivos") {
    const query = text(args.busqueda, 120).replace(/\\/g, "").replace(/'/g, "\\'");
    if (!query) return { kind: "invalid", response: { error: "Falta qué buscar." } };
    const result = await runUserTool(userId, "googledrive", "GOOGLEDRIVE_FIND_FILE", {
      q: `name contains '${query}' and trashed = false`,
      pageSize: 10,
      fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
    });
    if (!result.ok) return { kind: "invalid", response: { error: result.error } };
    const files = findList(result.data, "files").slice(0, 10);
    return { kind: "result", status: `Encontré ${files.length} archivo${files.length === 1 ? "" : "s"} en tu Drive`, response: { archivos: files } };
  }

  if (name === "leer_hoja") {
    const id = text(args.hoja_id, 120);
    if (!id) return { kind: "invalid", response: { error: "Falta el id de la hoja. Búscala primero con buscar_archivos." } };
    const result = await runUserTool(userId, "googledrive", "GOOGLEDRIVE_GET_SPREADSHEET_VALUES", {
      spreadsheet_id: id,
      range: text(args.rango, 80) || "A1:Z200",
    });
    if (!result.ok) return { kind: "invalid", response: { error: result.error } };
    return { kind: "result", status: "Leí tu hoja", response: { filas: brief(findList(result.data, "values")) } };
  }

  if (name === "preparar_fila") {
    const id = text(args.hoja_id, 120);
    const values = Array.isArray(args.valores) ? args.valores.map((value) => String(value ?? "").slice(0, 500)).slice(0, 26) : [];
    if (!id || !values.length) return { kind: "invalid", response: { error: "Faltan la hoja o los valores de la fila." } };
    const sheet = text(args.pestana, 80);
    const fileName = text(args.hoja_nombre, 120) || "tu hoja";
    return {
      kind: "app",
      summary: `Fila nueva en ${fileName}`,
      payload: {
        op: "sheet_append",
        title: `Fila nueva en ${fileName}${sheet ? ` · ${sheet}` : ""}`,
        lines: values.map((value, index) => ({ label: `Columna ${String.fromCharCode(65 + index)}`, value })),
        confirm: "Agregar fila",
        data: { spreadsheetId: id, sheet, values },
      },
    };
  }

  if (name === "preparar_documento") {
    const title = text(args.titulo, 150);
    const content = text(args.contenido, 20000);
    if (!title || !content) return { kind: "invalid", response: { error: "El documento necesita título y contenido." } };
    return {
      kind: "app",
      summary: `Documento: ${title}`,
      payload: { op: "doc_create", title: `Documento de Google Docs: ${title}`, lines: [], body: content, confirm: "Crear documento", data: { title, content } },
    };
  }

  if (name === "preparar_zoom") {
    const topic = text(args.tema, 200);
    const start = text(args.inicio, 16);
    const duration = Math.min(240, Math.max(15, Math.round(Number(args.duracion_min) || 30)));
    if (!topic || !localDateTime.test(start)) {
      return { kind: "invalid", response: { error: "La reunión necesita tema e inicio en formato YYYY-MM-DDTHH:MM." } };
    }
    const agenda = text(args.agenda, 1500);
    const [date, time] = start.split("T");
    return {
      kind: "app",
      summary: `Zoom: ${topic}`,
      payload: {
        op: "zoom_meeting",
        title: `Reunión de Zoom: ${topic}`,
        lines: [
          { label: "Cuándo", value: `${date.split("-").reverse().join("/")} a las ${time} (Ciudad de México)` },
          { label: "Duración", value: `${duration} min` },
        ],
        ...(agenda ? { body: agenda } : {}),
        confirm: "Crear reunión",
        data: { topic, start, duration, agenda },
      },
    };
  }

  if (name === "ver_calendly") {
    const me = await runUserTool(userId, "calendly", "CALENDLY_GET_USER", { uuid: "me" });
    if (!me.ok) return { kind: "invalid", response: { error: me.error } };
    const uri = findString(me.data, "uri", (value) => value.includes("/users/"));
    const link = findString(me.data, "scheduling_url");
    if (!uri) return { kind: "invalid", response: { error: "Calendly no devolvió el usuario." } };
    const events = await runUserTool(userId, "calendly", "CALENDLY_LIST_SCHEDULED_EVENTS", {
      user: uri,
      min_start_time: new Date().toISOString(),
      sort: "start_time:asc",
      status: "active",
      count: 20,
    });
    if (!events.ok) return { kind: "invalid", response: { error: events.error } };
    const list = findList(events.data, "collection").map((event) => {
      const record = (event ?? {}) as Record<string, unknown>;
      return { nombre: record.name, inicio: record.start_time, fin: record.end_time, lugar: findString(record.location, "join_url") || undefined };
    });
    return {
      kind: "result",
      status: `Revisé tu Calendly: ${list.length} cita${list.length === 1 ? "" : "s"} próxima${list.length === 1 ? "" : "s"}`,
      response: { enlace_para_agendar: link, citas: list, nota: "Las horas vienen en UTC; conviértelas a hora de Ciudad de México (UTC-6)." },
    };
  }

  if (name === "preparar_publicacion") {
    const network = text(args.red, 20) as Social;
    const message = text(args.texto, 3000);
    const image = text(args.imagen_url, 800);
    const link = text(args.enlace, 800);
    if (!["instagram", "facebook", "linkedin"].includes(network) || !message) {
      return { kind: "invalid", response: { error: "La publicación necesita red y texto." } };
    }
    if (image && !/^https:\/\//.test(image)) return { kind: "invalid", response: { error: "La imagen debe ser un enlace https público." } };
    if (network === "instagram" && !image) {
      return { kind: "invalid", response: { error: "Instagram necesita una imagen. Pídele al socio un enlace público https a una imagen JPEG." } };
    }

    let page: { id: string; name: string } | null = null;
    if (network === "facebook") {
      const pages = await runUserTool(userId, "facebook", "FACEBOOK_LIST_MANAGED_PAGES", { fields: "id,name", limit: 25 });
      if (!pages.ok) return { kind: "invalid", response: { error: pages.error } };
      const list = findList(pages.data, "data")
        .map((item) => item as { id?: unknown; name?: unknown })
        .filter((item): item is { id: string; name: string } => typeof item.id === "string" && typeof item.name === "string");
      if (!list.length) return { kind: "invalid", response: { error: "El socio no administra páginas de Facebook. Solo se puede publicar en páginas." } };
      const wanted = text(args.pagina, 120).toLowerCase();
      page = (wanted && list.find((item) => item.name.toLowerCase().includes(wanted))) || list[0];
      if (list.length > 1 && !wanted) {
        return {
          kind: "invalid",
          response: { error: "El socio administra varias páginas. Pregúntale en cuál publicar.", paginas: list.map((item) => item.name) },
        };
      }
    }

    const labels: Record<Social, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn" };
    return {
      kind: "app",
      summary: `Publicación en ${labels[network]}`,
      payload: {
        op: "social_post",
        title: `Publicación en ${labels[network]}${page ? ` · ${page.name}` : ""}`,
        lines: [
          ...(image ? [{ label: "Imagen", value: image }] : []),
          ...(link && network === "facebook" ? [{ label: "Enlace", value: link }] : []),
        ],
        body: message,
        confirm: "Publicar",
        data: { network, message, image, link: network === "facebook" ? link : "", pageId: page?.id ?? "" },
      },
    };
  }

  if (name === "ver_cobros") {
    const days = Math.min(90, Math.max(1, Math.round(Number(args.dias) || 30)));
    const result = await runUserTool(userId, "stripe", "STRIPE_LIST_PAYMENT_INTENTS", {
      limit: 50,
      created: { gte: Math.floor(Date.now() / 1000) - days * 86_400 },
    });
    if (!result.ok) return { kind: "invalid", response: { error: result.error } };
    const payments = findList(result.data, "data").map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        monto: typeof record.amount === "number" ? record.amount / 100 : record.amount,
        moneda: record.currency,
        estado: record.status,
        fecha: typeof record.created === "number" ? new Date(record.created * 1000).toISOString().slice(0, 10) : undefined,
        descripcion: record.description,
      };
    });
    return { kind: "result", status: `Revisé tus cobros de los últimos ${days} días`, response: { cobros: payments } };
  }

  if (name === "preparar_link_pago") {
    const product = text(args.producto, 150);
    const price = Number(args.precio);
    const currency = args.moneda === "usd" ? "usd" : "mxn";
    if (!product || !Number.isFinite(price) || price < 10 || price > 500_000) {
      return { kind: "invalid", response: { error: "El enlace necesita producto y un precio válido (mínimo 10)." } };
    }
    const amount = Math.round(price * 100);
    return {
      kind: "app",
      summary: `Enlace de pago: ${product}`,
      payload: {
        op: "payment_link",
        title: `Enlace de pago de Stripe: ${product}`,
        lines: [{ label: "Precio", value: `$${(amount / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${currency.toUpperCase()}` }],
        confirm: "Crear enlace",
        data: { product, amount, currency },
      },
    };
  }

  if (name === "ver_plantillas_whatsapp") {
    const result = await approvedTemplates(userId);
    if (!result.ok) return { kind: "invalid", response: { error: result.error } };
    return {
      kind: "result",
      status: `Revisé tus plantillas: ${result.templates.length} aprobada${result.templates.length === 1 ? "" : "s"}`,
      response: {
        plantillas: result.templates.map((template) => ({
          nombre: template.name,
          idioma: template.language,
          categoria: template.category,
          texto: template.body,
          variables: template.variables,
        })),
      },
    };
  }

  if (name === "no_molestar_whatsapp") {
    const phone = normalizePhone(args.telefono);
    if (!phone) return { kind: "invalid", response: { error: "El número necesita código de país." } };
    if (args.accion === "quitar") {
      await unblockPhone(userId, phone);
      return { kind: "result", status: "Quité el número de no molestar", response: { quitado: phone } };
    }
    await blockPhone(userId, phone);
    return { kind: "result", status: "Agregué el número a no molestar", response: { bloqueado: phone } };
  }

  if (name === "preparar_whatsapp_negocio") {
    const phone = normalizePhone(args.telefono);
    if (!phone) return { kind: "invalid", response: { error: "El número necesita código de país, p. ej. 5215512345678." } };
    if (await isBlocked(userId, phone)) {
      return { kind: "invalid", response: { error: "Ese contacto pidió no recibir mensajes (lista de no molestar). No le envíes nada." } };
    }
    const contact = text(args.nombre, 80);
    const to = contact ? `${contact} · +${phone}` : `+${phone}`;
    const templateName = text(args.plantilla, 120);

    if (!templateName) {
      const message = text(args.texto, 4096);
      if (!message) return { kind: "invalid", response: { error: "Falta el texto o la plantilla." } };
      return {
        kind: "app",
        summary: `WhatsApp a ${to}`,
        payload: {
          op: "whatsapp_send",
          title: "Mensaje desde tu WhatsApp Business",
          lines: [
            { label: "Para", value: to },
            { label: "Aviso", value: "Solo llega si este contacto te escribió en las últimas 24 horas; si no, usa una plantilla." },
          ],
          body: message,
          confirm: "Enviar WhatsApp",
          data: { phone, text: message },
        },
      };
    }

    const listed = await approvedTemplates(userId);
    if (!listed.ok) return { kind: "invalid", response: { error: listed.error } };
    const template = listed.templates.find((item) => item.name === templateName);
    if (!template) {
      return { kind: "invalid", response: { error: "Esa plantilla no existe o no está aprobada.", aprobadas: listed.templates.map((item) => item.name) } };
    }
    const variables = Array.isArray(args.variables) ? args.variables.map((value) => String(value ?? "").trim().slice(0, 900)) : [];
    if (variables.length !== template.variables || variables.some((value) => !value)) {
      return { kind: "invalid", response: { error: `La plantilla ${template.name} necesita ${template.variables} variable(s) con valor.`, texto: template.body } };
    }
    const preview = template.body.replace(/\{\{(\d+)\}\}/g, (match, index: string) => variables[Number(index) - 1] ?? match);
    return {
      kind: "app",
      summary: `Plantilla ${template.name} a ${to}`,
      payload: {
        op: "whatsapp_send",
        title: "Plantilla desde tu WhatsApp Business",
        lines: [
          { label: "Para", value: to },
          { label: "Plantilla", value: `${template.name} (${template.language})` },
          ...(template.category === "MARKETING"
            ? [{ label: "Consentimiento", value: "Es de marketing: envíala solo a quien aceptó recibir tus mensajes." }]
            : []),
        ],
        body: preview,
        confirm: "Enviar plantilla",
        data: { phone, template: template.name, language: template.language, variables },
      },
    };
  }

  return { kind: "invalid", response: { error: "Herramienta desconocida." } };
}

type Done = { ok: true; message: string } | { ok: false; message: string };

export async function executeAppAction(userId: string, draft: AppDraft): Promise<Done> {
  const data = draft.data;

  if (draft.op === "whatsapp_send") {
    const phone = String(data.phone ?? "");
    const sent = await sendBusinessWhatsapp(
      userId,
      phone,
      typeof data.template === "string"
        ? { template: data.template, language: String(data.language ?? "es_MX"), variables: Array.isArray(data.variables) ? data.variables.map(String) : [] }
        : { text: String(data.text ?? "") },
    );
    return sent.ok
      ? { ok: true, message: `Listo, envié el WhatsApp a +${phone}${sent.from ? ` desde ${sent.from}` : ""}.` }
      : { ok: false, message: `No se envió el WhatsApp: ${sent.error}` };
  }

  if (draft.op === "sheet_append") {
    const spreadsheetId = String(data.spreadsheetId ?? "");
    const prefix = sheetPrefix(String(data.sheet ?? ""));
    const values = Array.isArray(data.values) ? data.values.map(String) : [];
    const current = await runUserTool(userId, "googledrive", "GOOGLEDRIVE_GET_SPREADSHEET_VALUES", {
      spreadsheet_id: spreadsheetId,
      range: `${prefix}A1:Z5000`,
    });
    if (!current.ok) return { ok: false, message: `No se agregó la fila: ${current.error}` };
    const next = findList(current.data, "values").length + 1;
    const written = await runUserTool(userId, "googledrive", "GOOGLEDRIVE_UPDATE_SPREADSHEET_VALUES", {
      spreadsheet_id: spreadsheetId,
      range: `${prefix}A${next}`,
      value_input_option: "USER_ENTERED",
      values: [values],
    });
    return written.ok
      ? { ok: true, message: `Listo, agregué la fila ${next} a tu hoja.` }
      : { ok: false, message: `No se agregó la fila: ${written.error}` };
  }

  if (draft.op === "doc_create") {
    const created = await runUserTool(userId, "googledrive", "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT", {
      file_name: String(data.title ?? "Documento de Vega"),
      text_content: String(data.content ?? ""),
      mime_type: "application/vnd.google-apps.document",
    });
    if (!created.ok) return { ok: false, message: `No se creó el documento: ${created.error}` };
    const id = findString(created.data, "id");
    return {
      ok: true,
      message: id
        ? `Listo, creé el documento en tu Drive: [abrir documento](https://docs.google.com/document/d/${id}/edit)`
        : "Listo, creé el documento en tu Drive.",
    };
  }

  if (draft.op === "zoom_meeting") {
    const created = await runUserTool(userId, "zoom", "ZOOM_CREATE_A_MEETING", {
      user_id: "me",
      topic: String(data.topic ?? ""),
      type: 2,
      start_time: `${String(data.start ?? "")}:00`,
      duration: Number(data.duration) || 30,
      timezone: TIMEZONE,
      ...(data.agenda ? { agenda: String(data.agenda) } : {}),
    });
    if (!created.ok) return { ok: false, message: `No se creó la reunión: ${created.error}` };
    const join = findString(created.data, "join_url");
    return { ok: true, message: join ? `Listo, creé la reunión de Zoom. Enlace para compartir: ${join}` : "Listo, creé la reunión de Zoom." };
  }

  if (draft.op === "social_post") {
    const network = String(data.network ?? "") as Social;
    const message = String(data.message ?? "");
    const image = String(data.image ?? "");

    if (network === "facebook") {
      const pageId = String(data.pageId ?? "");
      const posted = image
        ? await runUserTool(userId, "facebook", "FACEBOOK_CREATE_PHOTO_POST", { page_id: pageId, url: image, message, published: true })
        : await runUserTool(userId, "facebook", "FACEBOOK_CREATE_POST", {
            page_id: pageId,
            message,
            published: true,
            ...(data.link ? { link: String(data.link) } : {}),
          });
      return posted.ok ? { ok: true, message: "Listo, publiqué en tu página de Facebook." } : { ok: false, message: `No se publicó: ${posted.error}` };
    }

    if (network === "instagram") {
      const info = await runUserTool(userId, "instagram", "INSTAGRAM_GET_USER_INFO", {});
      const igUser = (info.ok && findString(info.data, "id", (value) => /^\d+$/.test(value))) || "me";
      const container = await runUserTool(userId, "instagram", "INSTAGRAM_POST_IG_USER_MEDIA", {
        ig_user_id: igUser,
        image_url: image,
        caption: message.replace(/#/g, "%23"),
      });
      if (!container.ok) return { ok: false, message: `No se publicó en Instagram: ${container.error}` };
      const creationId = findString(container.data, "id", (value) => /^\d+$/.test(value));
      if (!creationId) return { ok: false, message: "Instagram no aceptó la imagen. Revisa que el enlace sea público y en JPEG." };
      const published = await runUserTool(userId, "instagram", "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", {
        ig_user_id: igUser,
        creation_id: creationId,
      });
      return published.ok
        ? { ok: true, message: "Listo, publiqué en tu Instagram." }
        : { ok: false, message: `No se publicó en Instagram: ${published.error}` };
    }

    const me = await runUserTool(userId, "linkedin", "LINKEDIN_GET_MY_INFO", {});
    if (!me.ok) return { ok: false, message: `No se publicó en LinkedIn: ${me.error}` };
    const urn =
      findString(me.data, "author_id", (value) => value.startsWith("urn:li:person:")) ||
      (() => {
        const id = findString(me.data, "sub") || findString(me.data, "id");
        return id ? (id.startsWith("urn:") ? id : `urn:li:person:${id}`) : "";
      })();
    if (!urn) return { ok: false, message: "LinkedIn no devolvió tu perfil. Vuelve a conectarlo." };
    const posted = await runUserTool(userId, "linkedin", "LINKEDIN_CREATE_LINKED_IN_POST", {
      author: urn,
      commentary: message,
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
    });
    return posted.ok ? { ok: true, message: "Listo, publiqué en tu LinkedIn." } : { ok: false, message: `No se publicó en LinkedIn: ${posted.error}` };
  }

  const price = await runUserTool(userId, "stripe", "STRIPE_CREATE_PRICE", {
    currency: String(data.currency ?? "mxn"),
    unit_amount: Number(data.amount),
    product_data: { name: String(data.product ?? "Producto") },
  });
  if (!price.ok) return { ok: false, message: `No se creó el enlace: ${price.error}` };
  const priceId = findString(price.data, "id", (value) => value.startsWith("price_"));
  if (!priceId) return { ok: false, message: "Stripe no devolvió el precio." };
  const link = await runUserTool(userId, "stripe", "STRIPE_CREATE_PAYMENT_LINK", { line_items: [{ price: priceId, quantity: 1 }] });
  if (!link.ok) return { ok: false, message: `No se creó el enlace: ${link.error}` };
  const url = findString(link.data, "url", (value) => value.startsWith("https://"));
  return { ok: true, message: url ? `Listo, este es tu enlace de pago: ${url}` : "Listo, creé el enlace de pago en tu Stripe." };
}
