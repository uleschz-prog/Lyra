/**
 * Gmail: organizar correos (papelera, eliminar, archivar, leído, destacar, etiquetas, mover).
 *
 * Vega prepara la acción con los correos exactos (por id o por una búsqueda) y el socio la
 * confirma en la tarjeta. Riesgo (policy.ts → classifyAction):
 * - borrar (papelera o eliminar para siempre): siempre con Confirmar, sea uno o muchos.
 * - lo demás (archivar, leído, destacar, etiquetas, mover, spam, restaurar) es
 *   reversible y respeta la autonomía del socio.
 */
import { runUserTool, toolFailure, type UserToolResult } from "@/lib/ai/composio-user";
import type { UserToolkit } from "@/lib/vega/apps";
import type { FunctionDeclaration } from "@/lib/vega/gemini-stream";

export const GMAIL_ORGANIZE_OP = "gmail_organize" as const;

export const gmailActions = [
  "papelera",
  "eliminar_definitivo",
  "restaurar",
  "archivar",
  "mover_a_recibidos",
  "leido",
  "no_leido",
  "destacar",
  "quitar_destacado",
  "importante",
  "no_importante",
  "etiquetar",
  "quitar_etiqueta",
  "mover",
  "spam",
  "no_spam",
] as const;

export type GmailAction = (typeof gmailActions)[number];

export function isGmailAction(value: string): value is GmailAction {
  return (gmailActions as readonly string[]).includes(value);
}

/** Cómo se ejecuta en Gmail: cambio de etiquetas, papelera, restaurar o borrado definitivo. */
export type GmailMode = "modify" | "trash" | "untrash" | "delete";

export type GmailPlan = { mode: GmailMode; add: string[]; remove: string[] };

/** Máximo de correos por acción (una tarjeta). */
export const GMAIL_MAX_MESSAGES = 500;
/** Correos de muestra en la tarjeta. */
const PREVIEW = 5;

const verbs: Record<GmailAction, { title: string; confirm: string; done: string }> = {
  papelera: { title: "Mover a la papelera", confirm: "Mover a la papelera", done: "moví a la papelera" },
  eliminar_definitivo: { title: "Eliminar para siempre", confirm: "Eliminar para siempre", done: "eliminé para siempre" },
  restaurar: { title: "Sacar de la papelera", confirm: "Restaurar", done: "restauré" },
  archivar: { title: "Archivar", confirm: "Archivar", done: "archivé" },
  mover_a_recibidos: { title: "Mover a Recibidos", confirm: "Mover a Recibidos", done: "moví a Recibidos" },
  leido: { title: "Marcar como leído", confirm: "Marcar como leído", done: "marqué como leído" },
  no_leido: { title: "Marcar como no leído", confirm: "Marcar como no leído", done: "marqué como no leído" },
  destacar: { title: "Destacar", confirm: "Destacar", done: "destaqué" },
  quitar_destacado: { title: "Quitar destacado", confirm: "Quitar destacado", done: "quité el destacado a" },
  importante: { title: "Marcar como importante", confirm: "Marcar importante", done: "marqué como importante" },
  no_importante: { title: "Quitar importante", confirm: "Quitar importante", done: "quité importante a" },
  etiquetar: { title: "Poner etiqueta", confirm: "Poner etiqueta", done: "etiqueté" },
  quitar_etiqueta: { title: "Quitar etiqueta", confirm: "Quitar etiqueta", done: "quité la etiqueta a" },
  mover: { title: "Mover a otra etiqueta", confirm: "Mover", done: "moví" },
  spam: { title: "Marcar como spam", confirm: "Marcar como spam", done: "mandé a spam" },
  no_spam: { title: "No es spam", confirm: "No es spam", done: "saqué de spam" },
};

