// Manifiesto de una app con datos en vivo (archivo lyra.app.json del proyecto): roles, sucursales y
// colecciones con sus campos. El servidor lo normaliza y valida cada registro contra él.
import { liveAppLimits } from "@/lib/liveapps/config";

export type LiveScalarType = "text" | "longtext" | "number" | "money" | "date" | "time" | "email" | "phone" | "select" | "boolean" | "ref";
export type LiveFieldType = LiveScalarType | "items";

export type LiveField = {
  key: string;
  label: string;
  type: LiveFieldType;
  options?: string[];
  required?: boolean;
  /** type "ref": colección a la que apunta. */
  ref?: string;
  /** type "items": campos de cada renglón (solo escalares). */
  fields?: LiveField[];
};

export type LiveCollection = {
  key: string;
  label: string;
  singular: string;
  icon?: string;
  fields: LiveField[];
  /** branch: cada registro pertenece a una sucursal; shared: catálogo común. */
  scope: "branch" | "shared";
  /** recent: al entrar solo se bajan los registros de las últimas horas (comandas, movimientos). */
  sync: "all" | "recent";
  /** Roles que pueden escribir (vacío = todos). admin siempre puede. */
  write?: string[];
  /** Roles que pueden leer (vacío = todos). admin siempre puede. */
  read?: string[];
  seed?: Record<string, unknown>[];
};

export type LiveRole = { key: string; label: string };
export type LiveBranch = { id: string; name: string };

export type LiveManifest = {
  version: 1;
  title: string;
  roles: LiveRole[];
  branches: LiveBranch[];
  collections: LiveCollection[];
};

export const ADMIN_ROLE: LiveRole = { key: "admin", label: "Administración" };
export const MANIFEST_PATH = "lyra.app.json";

