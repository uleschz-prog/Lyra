import { describe, expect, it, vi } from "vitest";

import { checkEditedCss, editableFiles, isEditableProject } from "@/lib/builder/edit";
import { advanceBuild, startProjectEdit, type BaseVersion, type BuilderDb, type RunnerDeps } from "@/lib/builder/runner";
import type { BuilderModel } from "@/lib/builder/model";
import taqueria from "@/lib/marketplace/official/oficial-restaurante-taqueria.json";
import { restoreProjectVersion } from "@/lib/projects/restore";
import type { ProjectDb } from "@/lib/projects/store";
import { table } from "../vega/fake-prisma";

const now = () => new Date("2026-11-01T00:10:00Z");
const user = { id: "u1", package: null, role: null };
const baseFiles = (taqueria as { files: { path: string; content: string }[] }).files;
const target = "src/sections/ListaDePrecios.tsx";
const usage = { provider: "gemini" as const, model: "gemini-2.5-flash", inputTokens: 1000, outputTokens: 800, reportedCostUsd: null };

/** Modelo falso: elige ListaDePrecios y cambia un texto; `broken` devuelve código que no compila. */
function editModel(options: { broken?: boolean; refuse?: boolean } = {}) {
  const calls: string[] = [];
  const model = (async (input) => {
    calls.push(input.purpose);
    if (input.purpose === "plan") {
      if (options.refuse) return { ok: true as const, text: JSON.stringify({ archivos: [], no_se_puede: "Eso necesita una base de datos." }), usage };
      return { ok: true as const, text: JSON.stringify({ archivos: [target, "src/no-existe.tsx"], resumen: "Agregar la nota de precios con IVA" }), usage };
    }
    const code = input.user.split("Código actual:\n```tsx\n")[1]?.replace(/```\s*$/, "") ?? "";
    if (options.broken) return { ok: true as const, text: "```tsx\nexport default function ListaDePrecios() { return <div>{</div>; }\n```", usage };
    return { ok: true as const, text: "```tsx\n" + code.replace(/<\/section>\s*\);\s*}\s*$/, '<p className="text-muted">Precios con IVA incluido.</p></section>);}\n') + "```", usage };
  }) as BuilderModel;
  return { model, calls };
}

function setup(options: { broken?: boolean; refuse?: boolean; files?: { path: string; content: string }[]; balance?: number } = {}) {
  const projectBuild = table(
    () => ({ conversationId: null, status: "queued", step: "plan", plan: null, files: null, tasks: null, report: null, repairRound: 0, failures: 0, chargeId: null, refunded: false, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, models: [], projectId: null, versionNumber: null, error: null, lockedUntil: null, mode: "new" }),
    { unique: ["actionId"] },
  );
  const project = table(() => ({ deletedAt: null, versionCount: 0 }));
  const projectVersion = table(() => ({ generator: "vega-v1" }), { unique: ["sourceActionId"] });
  const vegaAction = table();
  const db = { projectBuild, project, projectVersion, vegaAction } as unknown as BuilderDb;
  let balance = options.balance ?? 50;
  const charges: { key: string; amount: number }[] = [];
  const charge = vi.fn(async (_userId: string, amount: number, _description: string, key: string) => {
    if (charges.some((item) => item.key === key)) return { ok: true as const, chargeId: `tx-${key}`, duplicate: true };
    if (amount > balance) return { ok: false as const, error: "Sin créditos suficientes" };
    balance -= amount;
    charges.push({ key, amount });
    return { ok: true as const, chargeId: `tx-${key}`, duplicate: false };
  });
  const refund = vi.fn(async () => {
    balance += 2;
  });
  const files = options.files ?? baseFiles;
  const load = vi.fn(async (userId: string, projectId: string): Promise<BaseVersion | null> =>
    userId === "u1" && projectId === "proj1" ? { projectId: "proj1", kind: "sitio", title: "El Fogón de Doña Mari", summary: "Taquería", number: 1, generator: "vega-v2", files } : null,
  );
  const { model, calls } = editModel(options);
  const deps: RunnerDeps = { db, now, model, charge, refund, record: vi.fn(async () => null), load, env: {} };
  return { db, tables: { projectBuild, project, projectVersion, vegaAction }, deps, charge, refund, calls, balance: () => balance };
}

async function seedProject(tables: ReturnType<typeof setup>["tables"]) {
  await tables.project.create({ data: { id: "proj1", userId: "u1", kind: "sitio", title: "El Fogón de Doña Mari", summary: "Taquería", groupKey: "marketplace:x", versionCount: 1 } });
  await tables.projectVersion.create({ data: { projectId: "proj1", number: 1, title: "El Fogón de Doña Mari", summary: "Taquería", files: baseFiles, generator: "vega-v2", sourceActionId: "marketplace:x", sizeBytes: 1000 } });
  return tables.vegaAction.create({ data: { userId: "u1", conversationId: "c1", kind: "deliver_project", payload: { kind: "sitio", title: "El Fogón de Doña Mari", files: [], edit: { projectId: "proj1" } }, status: "running", result: "" } });
}

describe("Editar en el lugar (Entrega 4)", () => {
  it("reconoce proyectos v2 y sus archivos editables", () => {
    const map = Object.fromEntries(baseFiles.map((file) => [file.path, file.content]));
    expect(isEditableProject(map)).toBe(true);
    expect(isEditableProject({ "index.html": "<html></html>" })).toBe(false);
    const editable = editableFiles(map);
    expect(editable).toContain(target);
    expect(editable).toContain("src/index.css");
    expect(editable).not.toContain("src/components/SectionBoundary.tsx");
    expect(editable).not.toContain("src/main.tsx");
  });

  it("el catálogo muestra textos visibles y no clases de Tailwind", async () => {
    const { visibleText } = await import("@/lib/builder/edit");
    const text = visibleText('<h2 className="font-display text-3xl sm:text-4xl">Nuestros precios</h2><p>pide por whatsapp</p>');
    expect(text).toContain("Nuestros precios");
    expect(text).toContain("pide por whatsapp");
    expect(text).not.toContain("font-display");
  });

  it("cobra 2 créditos una sola vez por edición", async () => {
    const { deps, tables, charge } = setup();
    const action = await seedProject(tables);
    const first = await startProjectEdit({ user, conversationId: "c1", actionId: action.id as string, projectId: "proj1", request: "Agrega que los precios incluyen IVA" }, deps);
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(charge).toHaveBeenCalledWith("u1", 2, expect.stringContaining("cambios"), `builder:${action.id}`);
    const again = await startProjectEdit({ user, conversationId: "c1", actionId: action.id as string, projectId: "proj1", request: "Agrega que los precios incluyen IVA" }, deps);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(charge).toHaveBeenCalledTimes(1);
    expect(tables.projectBuild.rows[0]).toMatchObject({ mode: "edit", credits: 2, kind: "sitio" });
  });

  it("no cobra si el proyecto no existe, es de la versión básica o faltan créditos", async () => {
    const missing = setup();
    expect(await startProjectEdit({ user, conversationId: null, actionId: "a1", projectId: "otro", request: "Cambia el color" }, missing.deps)).toMatchObject({ ok: false, reason: "project" });
    const legacy = setup({ files: [{ path: "index.html", content: "<html></html>" }, { path: "LEEME.txt", content: "v1" }] });
    expect(await startProjectEdit({ user, conversationId: null, actionId: "a2", projectId: "proj1", request: "Cambia el color" }, legacy.deps)).toMatchObject({ ok: false, reason: "legacy" });
    const poor = setup({ balance: 1 });
    expect(await startProjectEdit({ user, conversationId: null, actionId: "a3", projectId: "proj1", request: "Cambia el color" }, poor.deps)).toMatchObject({ ok: false, reason: "credits" });
    for (const item of [missing, legacy, poor]) {
      expect(item.tables.projectBuild.rows).toHaveLength(0);
    }
    expect(missing.charge).not.toHaveBeenCalled();
    expect(legacy.charge).not.toHaveBeenCalled();
  });

  it("aplica el cambio como versión nueva del mismo proyecto y no toca la anterior", async () => {
    const { deps, tables, calls } = setup();
    const action = await seedProject(tables);
    const started = await startProjectEdit({ user, conversationId: "c1", actionId: action.id as string, projectId: "proj1", request: "Agrega que los precios incluyen IVA" }, deps);
    if (!started.ok) throw new Error(started.message);
    const view = await advanceBuild(started.build.id, deps, 120_000);
    expect(view).toMatchObject({ status: "done", projectId: "proj1", versionNumber: 2 });
    expect(calls).toEqual(["plan", "file"]);
    const versions = tables.projectVersion.rows.filter((row) => row.projectId === "proj1");
    expect(versions).toHaveLength(2);
    const v2 = versions.find((row) => row.number === 2)!;
    const changed = (v2.files as { path: string; content: string }[]).find((file) => file.path === target)!;
    expect(changed.content).toContain("Precios con IVA incluido.");
    expect(String(v2.summary)).toContain("Cambios sobre la versión 1");
    expect(String(v2.previewHtml)).toContain("<title>El Fogón de Doña Mari</title>");
    expect((versions.find((row) => row.number === 1)!.files as { path: string; content: string }[]).find((file) => file.path === target)!.content).not.toContain("IVA incluido");
    // La edición agrega el ayudante de Contactos a sitios que no lo tenían.
    expect((v2.files as { path: string }[]).some((file) => file.path === "src/lib/leads.ts")).toBe(true);
    expect(tables.project.rows[0]).toMatchObject({ versionCount: 2, title: "El Fogón de Doña Mari", summary: "Taquería" });
    expect((tables.vegaAction.rows[0].payload as { build: { status: string; versionNumber: number } }).build).toMatchObject({ status: "done", versionNumber: 2 });
  });

  it("si el código no compila regresa al original, falla sin versión nueva y reembolsa", async () => {
    const { deps, tables, refund } = setup({ broken: true });
    const action = await seedProject(tables);
    const started = await startProjectEdit({ user, conversationId: "c1", actionId: action.id as string, projectId: "proj1", request: "Cambia la lista de precios" }, deps);
    if (!started.ok) throw new Error(started.message);
    const view = await advanceBuild(started.build.id, deps, 400_000);
    expect(view?.status).toBe("failed");
    expect(refund).toHaveBeenCalledTimes(1);
    expect(tables.projectVersion.rows).toHaveLength(1);
    expect(tables.project.rows[0].versionCount).toBe(1);
    expect(String(tables.vegaAction.rows[0].result)).toContain("Tu proyecto quedó como estaba");
  });

  it("si el cambio no se puede hacer lo dice y reembolsa", async () => {
    const { deps, tables, refund } = setup({ refuse: true });
    const action = await seedProject(tables);
    const started = await startProjectEdit({ user, conversationId: "c1", actionId: action.id as string, projectId: "proj1", request: "Conéctalo a mi base de datos" }, deps);
    if (!started.ok) throw new Error(started.message);
    const view = await advanceBuild(started.build.id, deps, 120_000);
    expect(view).toMatchObject({ status: "failed", error: "Eso necesita una base de datos." });
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("revisa el CSS editado", () => {
    const ok = '@import "tailwindcss";\n@theme { --color-primary: #ff0000; }\n';
    expect(checkEditedCss(ok)).toEqual([]);
    expect(checkEditedCss('@import "tailwindcss";\n@import "https://x.com/a.css";\n@theme {}')).not.toEqual([]);
    expect(checkEditedCss('@import "tailwindcss";\n@theme { --x: 1 }\nbody { background: url(https://x.com/a.png) }')).not.toEqual([]);
    expect(checkEditedCss("@theme { --x: 1 }")).not.toEqual([]);
  });

  it("restaurar copia una versión anterior como nueva (solo el dueño, idempotente)", async () => {
    const { tables } = setup();
    await seedProject(tables);
    await tables.projectVersion.create({ data: { projectId: "proj1", number: 2, title: "El Fogón", summary: "Cambios", files: baseFiles, generator: "vega-v2", sourceActionId: "edit-1", sizeBytes: 1000, previewHtml: "<html>v2</html>" } });
    tables.project.rows[0].versionCount = 2;
    const pv = tables.projectVersion as unknown as { findUnique: (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => Promise<unknown> };
    const original = pv.findUnique.bind(pv);
    pv.findUnique = (args) => {
      const key = args.where.projectId_number as { projectId: string; number: number } | undefined;
      return original(key ? { ...args, where: key } : args);
    };
    const db = { project: tables.project, projectVersion: tables.projectVersion } as unknown as ProjectDb;
    expect(await restoreProjectVersion(db, { userId: "otro", projectId: "proj1", number: 1, requestKey: "aaaaaaaa-1" })).toMatchObject({ ok: false });
    expect(await restoreProjectVersion(db, { userId: "u1", projectId: "proj1", number: 2, requestKey: "aaaaaaaa-2" })).toMatchObject({ ok: false, error: "Esa ya es la versión más reciente." });
    const restored = await restoreProjectVersion(db, { userId: "u1", projectId: "proj1", number: 1, requestKey: "aaaaaaaa-3" });
    expect(restored).toEqual({ ok: true, versionNumber: 3 });
    expect(await restoreProjectVersion(db, { userId: "u1", projectId: "proj1", number: 1, requestKey: "aaaaaaaa-3" })).toEqual({ ok: true, versionNumber: 3 });
    const v3 = tables.projectVersion.rows.find((row) => row.number === 3)!;
    expect(v3).toMatchObject({ summary: "Restaurada desde la versión 1.", generator: "vega-v2" });
    expect(tables.project.rows[0].versionCount).toBe(3);
  });
});
