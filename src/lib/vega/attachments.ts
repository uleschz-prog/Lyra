import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { inflateRawSync } from "node:zlib";

import { attachmentLimits } from "@/lib/vega/attachment-limits";

const textMimes = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  "text/css",
  "text/javascript",
  "application/json",
  "application/xml",
  "text/xml",
]);

const inlineMimes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ReadyAttachment = {
  kind: "file" | "link";
  name: string;
  url?: string;
  mime?: string;
  excerpt: string;
  inline?: { mimeType: string; data: string };
};

type FileInput = { kind: "file"; name: string; mime: string; data?: string; text?: string };
type LinkInput = { kind: "link"; url: string };

function cleanName(value: string) {
  const base = value.split(/[/\\]/).pop()?.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/g, " ").trim() ?? "";
  return (base || "archivo").slice(0, 120);
}

function extension(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1]?.toLowerCase() ?? "";
}

function mimeFor(name: string, mime: string) {
  const given = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (given && given !== "application/octet-stream") return given;
  const ext = extension(name);
  const byExt: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    docx: docxMime,
    xlsx: xlsxMime,
  };
  return byExt[ext] ?? given;
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptOf(value: string) {
  const clean = value.replace(/\u0000/g, "").trim();
  if (clean.length <= attachmentLimits.excerptChars) return clean;
  return `${clean.slice(0, attachmentLimits.excerptChars)}\n…`;
}

function xmlText(xml: string) {
  return excerptOf(htmlToText(xml.replace(/<w:tab\/>/g, " ").replace(/<w:br\/>/g, "\n")));
}

function zipEntry(buffer: Buffer, wanted: string) {
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLen);
    const start = offset + 30 + nameLen + extraLen;
    if (start + compressed > buffer.length) return null;
    const data = buffer.subarray(start, start + compressed);
    if (name === wanted) {
      if (compressed > 2_000_000) return null;
      if (method === 0) return data.length > 2_000_000 ? null : data.toString("utf8");
      if (method !== 8) return null;
      const raw = inflateRawSync(data);
      return raw.length > 2_000_000 ? null : raw.toString("utf8");
    }
    offset = start + compressed;
  }
  return null;
}

function officeText(buffer: Buffer, mime: string) {
  if (mime === docxMime) {
    const xml = zipEntry(buffer, "word/document.xml");
    return xml ? xmlText(xml) : "";
  }
  if (mime === xlsxMime) {
    const shared = zipEntry(buffer, "xl/sharedStrings.xml");
    const sheet = zipEntry(buffer, "xl/worksheets/sheet1.xml");
    return excerptOf([shared ? xmlText(shared) : "", sheet ? xmlText(sheet) : ""].filter(Boolean).join("\n"));
  }
  return "";
}

function decodeBase64(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!compact || compact.length > Math.ceil(attachmentLimits.fileBytes / 3) * 4 + 8) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const buffer = Buffer.from(compact, "base64");
  if (buffer.length === 0 || buffer.length > attachmentLimits.fileBytes) return null;
  return { buffer, data: compact };
}