const scalarTypes = new Set<LiveScalarType>(["text", "longtext", "number", "money", "date", "time", "email", "phone", "select", "boolean", "ref"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export const collectionKey = /^[a-z][A-Za-z0-9]{0,29}$/;
const fieldKey = /^[a-z][A-Za-z0-9]{0,29}$/;
const roleKey = /^[a-z][a-z0-9-]{1,20}$/;
export const branchId = /^[a-z0-9][a-z0-9-]{0,23}$/;
/** Ids de registro: los genera la app; también se aceptan los de las semillas («s0», «centro_cecina»). */
export const recordId = /^[A-Za-z0-9_-]{2,64}$/;

function normalizeField(raw: unknown, allowItems: boolean): LiveField | null {
  const field = record(raw);
  if (!field) return null;
  const key = clip(field.key, 30);
  if (!fieldKey.test(key) || ["id", "createdAt", "updatedAt", "branchId"].includes(key)) return null;
  const type = field.type === "items" && allowItems ? "items" : scalarTypes.has(field.type as LiveScalarType) ? (field.type as LiveScalarType) : "text";
  const out: LiveField = { key, label: clip(field.label, 40) || key, type };
  if (type === "select") {
    const options = Array.isArray(field.options) ? field.options.map((option) => clip(option, 40)).filter(Boolean).slice(0, 12) : [];
    if (!options.length) return null;
    out.options = options;
  }
  if (type === "ref") {
    const ref = clip(field.ref, 30);
    if (!collectionKey.test(ref)) return null;
    out.ref = ref;
  }
  if (type === "items") {
    const fields = (Array.isArray(field.fields) ? field.fields : []).map((item) => normalizeField(item, false)).filter((item): item is LiveField => Boolean(item)).slice(0, 8);
    if (!fields.length) return null;
    out.fields = fields;
  }
  if (field.required === true) out.required = true;
  return out;
}

function roleList(value: unknown, roles: Set<string>) {
  if (!Array.isArray(value)) return undefined;
  const list = value.map((item) => clip(item, 21)).filter((item) => roles.has(item));
  return list.length ? [...new Set(list)] : undefined;
}

/** Convierte el JSON del proyecto en un manifiesto seguro (o null si no sirve). */
export function normalizeManifest(raw: unknown): LiveManifest | null {
  const data = record(raw);
  if (!data) return null;
  const roles: LiveRole[] = [ADMIN_ROLE];
  for (const item of Array.isArray(data.roles) ? data.roles : []) {
    const role = record(item);
    const key = clip(role?.key, 21);
    if (!roleKey.test(key) || roles.some((existing) => existing.key === key)) continue;
    roles.push({ key, label: clip(role?.label, 40) || key });
    if (roles.length > liveAppLimits.maxRoles) break;
  }
  const roleKeys = new Set(roles.map((role) => role.key));
  const branches: LiveBranch[] = [];
  for (const item of Array.isArray(data.branches) ? data.branches : []) {
    const branch = record(item);
    const id = clip(branch?.id, 24);
    if (!branchId.test(id) || branches.some((existing) => existing.id === id)) continue;
    branches.push({ id, name: clip(branch?.name, 60) || id });
    if (branches.length >= liveAppLimits.maxBranches) break;
  }
  if (!branches.length) branches.push({ id: "principal", name: "Principal" });
  const collections: LiveCollection[] = [];
  for (const item of Array.isArray(data.collections) ? data.collections : []) {
    const raw = record(item);
    const key = clip(raw?.key, 30);
    if (!raw || !collectionKey.test(key) || collections.some((existing) => existing.key === key)) continue;
    const fields: LiveField[] = [];
    for (const rawField of Array.isArray(raw.fields) ? raw.fields : []) {
      const field = normalizeField(rawField, true);
      if (field && !fields.some((existing) => existing.key === field.key)) fields.push(field);
      if (fields.length >= liveAppLimits.maxFields) break;
    }
    if (!fields.length) continue;
    const collection: LiveCollection = {
      key,
      label: clip(raw.label, 40) || key,
      singular: clip(raw.singular, 40) || clip(raw.label, 40) || key,
      fields,
      scope: raw.scope === "branch" ? "branch" : "shared",
      sync: raw.sync === "recent" ? "recent" : "all",
    };
    const icon = clip(raw.icon, 40);
    if (icon) collection.icon = icon;
    const write = roleList(raw.write, roleKeys);
    const read = roleList(raw.read, roleKeys);
    if (write) collection.write = write;
    if (read) collection.read = read;
    if (Array.isArray(raw.seed)) collection.seed = raw.seed.map(record).filter((row): row is Record<string, unknown> => Boolean(row)).slice(0, 500);
    collections.push(collection);
    if (collections.length >= liveAppLimits.maxCollections) break;
  }
  if (!collections.length) return null;
  const known = new Set(collections.map((collection) => collection.key));
  // Las referencias a colecciones que no existen se vuelven texto.
  for (const collection of collections) {
    for (const field of [...collection.fields, ...collection.fields.flatMap((item) => item.fields ?? [])]) {
      if (field.type === "ref" && !known.has(field.ref ?? "")) {
        field.type = "text";
        delete field.ref;
      }
    }
  }
  return { version: 1, title: clip(data.title, 80) || "App", roles, branches, collections };
}

/** Manifiesto sin semillas (lo que se guarda en el espacio y se manda a la app). */
export function publicManifest(manifest: LiveManifest): Omit<LiveManifest, "branches"> {
  const collections = manifest.collections.map((collection) => {
    const copy = { ...collection };
    delete copy.seed;
    return copy;
  });
  return { version: 1, title: manifest.title, roles: manifest.roles, collections };
}

export function canWrite(collection: Pick<LiveCollection, "write">, role: string) {
  return role === ADMIN_ROLE.key || !collection.write?.length || collection.write.includes(role);
}

export function canRead(collection: Pick<LiveCollection, "read">, role: string) {
  return role === ADMIN_ROLE.key || !collection.read?.length || collection.read.includes(role);
}

type Validation = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

function scalar(field: LiveField, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null };
  switch (field.type) {
    case "number":
    case "money": {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
      if (!Number.isFinite(number) || Math.abs(number) > 1e12) return { ok: false, error: `«${field.label}» debe ser un número.` };
      return { ok: true, value: Math.round(number * 10_000) / 10_000 };
    }
    case "boolean":
      if (typeof value !== "boolean") return { ok: false, error: `«${field.label}» debe ser sí o no.` };
      return { ok: true, value };
    case "select":
      if (typeof value !== "string" || !field.options?.includes(value)) return { ok: false, error: `«${field.label}» no tiene la opción «${String(value).slice(0, 40)}».` };
      return { ok: true, value };
    case "ref":
      if (typeof value !== "string" || !recordId.test(value)) return { ok: false, error: `«${field.label}» no es una referencia válida.` };
      return { ok: true, value };
    default: {
      if (typeof value !== "string" && typeof value !== "number") return { ok: false, error: `«${field.label}» debe ser texto.` };
      const text = String(value).trim();
      const max = field.type === "longtext" ? 4_000 : field.type === "date" || field.type === "time" ? 40 : 500;
      if (text.length > max) return { ok: false, error: `«${field.label}» es demasiado largo.` };
      return { ok: true, value: text };
    }
  }
}

/**
 * Valida datos de un registro contra la colección. Descarta llaves desconocidas; en altas exige los
 * obligatorios. `partial` es para cambios (solo valida lo que viene).
 */
export function validateData(collection: LiveCollection, input: unknown, options: { partial: boolean }): Validation {
  const raw = record(input);
  if (!raw) return { ok: false, error: "Datos inválidos." };
  const data: Record<string, unknown> = {};
  for (const field of collection.fields) {
    if (!(field.key in raw)) continue;
    const value = raw[field.key];
    if (value === undefined) continue;
    if (field.type === "items") {
      if (value === null) {
        data[field.key] = [];
        continue;
      }
      if (!Array.isArray(value) || value.length > liveAppLimits.maxItems) return { ok: false, error: `«${field.label}» debe ser una lista de hasta ${liveAppLimits.maxItems} renglones.` };
      const rows: Record<string, unknown>[] = [];
      for (const item of value) {
        const row = record(item);
        if (!row) return { ok: false, error: `«${field.label}» tiene un renglón inválido.` };
        const clean: Record<string, unknown> = {};
        for (const sub of field.fields ?? []) {
          if (row[sub.key] === undefined) continue;
          const checked = scalar(sub, row[sub.key]);
          if (!checked.ok) return checked;
          clean[sub.key] = checked.value;
        }
        rows.push(clean);
      }
      data[field.key] = rows;
      continue;
    }
    const checked = scalar(field, value);
    if (!checked.ok) return checked;
    data[field.key] = checked.value;
  }
  if (!options.partial) {
    const missing = collection.fields.find((field) => field.required && (data[field.key] === undefined || data[field.key] === null || data[field.key] === ""));
    if (missing) return { ok: false, error: `Falta «${missing.label}».` };
  }
  if (JSON.stringify(data).length > liveAppLimits.maxRecordBytes) return { ok: false, error: "El registro es demasiado grande." };
  return { ok: true, data };
}
