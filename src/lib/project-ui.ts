import type { Prisma } from "@prisma/client";

import { generateText } from "@/lib/ai/generate";
import { generateAgent, parseAgent, type AgentDocument } from "@/lib/agent-document";
import { getPrisma } from "@/lib/prisma";
import { projectKind, type ProjectKind } from "@/lib/project-kind";
import { ensureProjectRuntime, listProjectRuns, type ProjectRunView } from "@/lib/project-runtime";
import { ensureProjectTables, type ProjectRecord } from "@/lib/project-tables";
import { generateSite, parseSite, type SiteDocument } from "@/lib/site-document";

export type ProjectBlock =
  | { kind: "text"; body: string }
  | { kind: "stats"; items: { label: string; value: string }[] }
  | { kind: "list"; title: string; table: string; items: string[] }
  | { kind: "form"; title: string; table: string; fields: string[]; submit: string };

export type ProjectScreen = {
  name: string;
  headline: string;
  blocks: ProjectBlock[];
};

export type ProjectTableSpec = {
  name: string;
  columns: string[];
};

export type ProjectAgentSpec = {
  name: string;
  instruction: string;
};

export type ProjectFlowSpec = {
  name: string;
  table: string;
  agent: string;
};

export type ProjectInterface = {
  title: string;
  summary: string;
  tables: ProjectTableSpec[];
  agents: ProjectAgentSpec[];
  flows: ProjectFlowSpec[];
  screens: ProjectScreen[];
};

const system = `Eres el diseñador de interfaces de LYRA. A partir de la idea, diseña la interfaz que la persona va a abrir.
Responde solo con JSON válido, en español, sin markdown.
Forma exacta:
{"title":"","summary":"","tables":[{"name":"","columns":["",""]}],"agents":[{"name":"","instruction":""}],"flows":[{"name":"","table":"","agent":""}],"screens":[{"name":"","headline":"","blocks":[]}]}
Cada bloque es uno de estos:
{"kind":"text","body":""}
{"kind":"stats","items":[{"label":"","value":""}]}
{"kind":"list","title":"","table":"","items":["",""]}
{"kind":"form","title":"","table":"","fields":["",""],"submit":""}
Reglas: una o dos tablas con columnas concretas; uno o dos agentes con una instrucción concreta; un flujo por agente que indique la tabla que lo dispara; tres pantallas; cada una con dos o tres bloques; el campo table de cada lista y formulario debe ser el nombre de una tabla; textos y datos de ejemplo concretos para esa idea; sin HTML; sin precios ni integraciones que no hayan pedido.`;

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function clips(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clip(item, maxLength))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function parseBlock(value: unknown): ProjectBlock | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  if (record.kind === "text") {
    const body = clip(record.body, 320);
    return body ? { kind: "text", body } : null;
  }

  if (record.kind === "stats" && Array.isArray(record.items)) {
    const items = record.items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const label = clip(row.label, 32);
        const stat = clip(row.value, 24);
        return label && stat ? { label, value: stat } : null;
      })
      .filter((item): item is { label: string; value: string } => item !== null)
      .slice(0, 4);
    return items.length > 0 ? { kind: "stats", items } : null;
  }

  if (record.kind === "list") {
    const title = clip(record.title, 60);
    const items = clips(record.items, 6, 80);
    return title && items.length > 0
      ? { kind: "list", title, table: clip(record.table, 40), items }
      : null;
  }

  if (record.kind === "form") {
    const title = clip(record.title, 60);
    const fields = clips(record.fields, 5, 40);
    const submit = clip(record.submit, 32) || "Guardar";
    return title && fields.length > 0
      ? { kind: "form", title, table: clip(record.table, 40), fields, submit }
      : null;
  }

  return null;
}

export function parseInterface(raw: unknown): ProjectInterface | null {
  let parsed = raw;
  if (typeof raw === "string") {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const title = clip(record.title, 60);
  const summary = clip(record.summary, 240);
  if (!title || !summary || !Array.isArray(record.screens)) return null;

  const screens = record.screens
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const screen = item as Record<string, unknown>;
      const name = clip(screen.name, 32);
      const headline = clip(screen.headline, 80);
      const blocks = Array.isArray(screen.blocks)
        ? screen.blocks.map(parseBlock).filter((block): block is ProjectBlock => block !== null).slice(0, 3)
        : [];
      if (!name || !headline || blocks.length === 0) return null;
      return { name, headline, blocks };
    })
    .filter((screen): screen is ProjectScreen => screen !== null)
    .slice(0, 4);

  if (screens.length === 0) return null;
  return withRuntime(
    withTables({
      title,
      summary,
      tables: parseTables(record.tables),
      agents: parseAgents(record.agents),
      flows: parseFlows(record.flows),
      screens,
    }),
  );
}

