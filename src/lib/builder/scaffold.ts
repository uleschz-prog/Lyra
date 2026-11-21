// Andamiaje determinista del proyecto v2 (Vite + React + Tailwind v4). Estos archivos no los
// escribe el modelo: router, capa de datos, páginas, App y configuración.
import { getDesignSystem, themeCss, type DesignSystem } from "@/lib/builder/design-systems";
import { liveGateSource, liveInputFromPlan, liveSource } from "@/lib/builder/live-runtime";
import type { BuildPlan, Entity, FileTask, PlannedSection, ProjectFiles } from "@/lib/builder/types";

export function projectSlug(title: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "proyecto-lyra";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function chromePath(section: PlannedSection) {
  return `src/components/${section.name}.tsx`;
}

export function sectionPath(section: PlannedSection) {
  return `src/sections/${section.name}.tsx`;
}

/** Archivos que escribe el modelo (uno por sección y por pieza del marco). */
export function fileTasks(plan: BuildPlan): FileTask[] {
  const tasks: FileTask[] = plan.chrome.map((section, chrome) => ({ path: chromePath(section), ref: { chrome }, state: "pending", attempts: 0 }));
  plan.pages.forEach((page, pageIndex) =>
    page.sections.forEach((section, sectionIndex) => {
      tasks.push({ path: sectionPath(section), ref: { page: pageIndex, section: sectionIndex }, state: "pending", attempts: 0 });
    }),
  );
  return tasks;
}

export function sectionForTask(plan: BuildPlan, task: FileTask): PlannedSection {
  return "chrome" in task.ref ? plan.chrome[task.ref.chrome] : plan.pages[task.ref.page].sections[task.ref.section];
}

/** Rutas generadas por el andamiaje (confiables: no pasan por el filtro de patrones prohibidos). */
export const scaffoldPaths = new Set([
  "package.json",
  "vite.config.ts",
  "tsconfig.json",
  "index.html",
  "README.md",
  "src/main.tsx",
  "src/index.css",
  "src/App.tsx",
  "src/lib/router.tsx",
  "src/lib/data.ts",
  "src/lib/live.ts",
  "src/components/LiveGate.tsx",
  "lyra.app.json",
  "src/lib/format.ts",
  "src/lib/leads.ts",
  "src/data/stores.ts",
  "src/components/SectionBoundary.tsx",
]);

export function isScaffoldPath(path: string) {
  return scaffoldPaths.has(path) || path.startsWith("src/pages/");
}

const routerSource = `// Router mínimo por hash: funciona en cualquier hosting estático y dentro de la vista previa aislada.
import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

function currentPath() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash.startsWith("/") ? hash.split("?")[0] || "/" : "/";
}

const RouteContext = createContext({ path: "/" });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => {
      const next = currentPath();
      setPath((previous) => {
        if (previous !== next) window.scrollTo({ top: 0 });
        return next;
      });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return <RouteContext.Provider value={{ path }}>{children}</RouteContext.Provider>;
}

export function useRoute() {
  return useContext(RouteContext);
}

export function navigate(to: string) {
  window.location.hash = to;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string; onNavigate?: () => void };

/** Rutas internas («/servicios»), anclas de sección («#contacto») o enlaces externos. */
export function Link({ to, onNavigate, onClick, children, ...rest }: LinkProps) {
  const anchor = to.startsWith("#");
  const internal = to.startsWith("/");
  function handle(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (anchor) {
      event.preventDefault();
      document.getElementById(to.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    onNavigate?.();
  }
  return (
    <a href={internal ? "#" + to : to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
`;

/** Entrega 3: contactos. Solo llegan a LYRA cuando el sitio está publicado en LYRA (/s/…). */
export const leadsHelperSource = `// Envía los datos de un formulario a la bandeja de Contactos de LYRA.
// Solo funciona cuando el sitio está publicado en LYRA (/s/…): ahí LYRA agrega el receptor.
// En la vista previa o en otro hosting no hace nada; muestra tu confirmación de todos modos.
// LYRA también recibe los formularios que no usan esta función, así que es opcional.
export function sendLead(fields: Record<string, string | number | boolean>) {
  document.dispatchEvent(new CustomEvent("lyra:lead", { detail: fields }));
}
`;

const dataSource = (slug: string) => `// Capa de datos de la app. Las pantallas solo usan DataStore y useCollection.
// - Vista previa u otro hosting: guarda en este navegador (localStorage, o memoria si no hay acceso).
// - Publicada en LYRA con datos en vivo: cada cambio se guarda en LYRA y se sincroniza entre
//   dispositivos y sucursales (ver ./live.ts). Las pantallas no cambian.
import { useMemo, useSyncExternalStore } from "react";

import { getLive, isLive, liveRows, liveWrite, newId, subscribeRows, useLive, writeBranch } from "./live";

export { transact, useLive } from "./live";

export type FieldType = "text" | "longtext" | "number" | "money" | "date" | "time" | "email" | "phone" | "select" | "boolean" | "ref" | "items";
export type Field = { key: string; label: string; type: FieldType; options?: string[]; required?: boolean; ref?: string; fields?: Field[] };
export type EntitySchema = { key: string; label: string; singular: string; icon: string; fields: Field[]; scope?: "branch" | "shared" };
export type Row = { id: string; createdAt: string; updatedAt: string; branchId?: string | null; [key: string]: unknown };

export interface DataStore {
  readonly key: string;
  readonly scope: "branch" | "shared";
  list(): Row[];
  get(id: string): Row | undefined;
  /** Crea un registro. Puedes pasar id propio (letras, números, - y _) y, si eres administración, branchId. */
  create(values: Record<string, unknown>): Row;
  update(id: string, values: Record<string, unknown>): Row | undefined;
  /** Suma (o resta) a un campo numérico sin pisar lo que otros dispositivos sumaron. */
  inc(id: string, field: string, by: number): void;
  remove(id: string): void;
  subscribe(listener: () => void): () => void;
}

const memory = new Map<string, string>();
const prefix = ${JSON.stringify(`lyra:${slug}:`)};

function load(key: string) {
  try {
    return window.localStorage.getItem(prefix + key);
  } catch {
    return memory.get(prefix + key) ?? null;
  }
}

function save(key: string, value: string) {
  try {
    window.localStorage.setItem(prefix + key, value);
  } catch {
    memory.set(prefix + key, value);
  }
}

const idPattern = /^[A-Za-z0-9_-]{2,64}$/;

/** Sucursal de un registro nuevo: administración (o la vista previa) puede indicar branchId. */
function branchFor(values: Record<string, unknown>) {
  const live = getLive();
  const chosen = typeof values.branchId === "string" && live.branches.some((item) => item.id === values.branchId) ? values.branchId : null;
  return chosen && (live.member?.role === "admin" || live.status === "local") ? chosen : writeBranch();
}

function rowId(values: Record<string, unknown>) {
  return typeof values.id === "string" && idPattern.test(values.id) ? values.id : newId();
}

function withoutMeta(values: Record<string, unknown>) {
  const copy = { ...values };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.branchId;
  return copy;
}

export function createLocalStore(collection: string, seed: Record<string, unknown>[], scope: "branch" | "shared" = "shared"): DataStore {
  let rows: Row[] | null = null;
  const listeners = new Set<() => void>();
  const read = () => {
    if (rows) return rows;
    const raw = load(collection);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) rows = parsed as Row[];
      } catch {
        rows = null;
      }
    }
    if (!rows) {
      const now = new Date().toISOString();
      rows = seed.map((values, index) => ({
        ...withoutMeta(values),
        id: typeof values.id === "string" ? values.id : collection + "-s" + index,
        branchId: scope === "branch" ? (typeof values.branchId === "string" ? values.branchId : writeBranch()) : null,
        createdAt: now,
        updatedAt: now,
      }));
    }
    return rows;
  };
  const write = (next: Row[]) => {
    rows = next;
    save(collection, JSON.stringify(next));
    listeners.forEach((listener) => listener());
  };
  const store: DataStore = {
    key: collection,
    scope,
    list: read,
    get: (id) => read().find((row) => row.id === id),
    create(values) {
      const now = new Date().toISOString();
      const row: Row = { ...withoutMeta(values), id: rowId(values), branchId: scope === "branch" ? branchFor(values) : null, createdAt: now, updatedAt: now };
      write([row, ...read()]);
      return row;
    },
    update(id, values) {
      let updated: Row | undefined;
      write(read().map((row) => (row.id === id ? (updated = { ...row, ...withoutMeta(values), id, updatedAt: new Date().toISOString() }) : row)));
      return updated;
    },
    inc(id, field, by) {
      const row = store.get(id);
      if (row) store.update(id, { [field]: (Number(row[field]) || 0) + by });
    },
    remove(id) {
      write(read().filter((row) => row.id !== id));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}

/** Colección guardada en LYRA (datos en vivo). Escribe al instante en pantalla y sincroniza. */
export function createRemoteStore(collection: string, scope: "branch" | "shared" = "shared"): DataStore {
  const store: DataStore = {
    key: collection,
    scope,
    list: () => liveRows(collection) as Row[],
    get: (id) => liveRows(collection).find((row) => row.id === id) as Row | undefined,
    create(values) {
      const id = rowId(values);
      const branch = scope === "branch" ? branchFor(values) : null;
      liveWrite({ op: "create", c: collection, id, data: withoutMeta(values), branch });
      return (store.get(id) ?? { ...values, id, branchId: branch, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as Row;
    },
    update(id, values) {
      liveWrite({ op: "update", c: collection, id, data: withoutMeta(values) });
      return store.get(id);
    },
    inc(id, field, by) {
      liveWrite({ op: "inc", c: collection, id, field, by });
    },
    remove(id) {
      liveWrite({ op: "delete", c: collection, id });
    },
    subscribe: (listener) => subscribeRows(collection, listener),
  };
  return store;
}

/** En vivo cuando LYRA lo activa; si no, local con los datos de ejemplo. */
export function createCollection(collection: string, seed: Record<string, unknown>[], scope: "branch" | "shared" = "shared"): DataStore {
  return isLive ? createRemoteStore(collection, scope) : createLocalStore(collection, seed, scope);
}

/**
 * Lista reactiva de una colección. En colecciones por sucursal muestra solo la sucursal en
 * pantalla (administración puede elegir «todas»); con { allBranches: true } trae todas.
 */
export function useCollection(store: DataStore, options: { allBranches?: boolean } = {}): Row[] {
  const rows = useSyncExternalStore(store.subscribe, store.list, store.list);
  const { branch } = useLive();
  return useMemo(
    () => (store.scope === "branch" && branch && !options.allBranches ? rows.filter((row) => row.branchId === branch) : rows),
    [rows, branch, store.scope, options.allBranches],
  );
}

export function readSettings(): Record<string, string> {
  try {
    return JSON.parse(load("ajustes") ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function writeSettings(values: Record<string, string>) {
  save("ajustes", JSON.stringify(values));
}
`;

const formatSource = `import type { EntitySchema, Field } from "./data";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatMoney(value: number) {
  return money.format(value);
}

export function formatValue(field: Field, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "money") return formatMoney(Number(value) || 0);
  if (field.type === "boolean") return value ? "Sí" : "No";
  if (field.type === "date") {
    const date = new Date(String(value).slice(0, 10) + "T12:00:00");
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  }
  return String(value);
}

export function inputType(field: Field) {
  if (field.type === "number" || field.type === "money") return "number";
  if (field.type === "date" || field.type === "time" || field.type === "email") return field.type;
  if (field.type === "phone") return "tel";
  return "text";
}

/** Campo que sirve de título de un registro. */
export function primaryField(entity: EntitySchema): Field {
  return entity.fields.find((field) => field.type === "text") ?? entity.fields[0];
}
`;

const boundarySource = `import { Component, type ReactNode } from "react";

/** Si una sección falla al pintarse, el resto de la página sigue funcionando. */
export default class SectionBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Sección con error:", this.props.name, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
`;

function entityScope(plan: BuildPlan, entity: Entity): "branch" | "shared" {
  return plan.live && entity.scope === "branch" ? "branch" : "shared";
}

/** Manifiesto de datos en vivo (lyra.app.json): LYRA lo usa para crear la base de la app. */
export function liveManifest(plan: BuildPlan) {
  if (!plan.live) return null;
  return {
    version: 1,
    title: plan.title,
    roles: liveInputFromPlan(plan).roles,
    branches: plan.live.branches,
    collections: plan.entities.map((entity) => ({
      key: entity.key,
      label: entity.label,
      singular: entity.singular,
      icon: entity.icon,
      fields: entity.fields,
      scope: entityScope(plan, entity),
      sync: entity.sync === "recent" ? "recent" : "all",
      ...(entity.write?.length ? { write: entity.write } : {}),
      ...(entity.read?.length ? { read: entity.read } : {}),
      seed: entity.seed,
    })),
  };
}

function storesSource(plan: BuildPlan) {
  const schema = Object.fromEntries(plan.entities.map((entity) => [entity.key, { key: entity.key, label: entity.label, singular: entity.singular, icon: entity.icon, fields: entity.fields, scope: entityScope(plan, entity) }]));
  const lines = plan.entities.map((entity) => `  ${entity.key}: createCollection(${JSON.stringify(entity.key)}, ${JSON.stringify(entity.seed)}, ${JSON.stringify(entityScope(plan, entity))}),`);
  return `// Esquema y colecciones de la app (generado por LYRA a partir del plan).
import { createCollection, type DataStore, type EntitySchema } from "../lib/data";

export type { Row } from "../lib/data";

export const schema: Record<string, EntitySchema> = ${JSON.stringify(schema, null, 2)};

export const stores: Record<string, DataStore> = {
${lines.join("\n")}
};
`;
}

function pageSource(plan: BuildPlan, pageIndex: number) {
  const page = plan.pages[pageIndex];
  const imports = page.sections.map((section) => `import ${section.name} from "../sections/${section.name}";`).join("\n");
  const body = page.sections.map((section) => `      <SectionBoundary name="${section.name}"><${section.name} /></SectionBoundary>`).join("\n");
  return `import SectionBoundary from "../components/SectionBoundary";
${imports}

export default function ${page.name}() {
  return (
    <${plan.kind === "app" ? 'div className="space-y-8"' : ""}>
${body}
    </${plan.kind === "app" ? "div" : ""}>
  );
}
`;
}

function appSource(plan: BuildPlan) {
  const pageImports = plan.pages.map((page) => `import ${page.name} from "./pages/${page.name}";`).join("\n");
  const routes = plan.pages.map((page) => `  ${JSON.stringify(page.path)}: ${page.name},`).join("\n");
  const chromeImports = plan.chrome.map((section) => `import ${section.name} from "./components/${section.name}";`).join("\n");
  const shell = plan.chrome.find((section) => section.name === "Shell");
  const layout = shell
    ? `<RouterProvider>
      <Shell>
        <Current />
      </Shell>
    </RouterProvider>`
    : `<RouterProvider>
      <Nav />
      <main>
        <Current />
      </main>
      <Footer />
    </RouterProvider>`;
  const gate = plan.kind === "app" && plan.live;
  return `import type { ComponentType } from "react";

${gate ? 'import LiveGate from "./components/LiveGate";\n' : ""}import { RouterProvider, useRoute } from "./lib/router";
${chromeImports}
${pageImports}

const routes: Record<string, ComponentType> = {
${routes}
};

function Current() {
  const { path } = useRoute();
  const Page = routes[path] ?? routes["/"];
  return <Page />;
}

export default function App() {
  return (
    ${gate ? `<LiveGate>\n    ${layout}\n    </LiveGate>` : layout}
  );
}
`;
}

export function headHtml(plan: BuildPlan, system: DesignSystem) {
  return `<meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(plan.title)}</title>
    <meta name="description" content="${escapeHtml(plan.summary.slice(0, 160))}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${escapeHtml(system.fonts.href)}" />`;
}

function readme(plan: BuildPlan, system: DesignSystem) {
  const pages = plan.pages.map((page) => `- \`${page.path}\` · ${page.title}`).join("\n");
  const app = plan.kind === "app";
  return `# ${plan.title}

${plan.summary}

Proyecto generado por Vega en LYRA (generador v2) con React 19, Vite y Tailwind CSS v4.
Sistema de diseño: **${system.name}** (tipografías ${system.fonts.display} y ${system.fonts.body}).

## Páginas

${pages}

## Correr en tu computadora

\`\`\`bash
npm install
npm run dev     # http://localhost:5173
npm run build   # genera dist/ para cualquier hosting estático
\`\`\`

## Qué es real y qué es de ejemplo

${
  app
    ? plan.live
      ? "- Datos en vivo: publicada en LYRA (/s/…) y con «Datos en vivo» activado en Proyectos, cada persona entra con su PIN y los datos se guardan en LYRA y se sincronizan entre dispositivos y sucursales cada pocos segundos. Las sucursales, el equipo y los PIN se administran en Proyectos.\n- En la vista previa y en otro hosting la app usa datos de ejemplo en este navegador.\n- El esquema de datos está en `lyra.app.json`; las pantallas solo usan `src/lib/data.ts` (DataStore y useCollection).\n- Al recargar la página se vuelve a pedir el PIN."
      : "- Las pantallas guardan los datos en el navegador de quien usa la app (localStorage); cada dispositivo tiene su propia copia. En la dirección pública de LYRA (/s/…) la página corre aislada y los datos duran mientras la pestaña esté abierta.\n- Toda la lectura y escritura pasa por `src/lib/data.ts` (interfaz `DataStore`). Para guardar en una base de datos compartida, pídele a Vega la versión con datos en vivo.\n- Los registros iniciales son de ejemplo."
    : "- Si publicas el sitio desde LYRA (dirección /s/…), lo que la gente escribe en los formularios llega a la bandeja de Contactos del proyecto. En la vista previa o en otro hosting, los formularios solo muestran una confirmación y, si diste WhatsApp, abren el mensaje listo; no envían correos.\n- Textos e información salen de tu descripción; revisa precios, horarios y datos de contacto antes de publicar."
}
${plan.assumptions.length ? `\n## Suposiciones\n\n${plan.assumptions.map((item) => `- ${item}`).join("\n")}\n` : ""}`;
}

/** Archivos del andamiaje para un plan. */
export function scaffoldFiles(plan: BuildPlan): ProjectFiles {
  const system = getDesignSystem(plan.designSystem);
  if (!system) throw new Error("Sistema de diseño desconocido.");
  const slug = projectSlug(plan.title);
  const files: ProjectFiles = {
    "package.json": JSON.stringify(
      {
        name: slug,
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { "lucide-react": "^1.47.0", react: "^19.2.0", "react-dom": "^19.2.0" },
        devDependencies: {
          "@tailwindcss/vite": "^4.1.0",
          "@types/react": "^19.2.0",
          "@types/react-dom": "^19.2.0",
          "@vitejs/plugin-react": "^4.7.0",
          tailwindcss: "^4.1.0",
          typescript: "^5.6.0",
          vite: "^6.4.0",
        },
      },
      null,
      2,
    ) + "\n",
    "vite.config.ts": `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`,
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          allowImportingTsExtensions: false,
        },
        include: ["src"],
      },
      null,
      2,
    ) + "\n",
    "index.html": `<!doctype html>
<html lang="es-MX">
  <head>
    ${headHtml(plan, system)}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "README.md": readme(plan, system),
    "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    "src/index.css": themeCss(system),
    "src/App.tsx": appSource(plan),
    "src/lib/router.tsx": routerSource,
    "src/components/SectionBoundary.tsx": boundarySource,
  };
  if (plan.kind === "sitio") files["src/lib/leads.ts"] = leadsHelperSource;
  if (plan.kind === "app") {
    files["src/lib/data.ts"] = dataSource(slug);
    files["src/lib/live.ts"] = liveSource(liveInputFromPlan(plan));
    if (plan.live) {
      files["src/components/LiveGate.tsx"] = liveGateSource;
      files["lyra.app.json"] = JSON.stringify(liveManifest(plan), null, 2) + "\n";
    }
    files["src/lib/format.ts"] = formatSource;
    files["src/data/stores.ts"] = storesSource(plan);
  }
  plan.pages.forEach((page, index) => {
    files[`src/pages/${page.name}.tsx`] = pageSource(plan, index);
  });
  return files;
}