function prepareFile(input: FileInput, usedBytes: { n: number }): { ok: true; item: ReadyAttachment } | { ok: false; error: string } {
  const name = cleanName(typeof input.name === "string" ? input.name : "");
  const mime = mimeFor(name, typeof input.mime === "string" ? input.mime : "");
  if (typeof input.text === "string" && input.text.trim()) {
    const bytes = Buffer.byteLength(input.text);
    if (bytes > attachmentLimits.fileBytes) return { ok: false, error: `«${name}» pesa demasiado. Cada archivo puede medir hasta 1.2 MB.` };
    usedBytes.n += bytes;
    const body = mime === "text/html" ? htmlToText(input.text) : input.text;
    return { ok: true, item: { kind: "file", name, mime, excerpt: excerptOf(body) } };
  }
  if (typeof input.data !== "string" || !input.data.trim()) {
    return { ok: false, error: `«${name}» llegó vacío.` };
  }
  const decoded = decodeBase64(input.data);
  if (!decoded) return { ok: false, error: `«${name}» pesa demasiado o no se pudo leer.` };
  usedBytes.n += decoded.buffer.length;
  if (inlineMimes.has(mime)) {
    const note = mime === "application/pdf" ? `PDF adjunto: ${name}` : `Imagen adjunta: ${name}`;
    return { ok: true, item: { kind: "file", name, mime, excerpt: note, inline: { mimeType: mime, data: decoded.data } } };
  }
  if (mime === docxMime || mime === xlsxMime) {
    const text = officeText(decoded.buffer, mime);
    if (!text) return { ok: false, error: `No pude leer «${name}».` };
    return { ok: true, item: { kind: "file", name, mime, excerpt: text } };
  }
  if (textMimes.has(mime)) {
    const body = mime === "text/html" ? htmlToText(decoded.buffer.toString("utf8")) : decoded.buffer.toString("utf8");
    return { ok: true, item: { kind: "file", name, mime, excerpt: excerptOf(body) } };
  }
  return { ok: false, error: `No puedo leer «${name}». Usa imagen, PDF, texto, Word o Excel.` };
}

export function isBlockedIp(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.includes(":")) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) return true;
    const mapped = /(?::ffff:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    return mapped ? isBlockedIp(mapped[1]) : false;
  }
  if (/^\d+$/.test(normalized) || normalized.split(".").length !== 4) return true;
  const parts = normalized.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 168 || b === 0)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

export function publicUrlError(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "Ese enlace no es válido.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Ese enlace no es válido.";
  if (url.username || url.password) return "Ese enlace no es válido.";
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return "Ese enlace no se puede abrir.";
  }
  if (host === "metadata.google.internal" || host === "metadata.google") return "Ese enlace no se puede abrir.";
  if (isIP(host) || /^[\d.]+$/.test(host)) {
    if (isBlockedIp(host)) return "Ese enlace no se puede abrir.";
  }
  return null;
}

async function hostResolvesPublic(hostname: string) {
  if (isIP(hostname)) return isBlockedIp(hostname) ? "Ese enlace no se puede abrir." : null;
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) return "Ese enlace no se puede abrir.";
    return null;
  } catch {
    return "No pude abrir ese enlace.";
  }
}