function parseTables(value: unknown): ProjectTableSpec[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tables: ProjectTableSpec[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = clip(record.name, 40);
    const columns = [...new Set(clips(record.columns, 6, 40))];
    if (!name || columns.length === 0 || seen.has(name)) continue;
    seen.add(name);
    tables.push({ name, columns });
    if (tables.length === 3) break;
  }

  return tables;
}

export function withTables(spec: ProjectInterface): ProjectInterface {
  const tables = spec.tables.length > 0 ? spec.tables : tablesFromScreens(spec);
  const known = new Set(tables.map((table) => table.name));
  const first = tables[0]?.name ?? "Registros";

  return {
    ...spec,
    tables,
    screens: spec.screens.map((screen) => ({
      ...screen,
      blocks: screen.blocks.map((block) => {
        if (block.kind !== "form" && block.kind !== "list") return block;
        const tableName = known.has(block.table) ? block.table : first;
        const table = tables.find((item) => item.name === tableName) ?? tables[0];
        if (block.kind === "list" || !table) return { ...block, table: tableName };
        const fields = block.fields.filter((field) => table.columns.includes(field));
        return { ...block, table: table.name, fields: fields.length > 0 ? fields : table.columns };
      }),
    })),
  };
}

function tablesFromScreens(spec: ProjectInterface): ProjectTableSpec[] {
  const forms = spec.screens.flatMap((screen) => screen.blocks.filter((block) => block.kind === "form"));
  if (forms.length === 0) return [{ name: "Registros", columns: ["Nombre", "Detalle"] }];

  const seen = new Set<string>();
  const tables: ProjectTableSpec[] = [];
  for (const form of forms) {
    let name = form.title || "Registros";
    if (seen.has(name)) name = `${name} ${tables.length + 1}`.slice(0, 40);
    seen.add(name);
    tables.push({ name, columns: form.fields });
    if (tables.length === 3) break;
  }
  return tables;
}

function parseAgents(value: unknown): ProjectAgentSpec[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const agents: ProjectAgentSpec[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = clip(record.name, 40);
    const instruction = clip(record.instruction, 240);
    if (!name || !instruction || seen.has(name)) continue;
    seen.add(name);
    agents.push({ name, instruction });
    if (agents.length === 2) break;
  }
  return agents;
}

function parseFlows(value: unknown): ProjectFlowSpec[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const flows: ProjectFlowSpec[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = clip(record.name, 40);
    const table = clip(record.table, 40);
    const agent = clip(record.agent, 40);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    flows.push({ name, table, agent });
    if (flows.length === 2) break;
  }
  return flows;
}

export function withRuntime(spec: ProjectInterface): ProjectInterface {
  const agents =
    spec.agents.length > 0
      ? spec.agents
      : [{ name: "Asistente", instruction: "Cuando llegue un registro, escribe el siguiente paso concreto." }];
  const knownAgents = new Set(agents.map((agent) => agent.name));
  const knownTables = new Set(spec.tables.map((table) => table.name));
  const firstAgent = agents[0].name;
  const firstTable = spec.tables[0]?.name ?? "Registros";
  const source = spec.flows.length > 0 ? spec.flows : [{ name: "Al guardar", table: firstTable, agent: firstAgent }];

  return {
    ...spec,
    agents,
    flows: source.slice(0, 2).map((flow) => ({
      name: flow.name,
      table: knownTables.has(flow.table) ? flow.table : firstTable,
      agent: knownAgents.has(flow.agent) ? flow.agent : firstAgent,
    })),
  };
}

