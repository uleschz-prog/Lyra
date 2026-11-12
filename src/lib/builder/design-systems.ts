// Sistemas de diseño curados del generador v2. Cada uno define tipografía, tokens de color,
// radios, sombras y notas de estilo. El plan elige uno según el brief: así dos negocios
// distintos no salen con la misma cara.

export type DesignTokens = {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  line: string;
  primary: string;
  primaryInk: string;
  accent: string;
  accentInk: string;
};

export type DesignSystem = {
  id: string;
  name: string;
  /** Para el modelo: personalidad y cuándo conviene. */
  description: string;
  /** Palabras del brief que lo favorecen (sin acentos, minúsculas). */
  vibes: string[];
  dark: boolean;
  fonts: { display: string; body: string; displayStack: string; bodyStack: string; href: string };
  tokens: DesignTokens;
  radius: { card: string; button: string; input: string };
  shadow: string;
  /** Reglas de estilo concretas que el modelo debe respetar. */
  style: string[];
};

const g = (families: string) => `https://fonts.googleapis.com/css2?${families}&display=swap`;

export const designSystems: DesignSystem[] = [
  {
    id: "aurora",
    name: "Aurora",
    description: "Tecnología moderna tipo SaaS: fondo claro, índigo y violeta, brillos de degradado sutiles, tarjetas con borde fino.",
    vibes: ["software", "saas", "app", "tecnologia", "startup", "plataforma", "digital", "ia", "automatizacion", "fintech", "agencia digital", "marketing", "crm", "gestion"],
    dark: false,
    fonts: {
      display: "Inter Tight",
      body: "Inter",
      displayStack: '"Inter Tight", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"Inter", ui-sans-serif, system-ui, sans-serif',
      href: g("family=Inter+Tight:wght@500;600;700;800&family=Inter:wght@400;500;600"),
    },
    tokens: { bg: "#FBFBFE", surface: "#FFFFFF", surface2: "#F3F2FF", ink: "#0F1222", muted: "#5B6078", line: "#E6E6F2", primary: "#5B4CF5", primaryInk: "#FFFFFF", accent: "#14B8A6", accentInk: "#042F2C" },
    radius: { card: "1.25rem", button: "0.75rem", input: "0.75rem" },
    shadow: "0 1px 2px rgb(15 18 34 / 0.04), 0 12px 32px -12px rgb(91 76 245 / 0.18)",
    style: ["Titulares con tracking ajustado (tracking-tight) y peso 700-800.", "Degradados radiales suaves de primary/accent detrás del héroe.", "Tarjetas bg-surface con border-line y shadow-card; íconos en cuadros bg-surface-2 text-primary."],
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Revista impresa: serif expresiva, fondo crema, tinta casi negra y acento terracota. Ideal para restaurantes, consultoría, autores y marcas con historia.",
    vibes: ["restaurante", "cocina", "chef", "libro", "autor", "consultoria", "despacho", "historia", "boutique", "cafe", "vino", "mezcal", "artesanal", "revista", "blog", "periodismo"],
    dark: false,
    fonts: {
      display: "Fraunces",
      body: "Inter",
      displayStack: '"Fraunces", ui-serif, Georgia, serif',
      bodyStack: '"Inter", ui-sans-serif, system-ui, sans-serif',
      href: g("family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600"),
    },
    tokens: { bg: "#F7F3EC", surface: "#FFFDF8", surface2: "#EFE7DA", ink: "#1C1917", muted: "#6B625A", line: "#E2D8C8", primary: "#B4532A", primaryInk: "#FFF8F1", accent: "#2F4A3A", accentInk: "#F2F7F3" },
    radius: { card: "0.375rem", button: "0.25rem", input: "0.25rem" },
    shadow: "0 1px 0 rgb(28 25 23 / 0.06)",
    style: ["Titulares serif grandes (text-5xl a text-7xl) con itálica ocasional para una palabra clave.", "Reglas horizontales finas (border-line) y numeración tipo índice (01, 02…).", "Mucho aire, columnas asimétricas, sin sombras pesadas."],
  },
  {
    id: "clinic",
    name: "Clínica serena",
    description: "Salud y bienestar: blanco limpio, verde azulado calmado, esquinas muy redondeadas, tono confiable y cálido.",
    vibes: ["clinica", "dental", "dentista", "doctor", "medico", "salud", "nutriologo", "nutricion", "psicologo", "terapia", "fisioterapia", "veterinaria", "spa", "bienestar", "consultorio", "hospital", "farmacia"],
    dark: false,
    fonts: {
      display: "Plus Jakarta Sans",
      body: "Plus Jakarta Sans",
      displayStack: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
      href: g("family=Plus+Jakarta+Sans:wght@400;500;600;700;800"),
    },
    tokens: { bg: "#F6FAF9", surface: "#FFFFFF", surface2: "#E6F4F1", ink: "#0B2A2A", muted: "#4F6B6A", line: "#DCEBE8", primary: "#0F766E", primaryInk: "#FFFFFF", accent: "#F59E0B", accentInk: "#3B2300" },
    radius: { card: "1.75rem", button: "9999px", input: "1rem" },
    shadow: "0 10px 30px -15px rgb(15 118 110 / 0.25)",
    style: ["Formas orgánicas: blobs y círculos con bg-surface-2 detrás de los elementos.", "Botones de píldora; insignias de confianza (horarios, cédula, ubicación) cerca del CTA.", "Íconos lineales dentro de círculos bg-surface-2."],
  },
  {
    id: "noir",
    name: "Noir",
    description: "Oscuro y contundente: negro profundo, acento lima eléctrico, grotesca técnica. Para gimnasios, tecnología, música, eventos y marcas atrevidas.",
    vibes: ["gimnasio", "gym", "crossfit", "fitness", "box", "entrenamiento", "musica", "dj", "evento", "fiesta", "bar", "gaming", "videojuegos", "barberia", "tatuajes", "streetwear", "ciberseguridad", "web3"],
    dark: true,
    fonts: {
      display: "Space Grotesk",
      body: "Inter",
      displayStack: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"Inter", ui-sans-serif, system-ui, sans-serif',
      href: g("family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600"),
    },
    tokens: { bg: "#0A0A0C", surface: "#131317", surface2: "#1C1C22", ink: "#F4F4F5", muted: "#A1A1AA", line: "#26262E", primary: "#C6F432", primaryInk: "#0A0A0C", accent: "#7C5CFF", accentInk: "#FFFFFF" },
    radius: { card: "1rem", button: "0.625rem", input: "0.625rem" },
    shadow: "0 0 0 1px rgb(255 255 255 / 0.04), 0 20px 40px -20px rgb(0 0 0 / 0.8)",
    style: ["Titulares en mayúsculas o con números grandes; contraste máximo.", "Detalles en primary (lima) para cifras, bordes activos y subrayados.", "Cuadrículas con líneas border-line visibles, look técnico."],
  },
  {
    id: "atelier",
    name: "Atelier",
    description: "Lujo discreto: arena y marfil, serif clásica fina, acento dorado. Para bienes raíces, bodas, belleza, joyería, hoteles y moda.",
    vibes: ["lujo", "inmobiliaria", "bienes raices", "departamentos", "boda", "bodas", "eventos sociales", "belleza", "salon", "estetica", "joyeria", "hotel", "moda", "arquitectura", "interiorismo", "fotografia"],
    dark: false,
    fonts: {
      display: "Cormorant Garamond",
      body: "Manrope",
      displayStack: '"Cormorant Garamond", ui-serif, Georgia, serif',
      bodyStack: '"Manrope", ui-sans-serif, system-ui, sans-serif',
      href: g("family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600"),
    },
    tokens: { bg: "#FAF7F2", surface: "#FFFFFF", surface2: "#F1EBE1", ink: "#2A2420", muted: "#7A6F65", line: "#E8DFD2", primary: "#2A2420", primaryInk: "#FAF7F2", accent: "#B08D57", accentInk: "#FFFFFF" },
    radius: { card: "0rem", button: "0rem", input: "0rem" },
    shadow: "0 30px 60px -30px rgb(42 36 32 / 0.25)",
    style: ["Serif fina en tamaños grandes y letras pequeñas espaciadas (uppercase tracking-[0.3em]) como etiquetas.", "Líneas doradas (accent) de 1px como separadores; marcos y paneles amplios.", "Paleta neutra; el acento dorado solo en detalles."],
  },
  {
    id: "playful",
    name: "Jugoso",
    description: "Alegre y cercano: colores vivos (coral, amarillo, azul), grotesca redondeada, sombras desplazadas tipo sticker. Para comida, niños, educación, mascotas y eventos.",
    vibes: ["ninos", "infantil", "escuela", "cursos", "clases", "taller", "academia", "pasteleria", "reposteria", "helados", "postres", "comida", "tacos", "food truck", "mascotas", "fiestas", "juguetes", "regalos"],
    dark: false,
    fonts: {
      display: "Bricolage Grotesque",
      body: "DM Sans",
      displayStack: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
      href: g("family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Sans:wght@400;500;700"),
    },
    tokens: { bg: "#FFF8EE", surface: "#FFFFFF", surface2: "#FFE7C2", ink: "#1D1A2F", muted: "#5E5873", line: "#1D1A2F", primary: "#FF5A3C", primaryInk: "#FFFFFF", accent: "#3D5AFE", accentInk: "#FFFFFF" },
    radius: { card: "1.5rem", button: "9999px", input: "0.875rem" },
    shadow: "4px 4px 0 0 #1D1A2F",
    style: ["Bordes de 2px border-line (tinta) y sombra desplazada shadow-card en tarjetas y botones.", "Tarjetas con fondos de color alternados (surface-2, primary/10, accent/10) y ligeras rotaciones (rotate-1, -rotate-1).", "Titulares extra gruesos y emojis con moderación."],
  },
  {
    id: "corporate",
    name: "Corporativo claro",
    description: "Profesional y sobrio: azul marino, blanco, cuadrícula precisa, sans técnica. Para despachos legales, contabilidad, finanzas, seguros, B2B e industria.",
    vibes: ["abogado", "abogados", "legal", "notaria", "contador", "contabilidad", "fiscal", "finanzas", "seguros", "consultora", "b2b", "industria", "manufactura", "logistica", "transporte", "construccion", "ingenieria", "recursos humanos"],
    dark: false,
    fonts: {
      display: "IBM Plex Sans",
      body: "IBM Plex Sans",
      displayStack: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
      href: g("family=IBM+Plex+Sans:wght@400;500;600;700"),
    },
    tokens: { bg: "#F7F9FC", surface: "#FFFFFF", surface2: "#EAF0F8", ink: "#0B1F3A", muted: "#4A5B72", line: "#D9E2EE", primary: "#123E7C", primaryInk: "#FFFFFF", accent: "#C8102E", accentInk: "#FFFFFF" },
    radius: { card: "0.5rem", button: "0.375rem", input: "0.375rem" },
    shadow: "0 1px 3px rgb(11 31 58 / 0.08)",
    style: ["Cuadrícula de 12 columnas, alineaciones estrictas, cifras y credenciales visibles.", "Bloques bg-primary con texto primary-ink para CTA y franjas de datos.", "Sin adornos; íconos finos y tablas limpias."],
  },
  {
    id: "organic",
    name: "Orgánico",
    description: "Natural y cálido: verdes oliva, tonos tierra, formas suaves y redondeadas. Para cafeterías, yoga, productos naturales, agricultura, viajes y sustentabilidad.",
    vibes: ["yoga", "meditacion", "organic", "natural", "huerto", "agricultura", "rancho", "eco", "sustentable", "plantas", "vivero", "viajes", "turismo", "hostal", "cabanas", "jabones", "cosmetica natural", "panaderia"],
    dark: false,
    fonts: {
      display: "Outfit",
      body: "Nunito Sans",
      displayStack: '"Outfit", ui-sans-serif, system-ui, sans-serif',
      bodyStack: '"Nunito Sans", ui-sans-serif, system-ui, sans-serif',
      href: g("family=Outfit:wght@400;500;600;700&family=Nunito+Sans:wght@400;600;700"),
    },
    tokens: { bg: "#F5F3EA", surface: "#FFFEF9", surface2: "#E5E8D4", ink: "#23291C", muted: "#5D6552", line: "#DCDDC9", primary: "#4D6B2F", primaryInk: "#FFFFFF", accent: "#C2703D", accentInk: "#FFFFFF" },
    radius: { card: "2rem", button: "9999px", input: "1.25rem" },
    shadow: "0 18px 40px -24px rgb(35 41 28 / 0.35)",
    style: ["Formas con esquinas muy redondeadas y recortes en arco (rounded-t-full) para marcos.", "Fondos alternos bg-surface-2 en secciones; texturas sutiles con degradados.", "Tono humano, frases cortas y verbos cálidos."],
  },
];

