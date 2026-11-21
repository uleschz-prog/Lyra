// Paso «plan» del generador v2: elige sistema de diseño y composición de secciones según el
// brief, y normaliza lo que propone el modelo para que el resto del pipeline sea seguro.
import { designSystems, getDesignSystem, rankDesignSystems, stableHash, type DesignSystem } from "@/lib/builder/design-systems";
import { iconOr } from "@/lib/builder/icons";
import { getSectionDef, sectionLibrary, sectionsFor, type SectionDef } from "@/lib/builder/sections";
import type { BuildKind, BuildPlan, Entity, EntityField, FieldType, LivePlan, PlannedPage, PlannedSection, SectionContent, SectionItem, SeedValue } from "@/lib/builder/types";

/* ------------------------------ Utilidades ------------------------------ */

function fold(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function clipMultiline(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function pascalName(text: string, fallback: string) {
  const words = fold(text)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 4);
  const name = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  return /^[A-Z][A-Za-z0-9]{1,40}$/.test(name) ? name : fallback;
}

function slugPath(text: string) {
  const slug = fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return slug ? `/${slug}` : "/";
}

function identifier(text: string, fallback: string) {
  const words = fold(text).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const id = words.map((word, index) => (index ? word[0].toUpperCase() + word.slice(1) : word)).join("").slice(0, 30);
  return /^[a-z][A-Za-z0-9]*$/.test(id) ? id : fallback;
}

/** Dominios de imagen permitidos en el contenido (las demás URL se descartan). */
export const imageHosts = ["images.unsplash.com"];

function safeImage(value: unknown) {
  const raw = clip(value, 400);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && imageHosts.includes(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeHref(value: unknown, paths: Set<string>) {
  const raw = clip(value, 200);
  if (/^#[a-z0-9-]{2,30}$/.test(raw)) return raw;
  if (raw.startsWith("/") && paths.has(raw.split("#")[0])) return raw;
  if (/^(mailto:|tel:)/.test(raw)) return raw;
  if (/^https:\/\/wa\.me\/\d{8,15}/.test(raw)) return raw;
  return "";
}

/* ------------------------- Composición sugerida ------------------------- */

const systemAffinity: Record<string, string[]> = {
  aurora: ["hero-centered", "nav-pill", "features-bento", "logos-strip", "pricing-tiers", "comparison-table", "app-shell-sidebar"],
  editorial: ["hero-editorial", "services-list", "nav-centered", "faq-columns", "testimonial-spotlight", "about-story", "footer-columns"],
  clinic: ["hero-split", "services-cards", "booking-request", "team-grid", "faq-accordion", "nav-minimal", "app-shell-sidebar"],
  noir: ["hero-stats", "nav-minimal", "pricing-tiers", "stats-band", "features-grid", "gallery-mosaic", "app-shell-topbar"],
  atelier: ["nav-centered", "hero-editorial", "testimonial-spotlight", "gallery-mosaic", "portfolio-cases", "process-timeline", "footer-minimal"],
  playful: ["hero-bento", "nav-pill", "features-grid", "menu-board", "testimonials-grid", "cta-newsletter", "app-shell-topbar"],
  corporate: ["hero-split", "stats-band", "services-list", "faq-columns", "logos-strip", "process-steps", "footer-columns", "app-shell-sidebar"],
  organic: ["hero-offer", "about-story", "values-grid", "gallery-mosaic", "contact-cards", "process-timeline", "nav-minimal"],
};

function pick(defs: SectionDef[], brief: string, system: DesignSystem, salt: string) {
  const text = ` ${fold(brief).replace(/[^a-z0-9ñ]+/g, " ")} `;
  const affinity = new Set(systemAffinity[system.id] ?? []);
  return [...defs]
    .map((def) => {
      let score = 0;
      for (const tag of def.tags) if (text.includes(` ${fold(tag)}`)) score += 2;
      if (affinity.has(def.id)) score += 1.5;
      score += (stableHash(`${salt}:${text}:${def.id}`) % 100) / 100;
      return { def, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.def;
}

function byCategory(kind: BuildKind, category: string) {
  return sectionLibrary.filter((def) => def.kind === kind && def.category === category);
}

export type Composition = {
  candidates: DesignSystem[];
  system: DesignSystem;
  pages: { path: string; title: string; sections: string[] }[];
  chrome: string[];
};

function mentions(brief: string, words: string[]) {
  const text = ` ${fold(brief).replace(/[^a-z0-9ñ]+/g, " ")}`;
  return words.some((word) => text.includes(` ${word}`));
}

/** Composición determinista: el punto de partida del plan y el respaldo si el modelo falla. */
export function composeSkeleton(brief: string, kind: BuildKind): Composition {
  const candidates = rankDesignSystems(brief, kind).slice(0, 4);
  const system = candidates[0];
  const choose = (category: string, salt = category) => pick(byCategory(kind, category), brief, system, salt)?.id;

  if (kind === "app") {
    const shell = choose("shell") ?? "app-shell-sidebar";
    const pages: Composition["pages"] = [{ path: "/", title: "Inicio", sections: [mentions(brief, ["punto de venta", "caja", "cobrar", "mostrador", "tienda"]) ? "app-pos" : "app-dashboard"] }];
    if (mentions(brief, ["cita", "agenda", "reserva", "clase", "turno"])) pages.push({ path: "/agenda", title: "Agenda", sections: ["app-agenda"] });
    if (mentions(brief, ["pedido", "tarea", "seguimiento", "proyecto", "estado", "orden", "embudo", "etapa", "prospecto"])) pages.push({ path: "/seguimiento", title: "Seguimiento", sections: ["app-kanban"] });
    pages.push({ path: "/registros", title: "Registros", sections: ["app-table"] });
    pages.push({ path: "/registros/nuevo", title: "Nuevo", sections: ["app-form"] });
    if (mentions(brief, ["reporte", "estadistica", "venta", "ingreso", "grafica"])) pages.push({ path: "/reportes", title: "Reportes", sections: ["app-chart", "app-activity"] });
    pages.push({ path: "/ajustes", title: "Ajustes", sections: ["app-settings"] });
    return { candidates, system, pages: pages.slice(0, 7), chrome: [shell] };
  }

  const home: string[] = [choose("hero") ?? "hero-split"];
  if (mentions(brief, ["empresa", "b2b", "clientes corporativos", "industria", "agencia", "software"])) home.push(choose("social", "social-a") ?? "logos-strip");
  const local = mentions(brief, ["restaurante", "cafe", "taqueria", "bar", "pasteleria", "panaderia", "menu", "comida"]);
  if (local) home.push("menu-board");
  home.push(choose("features") ?? "features-grid");
  if (!local) home.push(choose("services") ?? "services-cards");
  home.push(choose("process") ?? "process-steps");
  if (mentions(brief, ["fotografia", "galeria", "interiorismo", "arquitectura", "boda", "portafolio", "proyectos", "tatuaje"])) home.push(choose("gallery") ?? "gallery-mosaic");
  home.push(pick(byCategory(kind, "social").filter((def) => def.id.startsWith("testimonial")), brief, system, "t")?.id ?? "testimonials-grid");
  if (mentions(brief, ["precio", "plan", "membresia", "paquete", "suscripcion", "tarifa"])) home.push(choose("pricing") ?? "pricing-tiers");
  home.push(choose("faq") ?? "faq-accordion");
  home.push(choose("cta") ?? "cta-banner");

  const pages: Composition["pages"] = [{ path: "/", title: "Inicio", sections: home }];
  if (mentions(brief, ["nosotros", "historia", "equipo", "familia", "fundad", "trayectoria"])) {
    pages.push({ path: "/nosotros", title: "Nosotros", sections: ["about-story", choose("about", "about-b") === "team-grid" ? "team-grid" : "values-grid"] });
  }
  if (mentions(brief, ["cita", "agenda", "reserva", "consulta", "turno"])) pages.push({ path: "/agenda", title: "Agenda", sections: ["booking-request"] });
  pages.push({ path: "/contacto", title: "Contacto", sections: [choose("contact") ?? "contact-split"] });
  const chrome = [choose("nav") ?? "nav-minimal", choose("footer") ?? "footer-columns"];
  return { candidates, system, pages, chrome };
}

/* ------------------------------- Prompts ------------------------------- */

export function planSystemPrompt(kind: BuildKind, options: { live?: boolean } = {}) {
  const live = kind === "app" && options.live;
  return [
    "Eres director de arte y arquitecto full stack de LYRA. Planeas un proyecto web premium en React + Tailwind a partir de un brief en español de México.",
    "Respondes SOLO un objeto JSON válido (sin comentarios ni texto extra) con esta forma:",
    `{"title":"","summary":"","brand":{"name":"","tagline":"","phone":"","email":"","whatsapp":"","address":"","hours":""},"designSystem":"<id>","chrome":[{"id":"<seccion>","content":{"title":"","cta":{"label":"","href":""}}}],"pages":[{"path":"/","title":"Inicio","sections":[{"id":"<seccion>","anchor":"","direction":"","content":{"eyebrow":"","title":"","subtitle":"","cta":{"label":"","href":""},"secondary":{"label":"","href":""},"items":[{"title":"","text":"","icon":"","meta":"","price":""}],"note":"","fields":[]${kind === "app" ? ',"entity":""' : ""}}}]}]${kind === "app" ? ',"entities":[{"key":"clientes","label":"Clientes","singular":"Cliente","icon":"Users","fields":[{"key":"nombre","label":"Nombre","type":"text","required":true}],"seed":[{"nombre":"Ana López"}]}]' : ""},"suggestions":["",""],"assumptions":[""]}`,
    "Reglas de contenido: copy final, específico del negocio y persuasivo, en español natural de México. Nada de lorem ipsum ni «Servicio 1». No inventes precios, reseñas con nombres reales, certificaciones ni cifras de resultados: si no están en el brief, usa beneficios cualitativos o deja precio vacío; puedes usar testimonios genéricos con nombre de pila e indicarlo en assumptions.",
    "No pongas URLs de imágenes salvo que el brief las dé. No inventes teléfonos ni correos: deja vacío lo que no te den.",
    "href: usa rutas de las páginas del plan (\"/contacto\") o anclas de secciones (\"#servicios\").",
    "direction: una o dos frases de dirección de arte para esa sección concreta (composición, énfasis, detalle visual memorable) coherentes con el sistema de diseño.",
    kind === "app"
      ? "App: 4 a 7 pantallas (páginas) con una tarea principal completa. Define 1 a 3 entidades con 3 a 7 campos (tipos: text, longtext, number, money, date, time, email, phone, select con options, boolean) y 4 a 8 registros de ejemplo realistas por entidad. Las pantallas usan content.entity con la key de la entidad. Una página de alta debe ir en /<entidad>/nuevo y su lista en /<entidad>."
      : "Sitio: 2 a 5 páginas (la primera es \"/\"); la portada lleva 6 a 9 secciones con ritmo variado; cada página tiene un propósito claro. Usa anchors cortos en minúsculas.",
    ...(live ? liveRules : []),
    "Usa solo ids de sección del catálogo dado y solo íconos de la lista dada.",
  ].join("\n");
}

export function planUserPrompt(input: { brief: string; kind: BuildKind; composition: Composition; icons: readonly string[] }) {
  const { composition } = input;
  const catalog = sectionsFor(input.kind)
    .map((def) => `- ${def.id} [${def.role === "section" ? def.category : def.role}]: ${def.recipe}`)
    .join("\n");
  const systems = composition.candidates.map((system) => `- ${system.id}: ${system.name}. ${system.description}`).join("\n");
  const proposal = JSON.stringify({ designSystem: composition.system.id, chrome: composition.chrome, pages: composition.pages });
  return [
    `Tipo: ${input.kind === "app" ? "app web" : "sitio web"}.`,
    `Brief del socio:\n${input.brief}`,
    `Sistemas de diseño recomendados (elige uno; el primero es el que mejor encaja):\n${systems}`,
    `Catálogo de secciones:\n${catalog}`,
    `Composición propuesta (puedes mejorarla para este negocio):\n${proposal}`,
    `Íconos permitidos: ${input.icons.join(", ")}.`,
  ].join("\n\n");
}

/** Reglas extra del plan cuando la app usa datos en vivo (equipo, sucursales, sincronización). */
const liveRules = [
  "DATOS EN VIVO: esta app la usa un equipo al mismo tiempo (cada persona entra con PIN) y los datos se comparten entre dispositivos y sucursales. Agrega al JSON la llave \"live\": {\"roles\":[{\"key\":\"mesero\",\"label\":\"Mesero\"}],\"branches\":[{\"id\":\"centro\",\"name\":\"Centro\"}]} con 1 a 6 roles (sin \"admin\": ya existe) y las sucursales que mencione el brief (si no hay, una llamada \"principal\").",
  "En cada entidad agrega: \"scope\": \"branch\" (cada registro es de una sucursal: pedidos, existencias, cortes) o \"shared\" (catálogo común: productos, menú, clientes); \"sync\": \"recent\" para lo que crece cada día (pedidos, movimientos) o \"all\"; \"write\": roles que pueden modificarla (vacío = todos). Puedes usar hasta 6 entidades.",
  "Tipos extra de campo: \"ref\" con \"ref\": <key de otra entidad> (guarda el id del registro) e \"items\" con \"fields\" (renglones, p. ej. platillos de una comanda con nombre, cantidad y precio). Los registros de ejemplo pueden traer \"id\" (letras, números, - y _) para referenciarlos y, en entidades por sucursal, \"branchId\".",
  "Diseña una pantalla por rol (p. ej. tomar pedido, cocina, caja, inventario, resumen) además de las de catálogo.",
];

/* ----------------------------- Normalización ----------------------------- */

const fieldTypes = new Set<FieldType>(["text", "longtext", "number", "money", "date", "time", "email", "phone", "select", "boolean"]);
const liveFieldTypes = new Set<FieldType>([...fieldTypes, "ref", "items"]);
const roleKeyPattern = /^[a-z][a-z0-9]{1,19}$/;
const branchIdPattern = /^[a-z0-9][a-z0-9-]{0,23}$/;
const seedIdPattern = /^[A-Za-z0-9_-]{2,64}$/;

function slugId(text: string, max: number) {
  return fold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max);
}

/** Roles y sucursales de una app con datos en vivo (siempre al menos una sucursal). */
export function normalizeLive(value: unknown): LivePlan {
  const raw = record(value) ?? {};
  const roles: LivePlan["roles"] = [];
  for (const item of Array.isArray(raw.roles) ? raw.roles.slice(0, 8) : []) {
    const role = record(item);
    const label = clip(role?.label, 30);
    const key = fold(clip(role?.key, 20) || label).replace(/[^a-z0-9]/g, "").slice(0, 20);
    if (!roleKeyPattern.test(key) || key === "admin" || roles.some((entry) => entry.key === key)) continue;
    roles.push({ key, label: label || key });
    if (roles.length >= 6) break;
  }
  const branches: LivePlan["branches"] = [];
  for (const item of Array.isArray(raw.branches) ? raw.branches.slice(0, 12) : []) {
    const branch = record(item);
    const name = clip(branch?.name, 40);
    const id = slugId(clip(branch?.id, 24) || name, 24);
    if (!name || !branchIdPattern.test(id) || branches.some((entry) => entry.id === id)) continue;
    branches.push({ id, name });
  }
  if (!branches.length) branches.push({ id: "principal", name: "Principal" });
  return { roles, branches };
}

function seedCell(field: EntityField, cell: unknown): SeedValue | undefined {
  if (field.type === "number" || field.type === "money") {
    const number = Number(cell);
    return Number.isFinite(number) ? number : undefined;
  }
  if (field.type === "boolean") return typeof cell === "boolean" ? cell : undefined;
  if (field.type === "select") return typeof cell === "string" && field.options?.includes(cell) ? cell : undefined;
  if (field.type === "ref") return typeof cell === "string" && seedIdPattern.test(cell) ? cell : undefined;
  if (field.type === "items") {
    if (!Array.isArray(cell)) return undefined;
    const rows = cell
      .map(record)
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .slice(0, 20)
      .map((row) => {
        const clean: Record<string, string | number | boolean> = {};
        for (const sub of field.fields ?? []) {
          const value = seedCell(sub, row[sub.key]);
          if (value !== undefined && value !== null && !Array.isArray(value)) clean[sub.key] = value;
        }
        return clean;
      })
      .filter((row) => Object.keys(row).length > 0);
    return rows;
  }
  return typeof cell === "string" && cell.trim() ? clipMultiline(cell, 400) : undefined;
}

function normalizeField(field: Record<string, unknown>, live: boolean, nested: boolean): EntityField | null {
  const fieldKey = identifier(clip(field.key, 30) || clip(field.label, 30), "");
  if (!fieldKey || ["id", "createdAt", "updatedAt", "branchId"].includes(fieldKey)) return null;
  // Renglones dentro de renglones no: se descartan en vez de volverse texto.
  if (nested && field.type === "items") return null;
  const allowed = live && !nested ? liveFieldTypes : live ? new Set<FieldType>([...fieldTypes, "ref"]) : fieldTypes;
  const type = allowed.has(field.type as FieldType) ? (field.type as FieldType) : "text";
  const options = type === "select" && Array.isArray(field.options) ? field.options.map((option) => clip(option, 40)).filter(Boolean).slice(0, 8) : undefined;
  if (type === "select" && !options?.length) return null;
  const ref = type === "ref" ? identifier(clip(field.ref, 30), "") : "";
  if (type === "ref" && !ref) return null;
  let fields: EntityField[] | undefined;
  if (type === "items") {
    fields = [];
    for (const raw of Array.isArray(field.fields) ? field.fields.slice(0, 8) : []) {
      const sub = record(raw);
      const normalized = sub ? normalizeField(sub, live, true) : null;
      if (normalized && !fields.some((entry) => entry.key === normalized.key)) fields.push(normalized);
    }
    if (!fields.length) return null;
  }
  return {
    key: fieldKey,
    label: clip(field.label, 40) || fieldKey,
    type,
    ...(options ? { options } : {}),
    ...(field.required === true ? { required: true } : {}),
    ...(ref ? { ref } : {}),
    ...(fields ? { fields } : {}),
  };
}

function roleList(value: unknown, roles: Set<string>) {
  return (Array.isArray(value) ? value : []).map((item) => clip(item, 20)).filter((item) => item === "admin" || roles.has(item)).slice(0, 8);
}

function normalizeItems(value: unknown): SectionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(record)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      title: clip(item.title ?? item.nombre ?? item.titulo, 120),
      text: clipMultiline(item.text ?? item.texto ?? item.detalle, 500),
      icon: iconOr(item.icon, "Sparkles"),
      meta: clip(item.meta, 80),
      price: clip(item.price ?? item.precio, 40),
      image: safeImage(item.image),
    }))
    .filter((item) => item.title)
    .slice(0, 16)
    .map((item) => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== "")) as SectionItem);
}