export function draftInterface(idea: string, title: string): ProjectInterface {
  const name = title.length > 48 ? `${title.slice(0, 45).trimEnd()}…` : title;
  return {
    title: name || "Proyecto",
    summary: idea,
    tables: [{ name: "Registros", columns: ["Nombre", "Detalle"] }],
    agents: [
      {
        name: "Asistente",
        instruction: "Cuando llegue un registro, escribe el siguiente paso concreto para esa persona.",
      },
    ],
    flows: [{ name: "Al guardar", table: "Registros", agent: "Asistente" }],
    screens: [
      {
        name: "Inicio",
        headline: name || "Inicio",
        blocks: [
          { kind: "text", body: idea },
          {
            kind: "stats",
            items: [
              { label: "Hoy", value: "0" },
              { label: "En curso", value: "1" },
              { label: "Listos", value: "0" },
            ],
          },
        ],
      },
      {
        name: "Captura",
        headline: "Registra lo primero",
        blocks: [
          {
            kind: "form",
            title: "Nuevo registro",
            table: "Registros",
            fields: ["Nombre", "Detalle"],
            submit: "Agregar",
          },
        ],
      },
      {
        name: "Lista",
        headline: "Lo que ya tienes",
        blocks: [
          {
            kind: "list",
            title: "Pendientes",
            table: "Registros",
            items: ["Definir el primer caso", "Revisar la idea", "Compartir el acceso"],
          },
        ],
      },
    ],
  };
}

export async function generateInterface(idea: string, title: string) {
  try {
    const result = await generateText({ system, user: idea, temperature: 0.4 });
    if (result.mode === "live") {
      const spec = parseInterface(result.text);
      if (spec) return { spec, persisted: true };
    }
  } catch {
    return { spec: draftInterface(idea, title), persisted: false };
  }

  return { spec: draftInterface(idea, title), persisted: false };
}

export async function openProject(userId: string, id: string) {
  if (!process.env.DATABASE_URL) return null;

  const project = await getPrisma().project.findFirst({
    where: { id, userId },
    select: { id: true, title: true, idea: true, ui: true, kind: true, published: true },
  });
  if (!project) return null;

  const kind = projectKind(project.kind);
  if (kind === "site") {
    let site = parseSite(project.ui);
    if (!site) {
      site = await generateSite(project.idea, project.title);
      await getPrisma()
        .project.update({
          where: { id: project.id },
          data: { title: site.title, ui: site as Prisma.InputJsonValue },
        })
        .catch(() => undefined);
    }
    return { kind, published: project.published, site, agent: null, spec: draftInterface(project.idea, project.title), records: [], runs: [] };
  }

  if (kind === "agent") {
    let agent = parseAgent(project.ui);
    if (!agent) {
      agent = await generateAgent(project.idea, project.title);
      await getPrisma()
        .project.update({
          where: { id: project.id },
          data: { title: agent.name, ui: agent as Prisma.InputJsonValue },
        })
        .catch(() => undefined);
    }
    await ensureProjectRuntime(project.id, {
      ...draftInterface(project.idea, agent.name),
      agents: [{ name: agent.name, instruction: agent.instruction }],
      flows: [],
    });
    return { kind, published: false, site: null, agent, spec: draftInterface(project.idea, agent.name), records: [], runs: [] };
  }

  const hadInterface = parseInterface(project.ui);
  let spec = hadInterface;
  let shouldStore = false;
  if (!spec) {
    const generated = await generateInterface(project.idea, project.title);
    spec = generated.spec;
    shouldStore = generated.persisted;
  } else {
    const raw = project.ui as { tables?: unknown; agents?: unknown } | null;
    const storedTables = Array.isArray(raw?.tables) && raw.tables.length > 0;
    const storedAgents = Array.isArray(raw?.agents) && raw.agents.length > 0;
    shouldStore = !storedTables || !storedAgents;
  }

  const ready = Boolean(hadInterface) || shouldStore;
  const records = ready
    ? await ensureProjectTables(project.id, spec.tables)
    : spec.tables.map((table) => ({ name: table.name, columns: table.columns, rows: [] }));
  if (ready) await ensureProjectRuntime(project.id, spec);
  const runs = ready ? await listProjectRuns(project.id) : [];
  if (shouldStore) {
    await getPrisma()
      .project.update({
        where: { id: project.id },
        data: {
          title: spec.title,
          ui: spec as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }

  return { kind: "app" as ProjectKind, published: project.published, site: null, agent: null, spec, records, runs };
}

export type OpenedProject = {
  kind: ProjectKind;
  published: boolean;
  site: SiteDocument | null;
  agent: AgentDocument | null;
  spec: ProjectInterface;
  records: ProjectRecord[];
  runs: ProjectRunView[];
};
