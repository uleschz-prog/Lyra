// Entrega 2: reglas de la dirección pública /s/[slug].

export const slugLimits = { min: 3, max: 40 } as const;

/** Palabras que no se pueden usar (rutas de LYRA, marcas propias y nombres que confunden). */
export const reservedSlugs = new Set([
  "admin",
  "administrador",
  "api",
  "app",
  "apps",
  "ayuda",
  "blog",
  "contacto",
  "cuenta",
  "dashboard",
  "docs",
  "help",
  "inicio",
  "legal",
  "login",
  "logout",
  "mail",
  "marketplace",
  "null",
  "oficial",
  "pago",
  "pagos",
  "panel",
  "partners",
  "preview",
  "privacidad",
  "proyectos",
  "register",
  "registro",
  "root",
  "s",
  "seguridad",
  "sitio",
  "sitios",
  "soporte",
  "static",
  "status",
  "support",
  "terminos",
  "undefined",
  "vega",
  "wallet",
  "billetera",
  "www",
]);

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: string };

/** Valida una dirección escrita por el socio. No cambia lo que escribió salvo mayúsculas y espacios. */
export function checkSlug(raw: unknown): SlugCheck {
  if (typeof raw !== "string") return { ok: false, error: "Escribe una dirección." };
  const slug = raw.trim().toLowerCase();
  if (slug.length < slugLimits.min) return { ok: false, error: `Usa al menos ${slugLimits.min} caracteres.` };
  if (slug.length > slugLimits.max) return { ok: false, error: `Usa máximo ${slugLimits.max} caracteres.` };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: "Solo letras sin acentos, números y guiones (-)." };
  if (slug.startsWith("-") || slug.endsWith("-") || slug.includes("--")) return { ok: false, error: "Sin guiones al inicio, al final ni dobles." };
  if (reservedSlugs.has(slug)) return { ok: false, error: "Esa dirección está reservada. Prueba con el nombre de tu negocio." };
  if (/^lyy?ra/.test(slug)) return { ok: false, error: "Las direcciones que empiezan con «lyra» están reservadas." };
  return { ok: true, slug };
}

/** Propuesta a partir del título del proyecto (siempre válida o vacía). */
export function suggestSlug(title: string) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, slugLimits.max)
    .replace(/-+$/g, "");
  if (checkSlug(base).ok) return base;
  const padded = `${base || "mi-sitio"}-web`.slice(0, slugLimits.max);
  return checkSlug(padded).ok ? padded : "";
}