/** Etiquetas del sistema con su nombre en español (como las ve el socio en Gmail). */
const systemLabels: Record<string, string> = {
  recibidos: "INBOX",
  "bandeja de entrada": "INBOX",
  inbox: "INBOX",
  destacados: "STARRED",
  destacado: "STARRED",
  starred: "STARRED",
  importantes: "IMPORTANT",
  importante: "IMPORTANT",
  important: "IMPORTANT",
  spam: "SPAM",
  papelera: "TRASH",
  trash: "TRASH",
  "no leídos": "UNREAD",
  "no leidos": "UNREAD",
  unread: "UNREAD",
  principal: "CATEGORY_PERSONAL",
  promociones: "CATEGORY_PROMOTIONS",
  social: "CATEGORY_SOCIAL",
  notificaciones: "CATEGORY_UPDATES",
  actualizaciones: "CATEGORY_UPDATES",
  foros: "CATEGORY_FORUMS",
};

const systemIds = new Set(Object.values(systemLabels));

export type GmailLabel = { id: string; name: string };

/** Busca una etiqueta por nombre (sin distinguir mayúsculas ni acentos) o por su id. */
export function resolveLabel(name: string, labels: GmailLabel[]): GmailLabel | null {
  const wanted = name.trim();
  if (!wanted) return null;
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const key = fold(wanted);
  const system = systemLabels[wanted.toLowerCase()] ?? systemLabels[key];
  if (system) return { id: system, name: wanted };
  if (systemIds.has(wanted.toUpperCase())) return { id: wanted.toUpperCase(), name: wanted };
  return labels.find((label) => label.id === wanted) ?? labels.find((label) => fold(label.name) === key) ?? null;
}

/** Etiquetas que pone y quita cada acción. `label` es la etiqueta destino; `from`, de dónde sale al mover. */
export function gmailPlan(action: GmailAction, label?: string, from?: string): GmailPlan {
  const modify = (add: string[], remove: string[]): GmailPlan => ({ mode: "modify", add, remove });
  switch (action) {
    case "papelera":
      return { mode: "trash", add: [], remove: [] };
    case "eliminar_definitivo":
      return { mode: "delete", add: [], remove: [] };
    case "restaurar":
      return { mode: "untrash", add: [], remove: [] };
    case "archivar":
      return modify([], ["INBOX"]);
    case "mover_a_recibidos":
      return modify(["INBOX"], []);
    case "leido":
      return modify([], ["UNREAD"]);
    case "no_leido":
      return modify(["UNREAD"], []);
    case "destacar":
      return modify(["STARRED"], []);
    case "quitar_destacado":
      return modify([], ["STARRED"]);
    case "importante":
      return modify(["IMPORTANT"], []);
    case "no_importante":
      return modify([], ["IMPORTANT"]);
    case "etiquetar":
      return modify(label ? [label] : [], []);
    case "quitar_etiqueta":
      return modify([], label ? [label] : []);
    case "mover": {
      const source = from || "INBOX";
      return modify(label ? [label] : [], label && source !== label ? [source] : []);
    }
    case "spam":
      return modify(["SPAM"], ["INBOX"]);
    case "no_spam":
      return modify(["INBOX"], ["SPAM"]);
  }
}

/** Acciones que necesitan una etiqueta del socio. */
export function needsLabel(action: GmailAction) {
  return action === "etiquetar" || action === "quitar_etiqueta" || action === "mover";
}

/** Riesgo de la acción ya preparada: borrar (papelera o para siempre) siempre se confirma. */
export function gmailRisk(data: { mode?: unknown }): "write" | "send" {
  return data.mode === "delete" || data.mode === "trash" ? "send" : "write";
}

export const gmailToolNames = new Set(["organizar_correos", "ver_etiquetas_gmail"]);

export function gmailStatusLabel(name: string) {
  if (name === "organizar_correos") return "Preparando los cambios en tu Gmail…";
  if (name === "ver_etiquetas_gmail") return "Revisando tus etiquetas de Gmail…";
  return undefined;
}