export const designSystemIds = designSystems.map((system) => system.id);

export function getDesignSystem(id: string | null | undefined): DesignSystem | null {
  return designSystems.find((system) => system.id === id) ?? null;
}

function fold(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Hash estable (FNV-1a) para desempates deterministas. */
export function stableHash(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Ordena los sistemas por afinidad con el brief (palabras clave) y desempata con un hash del brief,
 * para que briefs distintos sin pistas claras no caigan siempre en el mismo.
 */
export function rankDesignSystems(brief: string, kind: "sitio" | "app") {
  const text = ` ${fold(brief).replace(/[^a-z0-9ñ]+/g, " ")} `;
  const seed = stableHash(text);
  return designSystems
    .map((system, index) => {
      let score = 0;
      for (const vibe of system.vibes) if (text.includes(` ${vibe}`)) score += vibe.includes(" ") ? 3 : 2;
      if (kind === "app" && (system.id === "aurora" || system.id === "corporate")) score += 1;
      if (/\b(oscuro|dark|negro|nocturno)\b/.test(text) && system.dark) score += 3;
      const tiebreak = ((seed >>> (index % 24)) + index * 7919) % 1000;
      return { system, score, tiebreak };
    })
    .sort((a, b) => b.score - a.score || b.tiebreak - a.tiebreak)
    .map((entry) => entry.system);
}

/** CSS de Tailwind v4 del proyecto: tokens del sistema como tema. */
export function themeCss(system: DesignSystem) {
  const t = system.tokens;
  return `@import "tailwindcss";

@theme {
  --font-display: ${system.fonts.displayStack};
  --font-body: ${system.fonts.bodyStack};
  --color-bg: ${t.bg};
  --color-surface: ${t.surface};
  --color-surface-2: ${t.surface2};
  --color-ink: ${t.ink};
  --color-muted: ${t.muted};
  --color-line: ${t.line};
  --color-primary: ${t.primary};
  --color-primary-ink: ${t.primaryInk};
  --color-accent: ${t.accent};
  --color-accent-ink: ${t.accentInk};
  --radius-card: ${system.radius.card};
  --radius-btn: ${system.radius.button};
  --radius-input: ${system.radius.input};
  --shadow-card: ${system.shadow};
}

html {
  scroll-behavior: smooth;
}

body {
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4 {
  font-family: var(--font-display);
}
`;
}

/** Resumen del sistema para el prompt del modelo. */
export function designBrief(system: DesignSystem) {
  return [
    `Sistema de diseño: ${system.name} (${system.id}). ${system.description}`,
    `Tipografías: titulares ${system.fonts.display} (clase font-display), texto ${system.fonts.body} (font-body).`,
    `Modo ${system.dark ? "oscuro" : "claro"}. Clases de color disponibles (tokens): bg-bg, bg-surface, bg-surface-2, text-ink, text-muted, border-line, bg-primary, text-primary, text-primary-ink, bg-accent, text-accent, text-accent-ink (y variantes con opacidad como bg-primary/10).`,
    "Radios: rounded-card (tarjetas), rounded-btn (botones), rounded-input (campos). Sombra: shadow-card.",
    ...system.style,
  ].join("\n");
}
