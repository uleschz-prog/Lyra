import { describe, expect, it } from "vitest";

import {
  cleanProjectFiles,
  draftFromPayload,
  hasActiveBuild,
  importPastDeliveries,
  projectGroupKey,
  saveDeliveredProject,
  zipFileName,
  type ProjectDb,
} from "@/lib/projects/store";
import { buildProject } from "@/lib/vega/build-project";
import { table } from "../vega/fake-prisma";

function db() {
  const project = table(() => ({ deletedAt: null, versionCount: 0 }));
  const projectVersion = table(() => ({ generator: "vega-v1" }), { unique: ["sourceActionId"] });
  const vegaAction = table();
  return { project, projectVersion, vegaAction, client: { project, projectVersion, vegaAction } as unknown as ProjectDb & { vegaAction: never } };
}

const built = buildProject({
  titulo: "Clínica Luna",
  tipo: "app",
  resumen: "Agenda de citas para la recepción de la clínica.",
  secciones: [
    { tipo: "portada", titulo: "Agenda tu cita", texto: "Consulta y limpieza.", boton: "Agendar" },
    { tipo: "agenda", titulo: "Nueva cita", servicios: ["Consulta"], nota: "" },
  ],
});
if (!built.ok) throw new Error(built.error);
const payload = built.project;

describe("Proyectos: guardar entregas de Vega", () => {
  it("agrupa por conversación, tipo y título normalizado", () => {
    expect(projectGroupKey("c1", "app", "Clínica  Luna!")).toBe("c1:app:clinica luna");
    expect(projectGroupKey(null, "sitio", "")).toBe("sin-chat:sitio:proyecto");
  });

  it("rechaza rutas inseguras, duplicadas o archivos demasiado grandes", () => {
    expect(cleanProjectFiles([{ path: "../x", content: "" }])).toBeNull();
    expect(cleanProjectFiles([{ path: "/etc/passwd", content: "" }])).toBeNull();
    expect(cleanProjectFiles([{ path: "a.txt", content: "1" }, { path: "a.txt", content: "2" }])).toBeNull();
    expect(cleanProjectFiles([{ path: "big.txt", content: "x".repeat(3_100_000) }])).toBeNull();
    expect(cleanProjectFiles([{ path: "src/a.ts", content: "ok" }])).toEqual({ files: [{ path: "src/a.ts", content: "ok" }], bytes: 2 });
  });

  it("lee el payload de una entrega", () => {
    expect(draftFromPayload(payload)).toMatchObject({ kind: "app", title: "Clínica Luna" });
    expect(draftFromPayload({ kind: "otro", title: "x", files: [] })).toBeNull();
  });

  it("crea el proyecto con la versión 1 y no duplica la misma entrega", async () => {
    const { client, project, projectVersion } = db();
    const first = await saveDeliveredProject(client, { userId: "u1", conversationId: "c1", actionId: "a1", payload });
    expect(first).toEqual({ projectId: project.rows[0].id, versionNumber: 1, created: true });
    const again = await saveDeliveredProject(client, { userId: "u1", conversationId: "c1", actionId: "a1", payload });
    expect(again).toMatchObject({ versionNumber: 1, created: false });
    expect(projectVersion.rows).toHaveLength(1);
    expect(project.rows[0].versionCount).toBe(1);
  });

  it("otra entrega del mismo proyecto en el chat es la versión 2; en otro chat es otro proyecto", async () => {
    const { client, project } = db();
    await saveDeliveredProject(client, { userId: "u1", conversationId: "c1", actionId: "a1", payload });
    const second = await saveDeliveredProject(client, { userId: "u1", conversationId: "c1", actionId: "a2", payload: { ...payload, summary: "Con recordatorios." } });
    expect(second).toMatchObject({ versionNumber: 2, created: false });
    expect(project.rows[0]).toMatchObject({ versionCount: 2, summary: "Con recordatorios." });
    const other = await saveDeliveredProject(client, { userId: "u1", conversationId: "c2", actionId: "a3", payload });
    expect(other).toMatchObject({ versionNumber: 1, created: true });
    expect(project.rows).toHaveLength(2);
  });

  it("un proyecto borrado no recibe versiones nuevas", async () => {
    const { client, project } = db();
    await saveDeliveredProject(client, { userId: "u1", conversationId: "c1", actionId: "a1", payload });
    project.rows[0].deletedAt = new Date();
    const next = await saveDeliveredProject(client, { userId: "u1", conversationId: "c1", actionId: "a2", payload });
    expect(next).toMatchObject({ versionNumber: 1, created: true });
  });

  it("ignora payloads inválidos", async () => {
    const { client } = db();
    expect(await saveDeliveredProject(client, { userId: "u1", conversationId: "c1", actionId: "a1", payload: { kind: "app" } })).toBeNull();
  });

  it("importa entregas anteriores una sola vez", async () => {
    const { client, vegaAction, projectVersion } = db();
    await vegaAction.create({ data: { id: "old1", userId: "u1", kind: "deliver_project", conversationId: "c1", payload } });
    await vegaAction.create({ data: { id: "old2", userId: "u1", kind: "create_image", conversationId: "c1", payload: {} } });
    // La consulta de versiones por relación no existe en la base falsa: simulamos el filtro por dueño.
    const scoped = {
      ...client,
      projectVersion: {
        ...projectVersion,
        findMany: (args: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => {
          const { project: _project, ...where } = args.where ?? {};
          void _project;
          return projectVersion.findMany({ ...args, where });
        },
      },
    } as unknown as Parameters<typeof importPastDeliveries>[0];
    expect(await importPastDeliveries(scoped, "u1")).toBe(1);
    expect(await importPastDeliveries(scoped, "u1")).toBe(0);
    expect(projectVersion.rows).toHaveLength(1);
  });

  it("no importa como v1 una entrega con construcción v2 activa", () => {
    expect(hasActiveBuild({ ...payload, build: { buildId: "b1", status: "running" } })).toBe(true);
    expect(hasActiveBuild({ ...payload, build: { buildId: "b1", status: "done" } })).toBe(true);
    expect(hasActiveBuild({ ...payload, build: { buildId: "b1", status: "failed" } })).toBe(false);
    expect(hasActiveBuild(payload)).toBe(false);
  });

  it("nombra el ZIP sin acentos y con la versión", () => {
    expect(zipFileName("Clínica Luna", 3)).toBe("Clinica-Luna-v3.zip");
  });
});
