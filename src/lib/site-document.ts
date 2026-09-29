import { generateText } from "@/lib/ai/generate";

export type SiteSection = {
  heading: string;
  body: string;
};

export type SiteDocument = {
  title: string;
  headline: string;
  subhead: string;
  sections: SiteSection[];
  action: string;
};

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function draftSite(idea: string, title: string): SiteDocument {
  const name = title.length > 48 ? `${title.slice(0, 45).trimEnd()}…` : title;
  return {
    title: name || "Sitio",
    headline: name || "Tu sitio",
    subhead: idea,
    sections: [
      {
        heading: "Qué resuelve",
        body: "Una página clara para que quien llega entienda la oferta y dé el siguiente paso.",
      },
      {
        heading: "Cómo funciona",
        body: "Presenta el servicio, muestra un ejemplo concreto y deja un camino para escribir o reservar.",
      },
      {
        heading: "El siguiente paso",
        body: "Un llamado visible, con una sola acción, para no perder a quien ya está interesado.",
      },
    ],
    action: "Quiero empezar",
  };
}

export function parseSite(raw: unknown): SiteDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const title = clip(record.title, 80);
  const headline = clip(record.headline, 120);
  const subhead = clip(record.subhead, 240);
  const action = clip(record.action, 40);
  const sections = Array.isArray(record.sections)
    ? record.sections
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const section = item as Record<string, unknown>;
          const heading = clip(section.heading, 80);
          const body = clip(section.body, 320);
          if (!heading || !body) return null;
          return { heading, body };
        })
        .filter((section): section is SiteSection => section !== null)
        .slice(0, 4)
    : [];

  if (!title || !headline || sections.length === 0) return null;
  return {
    title,
    headline,
    subhead: subhead || headline,
    sections,
    action: action || "Contactar",
  };
}

function parseModelSite(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return parseSite(JSON.parse(candidate.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export async function generateSite(idea: string, title: string) {
  try {
    const result = await generateText({
      temperature: 0.4,
      system: `Diseña un sitio de una página para LYRA. Responde solo JSON válido, en español, sin markdown.
{"title":"","headline":"","subhead":"","action":"","sections":[{"heading":"","body":""}]}
Tres secciones. Textos concretos para esa idea. Sin precios ni promesas que no hayan pedido.`,
      user: idea,
    });
    if (result.mode === "live") {
      const site = parseModelSite(result.text);
      if (site) return site;
    }
  } catch {
    return draftSite(idea, title);
  }
  return draftSite(idea, title);
}