function normalizeContent(value: unknown, paths: Set<string>, entities: Set<string>, fallbackTitle: string): SectionContent {
  const raw = record(value) ?? {};
  const cta = record(raw.cta);
  const secondary = record(raw.secondary);
  const ctaHref = cta ? safeHref(cta.href, paths) : "";
  const secondaryHref = secondary ? safeHref(secondary.href, paths) : "";
  const content: SectionContent = {
    title: clip(raw.title, 140) || fallbackTitle,
  };
  const eyebrow = clip(raw.eyebrow, 60);
  const subtitle = clipMultiline(raw.subtitle, 400);
  const note = clipMultiline(raw.note, 1200);
  if (eyebrow) content.eyebrow = eyebrow;
  if (subtitle) content.subtitle = subtitle;
  if (cta && clip(cta.label, 40) && ctaHref) content.cta = { label: clip(cta.label, 40), href: ctaHref };
  if (secondary && clip(secondary.label, 40) && secondaryHref) content.secondary = { label: clip(secondary.label, 40), href: secondaryHref };
  const list = normalizeItems(raw.items);
  if (list.length) content.items = list;
  const image = safeImage(raw.image);
  if (image) content.image = image;
  if (note) content.note = note;
  if (Array.isArray(raw.fields)) {
    const fields = raw.fields.map((field) => clip(field, 40)).filter(Boolean).slice(0, 8);
    if (fields.length) content.fields = fields;
  }
  const entity = clip(raw.entity, 30);
  if (entity && entities.has(entity)) content.entity = entity;
  return content;
}

