// Entrega 3: contactos de los formularios de sitios publicados. Lógica sin Next (la base se inyecta).
// Nunca se registran en logs los datos del contacto ni la IP; el límite usa hashes.
import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { findPublished, type PublishDb } from "@/lib/publish/core";

export type LeadDb = PublishDb & Pick<PrismaClient, "projectLead" | "authAttempt">;

export const leadLimits = {
  maxBodyBytes: 10_000,
  maxFields: 15,
  maxLabel: 60,
  maxValue: 2_000,
  /** Menos de esto desde que abrió la página = bot. */
  minMsOnPage: 1_500,
  /** Por sitio: contactos guardados por hora. */
  perSitePerHour: 30,
  /** Por persona (IP) y sitio en 10 minutos (cuentan también los rechazados). */
  perIpPerSite10Min: 5,
  /** Por persona (IP) en todos los sitios, por hora. */
  perIpPerHour: 20,
  maxLinks: 3,
} as const;

export type LeadField = { label: string; value: string };

export type LeadResponse = { status: number; body: { ok: boolean; error?: string } };

const MINUTE = 60_000;

function clean(text: string, max: number) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

/** Lee el cuerpo enviado por el sitio: { fields: [{label, value}] | {clave: valor}, hp, page, t }. */
export function parseLeadBody(text: string):
  | { ok: true; fields: LeadField[]; honeypot: boolean; page: string | null; msOnPage: number | null }
  | { ok: false; error: string } {
  if (Buffer.byteLength(text, "utf8") > leadLimits.maxBodyBytes) return { ok: false, error: "El mensaje es demasiado largo." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Formato no válido." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Formato no válido." };
  const body = raw as Record<string, unknown>;
  const entries: [unknown, unknown][] = Array.isArray(body.fields)
    ? body.fields.map((item) => (item && typeof item === "object" ? [(item as LeadField).label, (item as LeadField).value] : [null, null]))
    : body.fields && typeof body.fields === "object"
      ? Object.entries(body.fields as Record<string, unknown>)
      : [];
  if (entries.length > leadLimits.maxFields) return { ok: false, error: "Demasiados campos." };
  const fields: LeadField[] = [];
  for (const [label, value] of entries) {
    if (typeof label !== "string" || (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")) continue;
    const cleanLabel = clean(label, leadLimits.maxLabel) || "Campo";
    const cleanValue = clean(String(value), leadLimits.maxValue);
    if (cleanValue) fields.push({ label: cleanLabel, value: cleanValue });
  }
  if (!fields.length || fields.reduce((sum, field) => sum + field.value.length, 0) < 2) return { ok: false, error: "El formulario llegó vacío." };
  const links = fields.reduce((sum, field) => sum + (field.value.match(/https?:\/\/|www\./gi)?.length ?? 0), 0);
  if (links > leadLimits.maxLinks) return { ok: false, error: "El mensaje tiene demasiados enlaces." };
  const honeypot = typeof body.hp === "string" && body.hp.trim().length > 0;
  const page = typeof body.page === "string" ? clean(body.page, 120) || null : null;
  const msOnPage = typeof body.t === "number" && Number.isFinite(body.t) ? body.t : null;
  return { ok: true, fields, honeypot, page, msOnPage };
}

const emailPattern = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i;

/** Saca nombre, correo, teléfono y mensaje por la etiqueta del campo (o por el formato del valor). */
export function summarizeFields(fields: LeadField[]) {
  const out: { name: string | null; email: string | null; phone: string | null; message: string | null } = { name: null, email: null, phone: null, message: null };
  for (const { label, value } of fields) {
    const key = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!out.email && (/correo|e-?mail/.test(key) || emailPattern.test(value)) && emailPattern.test(value)) out.email = value.slice(0, 200);
    else if (!out.phone && /tel|whats|celular|movil|phone/.test(key)) out.phone = value.slice(0, 40);
    else if (!out.name && /nombre|name/.test(key)) out.name = value.slice(0, 120);
    else if (!out.message && /mensaje|comentario|message|detalle|nota|cuentanos|que necesitas|consulta/.test(key)) out.message = value;
  }
  if (!out.message) {
    const longest = fields.filter((field) => field.value !== out.name && field.value !== out.email && field.value !== out.phone).sort((a, b) => b.value.length - a.value.length)[0];
    if (longest && longest.value.length > 20) out.message = longest.value;
  }
  return out;
}

export function leadKey(scope: "ip" | "ip+site", ip: string, slug = "") {
  return createHash("sha256").update(`lyra-lead:${scope}:${ip}:${slug}`).digest("hex");
}

async function overLimit(db: LeadDb, keyHash: string, max: number, windowMs: number, now: Date) {
  const count = await db.authAttempt.count({ where: { keyHash, createdAt: { gte: new Date(now.getTime() - windowMs) } } });
  return count >= max;
}

/**
 * Recibe un contacto para /s/[slug]. Respuestas:
 * 200 guardado (o silencio ante bots), 400 inválido, 404 sitio no publicado, 429 demasiados.
 */
export async function submitLead(db: LeadDb, input: { slug: string; ip: string; text: string; now?: Date }): Promise<LeadResponse> {
  const now = input.now ?? new Date();
  const target = await findPublished(db, input.slug);
  if (!target || target.kind !== "sitio") return { status: 404, body: { ok: false, error: "Este sitio no recibe contactos." } };

  const ip = input.ip || "desconocida";
  const ipSite = leadKey("ip+site", ip, target.slug);
  const ipAll = leadKey("ip", ip);
  if ((await overLimit(db, ipSite, leadLimits.perIpPerSite10Min, 10 * MINUTE, now)) || (await overLimit(db, ipAll, leadLimits.perIpPerHour, 60 * MINUTE, now))) {
    return { status: 429, body: { ok: false, error: "Demasiados envíos. Intenta más tarde." } };
  }
  await db.authAttempt.createMany({ data: [ipSite, ipAll].map((keyHash) => ({ action: "lead", keyHash, createdAt: now })) });

  const parsed = parseLeadBody(input.text);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } };
  // Trampa para bots o envío instantáneo: se responde «ok» para no darles pistas, pero no se guarda.
  if (parsed.honeypot || (parsed.msOnPage !== null && parsed.msOnPage < leadLimits.minMsOnPage)) return { status: 200, body: { ok: true } };

  const recent = await db.projectLead.count({ where: { projectId: target.projectId, createdAt: { gte: new Date(now.getTime() - 60 * MINUTE) } } });
  if (recent >= leadLimits.perSitePerHour) return { status: 429, body: { ok: false, error: "Este sitio recibió muchos mensajes. Intenta en un rato." } };

  const owner = await db.project.findFirst({ where: { id: target.projectId, deletedAt: null }, select: { userId: true } });
  if (!owner) return { status: 404, body: { ok: false, error: "Este sitio no recibe contactos." } };
  const summary = summarizeFields(parsed.fields);
  await db.projectLead.create({
    data: {
      projectId: target.projectId,
      userId: owner.userId,
      slug: target.slug,
      versionNumber: target.version.number,
      ...summary,
      fields: parsed.fields as unknown as Prisma.InputJsonValue,
      page: parsed.page,
      createdAt: now,
    },
    select: { id: true },
  });
  // TODO(entrega-3): avisar por correo al dueño cuando LYRA tenga un proveedor de correo configurado.
  // Hoy no hay ninguno en el código (no se agrega uno nuevo en este PR); el aviso es la bandeja de Contactos.
  return { status: 200, body: { ok: true } };
}

/** CSV para Excel/Sheets (BOM + comillas; evita fórmulas al inicio de celda). */
export function leadsCsv(rows: { createdAt: Date; name: string | null; email: string | null; phone: string | null; message: string | null; page: string | null; fields: unknown; read: boolean }[]) {
  const cell = (value: string | null | undefined) => {
    let text = (value ?? "").replace(/\r?\n/g, " ");
    if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = ["Fecha (UTC)", "Nombre", "Correo", "Teléfono", "Mensaje", "Todos los campos", "Página", "Leído"].map(cell).join(",");
  const lines = rows.map((row) => {
    const all = Array.isArray(row.fields) ? (row.fields as LeadField[]).map((field) => `${field.label}: ${field.value}`).join(" | ") : "";
    return [row.createdAt.toISOString(), row.name, row.email, row.phone, row.message, all, row.page, row.read ? "sí" : "no"].map(cell).join(",");
  });
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}
