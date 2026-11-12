import type { DesignSystem } from "@/lib/builder/design-systems";
import type { BuildPlan, PlannedSection } from "@/lib/builder/types";

export type RenderCtx = { plan: BuildPlan; system: DesignSystem };

export type SectionTemplate = (section: PlannedSection, ctx: RenderCtx) => string;

const itemKeys = ["text", "icon", "meta", "price", "image"];

/** Listas de tarjetas con la misma forma (si no, el proyecto exportado no pasa `tsc`). */
function uniformItems(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(uniformItems);
    const cards = mapped.length > 0 && mapped.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).title === "string");
    if (!cards) return mapped;
    return mapped.map((entry) => {
      const record = { ...(entry as Record<string, unknown>) };
      for (const key of itemKeys) record[key] ??= "";
      return record;
    });
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, uniformItems(entry)]));
  }
  return value;
}

/** Arma un módulo TSX con `content` embebido y un componente por defecto. */
export function moduleSource(input: { name: string; imports: string; content: unknown; extra?: string; body: string; pre?: string }) {
  // Un enlace opcional en null se tipa explícitamente (si no, TypeScript lo infiere como `null` y el proyecto exportado no compila con tsc).
  let json = JSON.stringify(uniformItems(input.content), null, 2);
  const optionalLinks = /"(cta|secondary)": null/.test(json);
  json = json.replace(/"(cta|secondary)": null/g, '"$1": null as Cta | null');
  return `${input.imports}
${optionalLinks ? "\ntype Cta = { label: string; href: string };\n" : ""}
const content = ${json};
${input.extra ? `\n${input.extra}\n` : ""}
export default function ${input.name}() {
${input.pre ? `${input.pre}\n` : ""}  return (
    ${input.body.trim()}
  );
}
`;
}