function normalizeEntities(value: unknown, live: LivePlan | null = null): Entity[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entities: Entity[] = [];
  const roles = new Set(live?.roles.map((role) => role.key) ?? []);
  const branches = new Set(live?.branches.map((branch) => branch.id) ?? []);
  for (const rawEntity of value.slice(0, live ? 8 : 4)) {
    const raw = record(rawEntity);
    if (!raw) continue;
    const key = identifier(clip(raw.key, 30) || clip(raw.label, 30), "");
    if (!key || seen.has(key) || ["schema", "stores", "row"].includes(key.toLowerCase())) continue;
    const fieldKeys = new Set<string>();
    const fields: EntityField[] = [];
    for (const rawField of Array.isArray(raw.fields) ? raw.fields.slice(0, live ? 14 : 10) : []) {
      const field = record(rawField);
      const normalized = field ? normalizeField(field, Boolean(live), false) : null;
      if (!normalized || fieldKeys.has(normalized.key)) continue;
      fieldKeys.add(normalized.key);
      fields.push(normalized);
    }
    if (!fields.length) continue;
    if (!fields.some((field) => field.type === "text")) fields.unshift({ key: "nombre", label: "Nombre", type: "text", required: true });
    const seed = (Array.isArray(raw.seed) ? raw.seed : [])
      .map(record)
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .slice(0, 12)
      .map((row) => {
        const clean: Record<string, SeedValue> = {};
        for (const field of fields) {
          const cell = seedCell(field, row[field.key]);
          if (cell !== undefined) clean[field.key] = cell;
        }
        if (live && Object.keys(clean).length) {
          if (typeof row.id === "string" && seedIdPattern.test(row.id)) clean.id = row.id;
          if (typeof row.branchId === "string" && branches.has(row.branchId)) clean.branchId = row.branchId;
        }
        return clean;
      })
      .filter((row) => Object.keys(row).length > 0);
    seen.add(key);
    entities.push({
      key,
      label: clip(raw.label, 40) || key,
      singular: clip(raw.singular, 40) || clip(raw.label, 40) || key,
      icon: iconOr(raw.icon, "Layers"),
      fields,
      seed,
      ...(live
        ? {
            scope: raw.scope === "branch" ? ("branch" as const) : ("shared" as const),
            sync: raw.sync === "recent" ? ("recent" as const) : ("all" as const),
            write: roleList(raw.write, roles),
            read: roleList(raw.read, roles),
          }
        : {}),
    });
  }
  if (live) {
    // Las referencias deben apuntar a una entidad del plan.
    const keys = new Set(entities.map((entity) => entity.key));
    for (const entity of entities) {
      entity.fields = entity.fields.filter((field) => field.type !== "ref" || keys.has(field.ref ?? ""));
      for (const field of entity.fields) if (field.fields) field.fields = field.fields.filter((sub) => sub.type !== "ref" || keys.has(sub.ref ?? ""));
    }
  }
  return entities;
}