async function fetchPublic(
  url: string,
  fetchImpl: typeof fetch,
  resolveHost: (hostname: string) => Promise<string | null>,
  hops = 0,
): Promise<{ ok: true; text: string; finalUrl: string } | { ok: false; error: string }> {
  const error = publicUrlError(url);
  if (error) return { ok: false, error };
  const parsed = new URL(url);
  const blocked = await resolveHost(parsed.hostname);
  if (blocked) return { ok: false, error: blocked };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(parsed, {
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "text/html,text/plain,application/json", "User-Agent": "LyraVega/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next || hops >= 2) return { ok: false, error: "No pude abrir ese enlace." };
      return fetchPublic(new URL(next, parsed).toString(), fetchImpl, resolveHost, hops + 1);
    }
    if (!response.ok || !response.body) return { ok: false, error: "No pude abrir ese enlace." };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value);
    }
    await reader.cancel().catch(() => undefined);
    const raw = Buffer.concat(chunks).subarray(0, 400_000).toString("utf8");
    const type = response.headers.get("content-type") ?? "";
    const text = type.includes("html") ? htmlToText(raw) : raw.replace(/\s+/g, " ").trim();
    if (!text) return { ok: false, error: "Ese enlace no tiene texto para leer." };
    return { ok: true, text: excerptOf(text), finalUrl: parsed.toString() };
  } catch {
    return { ok: false, error: "No pude abrir ese enlace." };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export async function prepareAttachments(
  raw: unknown,
  options: { fetch?: typeof fetch; resolveHost?: (hostname: string) => Promise<string | null> } = {},
): Promise<{ ok: true; items: ReadyAttachment[] } | { ok: false; error: string }> {
  const fetchImpl = options.fetch ?? fetch;
  const resolveHost = options.resolveHost ?? hostResolvesPublic;
  if (raw == null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "No pude leer los archivos adjuntos." };
  if (raw.length > attachmentLimits.files + attachmentLimits.links) {
    return { ok: false, error: `Puedes adjuntar hasta ${attachmentLimits.files} archivos y ${attachmentLimits.links} enlaces.` };
  }

  const files: FileInput[] = [];
  const links: LinkInput[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) return { ok: false, error: "No pude leer un archivo adjunto." };
    if (record.kind === "link") {
      if (typeof record.url !== "string") return { ok: false, error: "Ese enlace no es válido." };
      links.push({ kind: "link", url: record.url.trim() });
    } else if (record.kind === "file") {
      files.push({
        kind: "file",
        name: typeof record.name === "string" ? record.name : "archivo",
        mime: typeof record.mime === "string" ? record.mime : "",
        ...(typeof record.data === "string" ? { data: record.data } : {}),
        ...(typeof record.text === "string" ? { text: record.text } : {}),
      });
    } else return { ok: false, error: "No pude leer un archivo adjunto." };
  }
  if (files.length > attachmentLimits.files) return { ok: false, error: `Puedes adjuntar hasta ${attachmentLimits.files} archivos.` };
  if (links.length > attachmentLimits.links) return { ok: false, error: `Puedes agregar hasta ${attachmentLimits.links} enlaces.` };

  const used = { n: 0 };
  const items: ReadyAttachment[] = [];
  for (const file of files) {
    const ready = prepareFile(file, used);
    if (!ready.ok) return ready;
    items.push(ready.item);
  }
  if (used.n > attachmentLimits.totalBytes) {
    return { ok: false, error: "Esos archivos juntos pesan demasiado. Prueba con menos o más livianos." };
  }

  for (const link of links) {
    const opened = await fetchPublic(link.url, fetchImpl, resolveHost);
    if (!opened.ok) return { ok: false, error: opened.error };
    let host = opened.finalUrl;
    try {
      host = new URL(opened.finalUrl).hostname;
    } catch {
      host = opened.finalUrl;
    }
    items.push({ kind: "link", name: host, url: opened.finalUrl, excerpt: opened.text });
  }
  return { ok: true, items };
}

export function attachmentMeta(items: ReadyAttachment[]) {
  if (items.length === 0) return undefined;
  return {
    attachments: items.map(({ kind, name, url }) => ({ kind, name, ...(url ? { url } : {}) })),
    excerpts: items.map(({ name, excerpt }) => ({ name, excerpt })),
  };
}

export function excerptsFromMeta(meta: unknown) {
  const record = asRecord(meta);
  const excerpts = record?.excerpts;
  if (!Array.isArray(excerpts)) return "";
  const notes = excerpts
    .map((entry) => {
      const item = asRecord(entry);
      const name = typeof item?.name === "string" ? item.name : "archivo";
      const excerpt = typeof item?.excerpt === "string" ? item.excerpt.trim() : "";
      return excerpt ? `«${name}»\n${excerpt}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return notes.slice(0, attachmentLimits.notesChars);
}

export function attachmentChips(meta: unknown) {
  const record = asRecord(meta);
  const attachments = record?.attachments;
  if (!Array.isArray(attachments)) return [];
  return attachments.flatMap((entry) => {
    const item = asRecord(entry);
    if (!item || (item.kind !== "file" && item.kind !== "link")) return [];
    const name = typeof item.name === "string" ? item.name : item.kind === "link" ? "enlace" : "archivo";
    const url = typeof item.url === "string" ? item.url : undefined;
    return [{ kind: item.kind as "file" | "link", name, ...(url ? { url } : {}) }];
  });
}

export function inlineParts(items: ReadyAttachment[]) {
  return items.flatMap((item) => (item.inline ? [{ inlineData: item.inline }] : []));
}
