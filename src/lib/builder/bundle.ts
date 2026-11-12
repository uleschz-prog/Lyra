// Compilación del proyecto v2 en el servidor: esbuild (validación de sintaxis/imports y bundle)
// y Tailwind v4 (CSS solo con las clases usadas). Produce un HTML único para la vista previa.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { allowedPackages } from "@/lib/builder/checks";
import { getDesignSystem } from "@/lib/builder/design-systems";
import { headHtml } from "@/lib/builder/scaffold";
import type { BuildPlan, ProjectFiles } from "@/lib/builder/types";

/** Carpeta con node_modules (en Vercel, /var/task). */
export function builderRoot(env: Record<string, string | undefined> = process.env) {
  return env.LYRA_BUILDER_ROOT?.trim() || process.cwd();
}

export type CompileIssue = { path: string | null; message: string };
export type CompileResult = { ok: true; js: string; css: string; ms: number } | { ok: false; issues: CompileIssue[]; ms: number };

const extensions = ["", ".tsx", ".ts", ".jsx", ".js"];

function resolveRelative(files: ProjectFiles, importer: string, spec: string) {
  const base = path.posix.join(path.posix.dirname(importer), spec);
  for (const extension of extensions) if (files[base + extension] !== undefined) return base + extension;
  for (const extension of extensions.slice(1)) if (files[`${base}/index${extension}`] !== undefined) return `${base}/index${extension}`;
  return null;
}

function loaderFor(file: string) {
  if (file.endsWith(".tsx")) return "tsx" as const;
  if (file.endsWith(".ts")) return "ts" as const;
  if (file.endsWith(".jsx")) return "jsx" as const;
  return "js" as const;
}

type EsbuildMessage = { text: string; location?: { file?: string; line?: number; column?: number; lineText?: string } | null };

function toIssue(message: EsbuildMessage): CompileIssue {
  const file = message.location?.file?.replace(/^lyra:/, "") ?? null;
  const where = message.location?.line ? ` (línea ${message.location.line}${message.location.lineText ? `: ${message.location.lineText.trim().slice(0, 140)}` : ""})` : "";
  return { path: file && !file.includes("node_modules") ? file : null, message: `${message.text}${where}` };
}

/** Bundle de la app con esbuild sobre los archivos en memoria. */
export async function bundleProject(files: ProjectFiles, options: { minify?: boolean; root?: string } = {}): Promise<CompileResult> {
  const started = Date.now();
  const root = options.root ?? builderRoot();
  const { build } = await import("esbuild");
  try {
    const result = await build({
      entryPoints: ["src/main.tsx"],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: ["es2020"],
      jsx: "automatic",
      minify: options.minify ?? true,
      legalComments: "none",
      logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
      absWorkingDir: root,
      nodePaths: [path.join(root, "node_modules")],
      plugins: [
        {
          name: "lyra-virtual-files",
          setup(context) {
            context.onResolve({ filter: /.*/ }, (args) => {
              if (args.kind === "entry-point") return { path: "src/main.tsx", namespace: "lyra" };
              if (args.namespace !== "lyra") return undefined;
              if (args.path.endsWith(".css")) return { path: args.path, namespace: "lyra-css" };
              if (args.path.startsWith(".")) {
                const resolved = resolveRelative(files, args.importer, args.path);
                return resolved
                  ? { path: resolved, namespace: "lyra" }
                  : { errors: [{ text: `No existe el archivo importado "${args.path}" desde ${args.importer}.` }] };
              }
              if (!allowedPackages.has(args.path)) return { errors: [{ text: `Import no permitido: "${args.path}".` }] };
              return undefined;
            });
            context.onLoad({ filter: /.*/, namespace: "lyra" }, (args) => ({
              contents: files[args.path] ?? "",
              loader: loaderFor(args.path),
              resolveDir: root,
            }));
            context.onLoad({ filter: /.*/, namespace: "lyra-css" }, () => ({ contents: "", loader: "js" }));
          },
        },
      ],
    });
    const js = result.outputFiles?.[0]?.text ?? "";
    return { ok: true, js, css: "", ms: Date.now() - started };
  } catch (error) {
    const failure = error as { errors?: EsbuildMessage[]; message?: string };
    const issues = (failure.errors ?? []).slice(0, 30).map(toIssue);
    return { ok: false, issues: issues.length ? issues : [{ path: null, message: failure.message ?? "No se pudo compilar." }], ms: Date.now() - started };
  }
}

/** Posibles clases de Tailwind en el código (Tailwind ignora las que no existen). */
export function tailwindCandidates(files: ProjectFiles) {
  const candidates = new Set<string>();
  for (const [file, source] of Object.entries(files)) {
    if (!/\.(tsx|ts|jsx|js|html)$/.test(file)) continue;
    for (const token of source.split(/[\s"'`{}();<>,=]+/)) {
      if (token.length > 1 && token.length < 160 && /[a-z]/.test(token)) candidates.add(token.replace(/^[:.]+|[:.]+$/g, ""));
    }
  }
  return [...candidates];
}

let tailwindIndex: Promise<string> | null = null;

export async function compileTailwind(files: ProjectFiles, options: { root?: string } = {}) {
  const root = options.root ?? builderRoot();
  const { compile } = await import("tailwindcss");
  const indexPath = path.join(root, "node_modules", "tailwindcss", "index.css");
  tailwindIndex ??= readFile(indexPath, "utf8");
  const content = await tailwindIndex.catch((error: unknown) => {
    tailwindIndex = null;
    throw error;
  });
  const compiler = await compile(files["src/index.css"] ?? '@import "tailwindcss";', {
    base: root,
    loadStylesheet: async (id: string, base: string) => {
      if (id !== "tailwindcss") throw new Error(`Hoja de estilo no permitida: ${id}`);
      return { path: indexPath, base, content };
    },
  });
  return compiler.build(tailwindCandidates(files));
}

function inlineScript(js: string) {
  return js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

function inlineStyle(css: string) {
  return css.replace(/<\/style/gi, "<\\/style");
}

/** HTML autocontenido de la vista previa (bundle + CSS en línea). */
export async function buildPreviewHtml(plan: BuildPlan, files: ProjectFiles, options: { root?: string } = {}): Promise<CompileResult & { html?: string }> {
  const bundled = await bundleProject(files, options);
  if (!bundled.ok) return bundled;
  const css = await compileTailwind(files, options);
  const system = getDesignSystem(plan.designSystem);
  if (!system) return { ok: false, issues: [{ path: null, message: "Sistema de diseño desconocido." }], ms: bundled.ms };
  const html = `<!doctype html>
<html lang="es-MX">
  <head>
    ${headHtml(plan, system)}
    <style>${inlineStyle(css)}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${inlineScript(bundled.js)}</script>
  </body>
</html>
`;
  return { ...bundled, css, html };
}