function genericEntity(): Entity {
  return {
    key: "registros",
    label: "Registros",
    singular: "Registro",
    icon: "ClipboardList",
    fields: [
      { key: "nombre", label: "Nombre", type: "text", required: true },
      { key: "estado", label: "Estado", type: "select", options: ["Pendiente", "En curso", "Listo"] },
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "monto", label: "Monto", type: "money" },
      { key: "notas", label: "Notas", type: "longtext" },
    ],
    seed: [],
  };
}

export type NormalizeInput = { brief: string; kind: BuildKind; composition: Composition; fallbackTitle: string; live?: boolean };

/**
 * Convierte la propuesta del modelo (o null) en un plan válido: ids de sección y de sistema
 * existentes, nombres de componente únicos, rutas seguras, contenido recortado.
 */
export function normalizePlan(raw: unknown, input: NormalizeInput): BuildPlan {
  const data = record(raw) ?? {};
  const kind = input.kind;
  const brandRaw = record(data.brand) ?? {};
  const title = clip(data.title, 80) || input.fallbackTitle;
  const brand = {
    name: clip(brandRaw.name, 60) || title,
    tagline: clip(brandRaw.tagline, 140) || clip(data.summary, 140),
    ...(clip(brandRaw.phone, 30) ? { phone: clip(brandRaw.phone, 30) } : {}),
    ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clip(brandRaw.email, 80)) ? { email: clip(brandRaw.email, 80) } : {}),
    ...(clip(brandRaw.whatsapp, 30).replace(/\D/g, "").length >= 10 ? { whatsapp: clip(brandRaw.whatsapp, 30) } : {}),
    ...(clip(brandRaw.address, 140) ? { address: clip(brandRaw.address, 140) } : {}),
    ...(clip(brandRaw.hours, 80) ? { hours: clip(brandRaw.hours, 80) } : {}),
  };

  const requested = getDesignSystem(clip(data.designSystem, 30));
  const system = requested ?? input.composition.system;

  const live = kind === "app" && input.live ? normalizeLive(data.live) : null;
  let entities = kind === "app" ? normalizeEntities(data.entities, live) : [];
  if (kind === "app" && !entities.length) entities = [genericEntity()];
  const entityKeys = new Set(entities.map((entity) => entity.key));

  // Páginas: rutas únicas que empiezan con «/» y la portada primero.
  const rawPages = Array.isArray(data.pages) ? data.pages.map(record).filter((page): page is Record<string, unknown> => Boolean(page)) : [];
  const pageSources = rawPages.length
    ? rawPages
    : input.composition.pages.map((page) => ({ path: page.path, title: page.title, sections: page.sections.map((id) => ({ id })) }));
  const maxPages = kind === "app" ? 8 : 6;
  const pathSeen = new Set<string>();
  const pagesDraft: { path: string; title: string; sections: Record<string, unknown>[] }[] = [];
  for (const page of pageSources) {
    let path = clip(page.path, 40).toLowerCase();
    if (!/^\/[a-z0-9\-/]*$/.test(path) || path.includes("//")) path = slugPath(clip(page.title, 40));
    if (path.length > 1) path = path.replace(/\/$/, "");
    if (pathSeen.has(path)) continue;
    pathSeen.add(path);
    const sections = Array.isArray(page.sections) ? page.sections.map(record).filter((section): section is Record<string, unknown> => Boolean(section)) : [];
    pagesDraft.push({ path, title: clip(page.title, 30) || (path === "/" ? "Inicio" : path.slice(1)), sections });
    if (pagesDraft.length >= maxPages) break;
  }
  if (!pathSeen.has("/")) pagesDraft.unshift({ path: "/", title: "Inicio", sections: input.composition.pages[0].sections.map((id) => ({ id })) });
  pagesDraft.sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : 0));
  const paths = new Set(pagesDraft.map((page) => page.path));

  const names = new Set<string>(["App", "Shell", "Nav", "Footer", "Main", "Router", "Link"]);
  const uniqueName = (base: string) => {
    let name = base;
    for (let index = 2; names.has(name); index += 1) name = `${base}${index}`;
    names.add(name);
    return name;
  };

  const toSection = (rawSection: Record<string, unknown>, allowed: (def: SectionDef) => boolean, fallbackTitle: string): PlannedSection | null => {
    const def = getSectionDef(clip(rawSection.id, 40));
    if (!def || def.kind !== kind || !allowed(def)) return null;
    const content = normalizeContent(rawSection.content, paths, entityKeys, fallbackTitle);
    if (kind === "app" && def.role === "section" && !content.entity) content.entity = entities[0].key;
    const anchor = clip(rawSection.anchor, 30).toLowerCase();
    const direction = clip(rawSection.direction, 300);
    return {
      id: def.id,
      name: uniqueName(pascalName(def.label, "Seccion")),
      ...(/^[a-z0-9-]{2,30}$/.test(anchor) ? { anchor } : {}),
      content,
      ...(direction ? { direction } : {}),
    };
  };

  const pages: PlannedPage[] = pagesDraft.map((page, pageIndex) => {
    const sections = page.sections
      .slice(0, 10)
      .map((section) => toSection(section, (def) => def.role === "section", page.title))
      .filter((section): section is PlannedSection => Boolean(section));
    if (!sections.length) {
      const fallbackIds = input.composition.pages[Math.min(pageIndex, input.composition.pages.length - 1)].sections;
      for (const id of fallbackIds) {
        const section = toSection({ id, content: { title: page.title } }, (def) => def.role === "section", page.title);
        if (section) sections.push(section);
      }
    }
    return { path: page.path, title: page.title, name: uniqueName(`${pascalName(page.title, "Pagina")}Page`), sections };
  });

  // Marco: nav + pie para sitios; shell para apps.
  const rawChrome = Array.isArray(data.chrome) ? data.chrome.map(record).filter((section): section is Record<string, unknown> => Boolean(section)) : [];
  const roles = kind === "app" ? ["shell"] : ["nav", "footer"];
  const chrome: PlannedSection[] = [];
  for (const role of roles) {
    const fromModel = rawChrome.map((section) => toSection(section, (def) => def.role === role, brand.name)).find(Boolean);
    const fallbackId = input.composition.chrome.find((id) => getSectionDef(id)?.role === role) ?? sectionsFor(kind, role as SectionDef["role"])[0].id;
    const section = fromModel ?? toSection({ id: fallbackId, content: { title: brand.name } }, () => true, brand.name);
    if (section) chrome.push({ ...section, name: role === "shell" ? "Shell" : role === "nav" ? "Nav" : "Footer" });
  }

  const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : []).map((item) => clip(item, 160)).filter(Boolean).slice(0, 3);
  const assumptions = (Array.isArray(data.assumptions) ? data.assumptions : []).map((item) => clip(item, 200)).filter(Boolean).slice(0, 6);

  return {
    version: 1,
    kind,
    title,
    summary: clip(data.summary, 400) || input.brief.slice(0, 200),
    brand,
    designSystem: system.id,
    chrome,
    pages,
    entities,
    ...(live ? { live } : {}),
    suggestions,
    assumptions,
  };
}

/** Los ids de los sistemas (para pruebas y validación). */
export const designSystemList = designSystems.map((system) => system.id);