export const gmailTools: FunctionDeclaration[] = [
  {
    name: "organizar_correos",
    description:
      "Organiza correos del Gmail del socio: mandarlos a la papelera, eliminarlos para siempre, restaurarlos de la papelera, archivarlos, regresarlos a Recibidos, marcarlos como leídos o no leídos, destacarlos, marcarlos importantes, poner o quitar etiquetas, moverlos a otra etiqueta (carpeta) o marcarlos como spam. " +
      "Elige los correos con «ids» (el messageId que devuelve leer_correos) o con «busqueda» (sintaxis de Gmail, p. ej. «from:promos@tienda.com older_than:30d») para varios a la vez. " +
      "El socio ve una tarjeta con la acción, cuántos correos son y algunos asuntos; confirma con un botón. Borrar (papelera o para siempre) siempre pide confirmación; lo demás sigue su autonomía. No digas que ya se hizo hasta que confirme.",
    parameters: {
      type: "object",
      properties: {
        accion: { type: "string", enum: [...gmailActions], description: "Qué hacer con los correos." },
        ids: { type: "array", items: { type: "string" }, description: "messageId de cada correo (de leer_correos)." },
        busqueda: { type: "string", description: "Consulta de Gmail para seleccionar varios correos. Usa ids o busqueda." },
        cantidad_max: { type: "integer", description: `Con busqueda: cuántos correos como máximo (1 a ${GMAIL_MAX_MESSAGES}, por defecto 50).` },
        etiqueta: { type: "string", description: "Para etiquetar, quitar_etiqueta o mover: nombre de la etiqueta (p. ej. «Clientes», «Facturas/2026», «Recibidos»)." },
        desde_etiqueta: { type: "string", description: "Solo para mover: etiqueta de la que salen (por defecto Recibidos)." },
        crear_etiqueta: { type: "boolean", description: "Para etiquetar o mover: crea la etiqueta si no existe." },
      },
      required: ["accion"],
    },
  },
  {
    name: "ver_etiquetas_gmail",
    description: "Lista las etiquetas (carpetas) del Gmail del socio con su nombre.",
    parameters: { type: "object", properties: {} },
  },
];

export type GmailDraftData = {
  action: GmailAction;
  mode: GmailMode;
  ids: string[];
  add: string[];
  remove: string[];
  /** Etiqueta nueva que se crea al confirmar (si no existía). */
  createLabel?: string;
  labelName?: string;
  query?: string;
};

export type GmailDraft = {
  op: typeof GMAIL_ORGANIZE_OP;
  title: string;
  lines: { label: string; value: string }[];
  confirm: string;
  data: GmailDraftData;
};

type Outcome =
  | { kind: "result"; response: Record<string, unknown>; status: string }
  | { kind: "app"; payload: GmailDraft; summary: string }
  | { kind: "invalid"; response: Record<string, unknown> };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Ids de mensaje de Gmail: hexadecimales. Lo demás (UUID, texto) se descarta. */
export function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => /^[0-9a-f]{8,24}$/i.test(item));
  return [...new Set(ids)].slice(0, GMAIL_MAX_MESSAGES);
}

