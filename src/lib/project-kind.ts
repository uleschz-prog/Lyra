export const projectKinds = ["app", "site", "agent"] as const;

export type ProjectKind = (typeof projectKinds)[number];

export const projectKindLabel: Record<ProjectKind, string> = {
  app: "App",
  site: "Sitio",
  agent: "Agente",
};

export function projectKind(value: string | null | undefined): ProjectKind {
  if (value === "site" || value === "sitio") return "site";
  if (value === "agent" || value === "agente") return "agent";
  return "app";
}

export function inferProjectKind(idea: string, hinted?: string | null): ProjectKind {
  const hint = hinted?.trim().toLowerCase();
  if (hint === "site" || hint === "sitio" || hint === "agent" || hint === "agente" || hint === "app") {
    return projectKind(hint);
  }

  const text = idea.toLowerCase();
  if (/\bagente\b|\basistente\b/.test(text)) return "agent";
  if (/\bsitio\b|\bp[aá]gina\b|\bweb\b|landing/.test(text)) return "site";
  return "app";
}