function records(data: unknown, key: string, depth = 0): Record<string, unknown>[] {
  if (!data || typeof data !== "object" || depth > 6) return [];
  if (Array.isArray(data)) return data.flatMap((item) => records(item, key, depth + 1));
  const record = data as Record<string, unknown>;
  if (Array.isArray(record[key])) return (record[key] as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  return Object.values(record).flatMap((value) => records(value, key, depth + 1));
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** Correos de una respuesta de GMAIL_FETCH_EMAILS: id, remitente y asunto. */
export function messagesFrom(data: unknown) {
  return records(data, "messages").map((message) => ({
    id: str(message.messageId) || str(message.id),
    from: str(message.sender) || str(message.from),
    subject: str(message.subject),
  })).filter((message) => message.id);
}

/** Etiquetas de una respuesta de GMAIL_LIST_LABELS. */
export function labelsFrom(data: unknown): GmailLabel[] {
  return records(data, "labels")
    .map((label) => ({ id: str(label.id), name: str(label.name) }))
    .filter((label) => label.id && label.name);
}

function wantsSpamOrTrash(query: string, action: GmailAction) {
  return action === "restaurar" || action === "no_spam" || /\bin:(trash|spam)\b|\blabel:(trash|spam)\b/i.test(query);
}

async function listLabels(userId: string) {
  const listed = await runUserTool(userId, "gmail", "GMAIL_LIST_LABELS", { user_id: "me" });
  return listed.ok ? { ok: true as const, labels: labelsFrom(listed.data) } : listed;
}

export async function runGmailTool(userId: string, name: string, args: Record<string, unknown>): Promise<Outcome> {
  if (name === "ver_etiquetas_gmail") {
    const listed = await listLabels(userId);
    if (!listed.ok) return { kind: "invalid", response: toolFailure(listed) };
    return { kind: "result", status: "Revisé tus etiquetas de Gmail", response: { etiquetas: listed.labels.map((label) => label.name).slice(0, 200) } };
  }

  const action = text(args.accion, 40);
  if (!isGmailAction(action)) return { kind: "invalid", response: { error: `Acción no válida. Usa una de: ${gmailActions.join(", ")}.` } };
  let ids = cleanIds(args.ids);
  const query = text(args.busqueda, 300);
  if (!ids.length && !query) {
    return { kind: "invalid", response: { error: "Indica qué correos: ids (messageId de leer_correos) o una busqueda de Gmail." } };
  }

  // Etiquetas: se resuelven por nombre antes de mostrar la tarjeta.
  let labelId = "";
  let fromId = "";
  let createLabel = "";
  const labelName = text(args.etiqueta, 225);
  if (needsLabel(action)) {
    if (!labelName) return { kind: "invalid", response: { error: "Falta el nombre de la etiqueta." } };
    const listed = await listLabels(userId);
    if (!listed.ok) return { kind: "invalid", response: toolFailure(listed) };
    const found = resolveLabel(labelName, listed.labels);
    if (found) labelId = found.id;
    else if (action !== "quitar_etiqueta" && args.crear_etiqueta === true) createLabel = labelName;
    else {
      return {
        kind: "invalid",
        response: {
          error: `No existe la etiqueta «${labelName}».`,
          etiquetas: listed.labels.map((label) => label.name).slice(0, 100),
          nota: "Usa una de estas o vuelve a llamar con crear_etiqueta: true si el socio quiere crearla.",
        },
      };
    }
    if (action === "mover") {
      const fromName = text(args.desde_etiqueta, 225);
      if (fromName) {
        const source = resolveLabel(fromName, listed.labels);
        if (!source) return { kind: "invalid", response: { error: `No existe la etiqueta «${fromName}».` } };
        fromId = source.id;
      }
    }
  }

  // Muestra para la tarjeta y, con búsqueda, los ids exactos que se van a tocar.
  let preview: { id: string; from: string; subject: string }[] = [];
  let more = false;
  if (query) {
    const max = Math.max(1, Math.min(GMAIL_MAX_MESSAGES, Number(args.cantidad_max) || 50));
    const spamTrash = wantsSpamOrTrash(query, action);
    const listed = await runUserTool(userId, "gmail", "GMAIL_FETCH_EMAILS", {
      query,
      max_results: max,
      ids_only: true,
      include_spam_trash: spamTrash,
    });
    if (!listed.ok) return { kind: "invalid", response: toolFailure(listed) };
    const found = messagesFrom(listed.data).map((message) => message.id);
    ids = [...new Set([...ids, ...found])].slice(0, GMAIL_MAX_MESSAGES);
    more = found.length >= max;
    const sample = await runUserTool(userId, "gmail", "GMAIL_FETCH_EMAILS", {
      query,
      max_results: PREVIEW,
      verbose: false,
      include_payload: false,
      include_spam_trash: spamTrash,
    });
    if (sample.ok) preview = messagesFrom(sample.data);
  } else {
    const samples = await Promise.all(
      ids.slice(0, PREVIEW).map((id) => runUserTool(userId, "gmail", "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", { message_id: id, format: "metadata" })),
    );
    preview = samples.flatMap((sample, index) => {
      if (!sample.ok) return [];
      const header = (key: string) => {
        const headers = records(sample.data, "headers");
        return str(headers.find((item) => str(item.name).toLowerCase() === key)?.value);
      };
      return [{ id: ids[index], from: str((sample.data as Record<string, unknown> | null)?.sender) || header("from"), subject: str((sample.data as Record<string, unknown> | null)?.subject) || header("subject") }];
    });
  }
  if (!ids.length) return { kind: "result", status: "No encontré correos con esa búsqueda", response: { correos: 0, nota: "No hay correos que coincidan; díselo al socio." } };

  const plan = gmailPlan(action, labelId || undefined, fromId || undefined);
  if (plan.mode === "modify" && !plan.add.length && !plan.remove.length && !createLabel) {
    return { kind: "invalid", response: { error: "Esa acción no cambia nada en esos correos." } };
  }
  const verb = verbs[action];
  const count = ids.length;
  const plural = count === 1 ? "1 correo" : `${count}${more ? "+" : ""} correos`;
  const lines: { label: string; value: string }[] = [{ label: "Correos", value: plural }];
  if (query) lines.push({ label: "Búsqueda", value: query });
  if (labelName && needsLabel(action)) lines.push({ label: "Etiqueta", value: createLabel ? `${labelName} (nueva)` : labelName });
  preview.slice(0, PREVIEW).forEach((message, index) => {
    lines.push({ label: `${index + 1}`, value: `${message.subject || "(sin asunto)"}${message.from ? ` · ${message.from}` : ""}`.slice(0, 160) });
  });
  if (count > preview.length && preview.length) lines.push({ label: "Y", value: `${count - preview.length} más` });
  if (plan.mode === "delete") lines.push({ label: "Aviso", value: "Se borran para siempre: no pasan por la papelera y no se pueden recuperar." });
  if (plan.mode === "trash") lines.push({ label: "Aviso", value: "Quedan en la papelera de Gmail 30 días; ahí se pueden recuperar." });

  const data: GmailDraftData = {
    action,
    mode: plan.mode,
    ids,
    add: plan.add,
    remove: plan.remove,
    ...(createLabel ? { createLabel } : {}),
    ...(labelName && needsLabel(action) ? { labelName } : {}),
    ...(query ? { query } : {}),
  };
  return {
    kind: "app",
    summary: `Gmail · ${verb.title}: ${plural}`,
    payload: { op: GMAIL_ORGANIZE_OP, title: `Gmail · ${verb.title}`, lines, confirm: verb.confirm, data },
  };
}

type Done = { ok: true; message: string } | { ok: false; message: string; reconnect?: UserToolkit };

function chunks<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

async function eachLimited(ids: string[], run: (id: string) => Promise<UserToolResult>, concurrency = 5) {
  let failed: UserToolResult | null = null;
  let done = 0;
  for (const group of chunks(ids, concurrency)) {
    const results = await Promise.all(group.map(run));
    for (const result of results) {
      if (result.ok) done += 1;
      else failed ??= result;
    }
    if (failed && !failed.ok && failed.reconnect) break;
  }
  return { done, failed };
}

function failure(result: UserToolResult, prefix: string, done = 0): Done {
  if (result.ok) return { ok: false, message: prefix };
  const partial = done ? ` (sí se aplicó a ${done})` : "";
  return { ok: false, message: `${prefix}${partial}: ${result.error}`, ...(result.reconnect ? { reconnect: result.reconnect } : {}) };
}

export async function executeGmailOrganize(userId: string, raw: Record<string, unknown>): Promise<Done> {
  const action = str(raw.action);
  if (!isGmailAction(action)) return { ok: false, message: "La acción de Gmail no es válida." };
  const ids = cleanIds(raw.ids);
  if (!ids.length) return { ok: false, message: "No quedó ningún correo por cambiar." };
  const verb = verbs[action];
  const plural = ids.length === 1 ? "1 correo" : `${ids.length} correos`;
  const prefix = `No se completó en Gmail`;
  const mode = str(raw.mode) as GmailMode;
  const asList = (value: unknown) => (Array.isArray(value) ? value.map(String).filter(Boolean) : []);
  let add = asList(raw.add);
  const remove = asList(raw.remove);

  if (mode === "delete") {
    const result =
      ids.length === 1
        ? await runUserTool(userId, "gmail", "GMAIL_DELETE_MESSAGE", { user_id: "me", message_id: ids[0] })
        : await (async () => {
            for (const group of chunks(ids, 1000)) {
              const deleted = await runUserTool(userId, "gmail", "GMAIL_BATCH_DELETE_MESSAGES", { userId: "me", messageIds: group });
              if (!deleted.ok) return deleted;
            }
            return { ok: true as const, data: null };
          })();
    return result.ok ? { ok: true, message: `Listo, ${verb.done} ${plural}.` } : failure(result, prefix);
  }

  if (mode === "trash" || mode === "untrash") {
    const tool = mode === "trash" ? "GMAIL_MOVE_TO_TRASH" : "GMAIL_UNTRASH_MESSAGE";
    const { done, failed } = await eachLimited(ids, (id) => runUserTool(userId, "gmail", tool, { user_id: "me", message_id: id }));
    if (failed) return failure(failed, prefix, done);
    return { ok: true, message: `Listo, ${verb.done} ${plural}.${mode === "trash" ? " Quedan 30 días en la papelera por si los necesitas." : ""}` };
  }

  const createLabel = str(raw.createLabel);
  if (createLabel) {
    const created = await runUserTool(userId, "gmail", "GMAIL_CREATE_LABEL", { user_id: "me", label_name: createLabel });
    let id = created.ok ? labelsFrom({ labels: [created.data] })[0]?.id || findId(created.data) : "";
    if (!id) {
      const listed = await listLabels(userId);
      if (listed.ok) id = resolveLabel(createLabel, listed.labels)?.id ?? "";
    }
    if (!id) return created.ok ? { ok: false, message: `${prefix}: no pude crear la etiqueta «${createLabel}».` } : failure(created, prefix);
    add = [...new Set([...add, id])];
  }
  if (!add.length && !remove.length) return { ok: false, message: "Esa acción no cambia nada en esos correos." };
  let done = 0;
  for (const group of chunks(ids, 1000)) {
    const result = await runUserTool(userId, "gmail", "GMAIL_BATCH_MODIFY_MESSAGES", {
      userId: "me",
      messageIds: group,
      ...(add.length ? { addLabelIds: add } : {}),
      ...(remove.length ? { removeLabelIds: remove } : {}),
    });
    if (!result.ok) return failure(result, prefix, done);
    done += group.length;
  }
  const label = str(raw.labelName);
  const where = action === "etiquetar" || action === "mover" ? (label ? ` a «${label}»` : "") : action === "quitar_etiqueta" && label ? ` «${label}»` : "";
  return { ok: true, message: action === "quitar_etiqueta" ? `Listo, quité la etiqueta${where} a ${plural}.` : `Listo, ${verb.done} ${plural}${where}.` };
}

function findId(data: unknown, depth = 0): string {
  if (!data || typeof data !== "object" || depth > 5) return "";
  const record = data as Record<string, unknown>;
  for (const key of ["labelId", "id"]) if (typeof record[key] === "string" && record[key]) return record[key] as string;
  for (const value of Object.values(record)) {
    const found = findId(value, depth + 1);
    if (found) return found;
  }
  return "";
}
