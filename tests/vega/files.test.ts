import { beforeEach, describe, expect, it, vi } from "vitest";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));

const files = await import("@/lib/vega/files");
const { runVegaTool } = await import("@/lib/vega/tools");

let rows: ReturnType<typeof table>;
beforeEach(() => {
  rows = table();
  db.current = { vegaFile: rows };
});

describe("rutas del espacio de trabajo", () => {
  it("normaliza rutas válidas", () => {
    expect(files.normalizePath("/notas//ideas.md")).toEqual({ ok: true, path: "notas/ideas.md" });
    expect(files.normalizePath("./clientes\\lista.md")).toEqual({ ok: true, path: "clientes/lista.md" });
    expect(files.normalizePath(".", true)).toEqual({ ok: true, path: "" });
  });
  it.each(["../otro/archivo", "notas/../../x", "a\u0000b", "", "a/b/c/d/e/f/g.md"])("rechaza «%s»", (raw) => {
    expect(files.normalizePath(raw).ok).toBe(false);
  });
});

describe("archivos persistentes", () => {
  it("escribe, agrega, lee, lista, busca y borra", async () => {
    expect(await files.writeWorkspaceFile("u1", "notas/ideas.md", "Idea 1")).toMatchObject({ ok: true, created: true });
    expect(await files.writeWorkspaceFile("u1", "notas/ideas.md", "Idea 2", true)).toMatchObject({ ok: true, created: false });
    const read = await files.readWorkspaceFile("u1", "notas/ideas.md");
    expect(read.ok && read.contenido).toBe("Idea 1\nIdea 2");
    await files.writeWorkspaceFile("u1", "notas/ideas.md", "Solo esto");
    const replaced = await files.readWorkspaceFile("u1", "notas/ideas.md");
    expect(replaced.ok && replaced.contenido).toBe("Solo esto");

    await files.writeWorkspaceFile("u1", "readme.md", "Hola");
    const root = await files.listWorkspace("u1");
    expect(root.ok && root.entries.map((entry) => `${entry.tipo}:${entry.ruta}`)).toEqual(["carpeta:notas", "archivo:readme.md"]);
    const found = await files.searchWorkspace("u1", "solo");
    expect(found.ok && found.coincidencias.map((entry) => entry.ruta)).toEqual(["notas/ideas.md"]);
    expect(await files.deleteWorkspaceFile("u1", "readme.md")).toBe(true);
    expect(rows.rows).toHaveLength(1);
  });

  it("aísla los archivos de cada socio", async () => {
    await files.writeWorkspaceFile("u1", "privado.md", "secreto de u1");
    await files.writeWorkspaceFile("u2", "privado.md", "de u2");
    const other = await files.readWorkspaceFile("u2", "privado.md");
    expect(other.ok && other.contenido).toBe("de u2");
    const listed = await files.listWorkspace("u2");
    expect(listed.ok && listed.entries).toHaveLength(1);
    const search = await files.searchWorkspace("u2", "u1");
    expect(search.ok && search.coincidencias).toEqual([]);
    expect(await files.deleteWorkspaceFile("u3", "privado.md")).toBe(false);
    expect(rows.rows).toHaveLength(2);
  });

  it("respeta los límites de tamaño y bloquea datos sensibles", async () => {
    const big = "a".repeat(files.MAX_FILE_BYTES + 1);
    expect((await files.writeWorkspaceFile("u1", "grande.txt", big)).ok).toBe(false);
    for (let index = 0; index < 10; index += 1) {
      rows.rows.push({ id: `r${index}`, userId: "u1", path: `relleno/${index}.txt`, content: "", bytes: 199_000, createdAt: new Date(), updatedAt: new Date() });
    }
    const overQuota = await files.writeWorkspaceFile("u1", "uno-mas.txt", "x".repeat(20_000));
    expect(overQuota.ok).toBe(false);
    const secret = await files.writeWorkspaceFile("u1", "llaves.txt", `OPENROUTER=${["sk", "or", "v1", "x".repeat(24)].join("-")}`);
    expect(secret.ok).toBe(false);
  });
});

describe("herramientas de archivos de Vega", () => {
  it("escribir_archivo agrega por omisión y reemplaza con sobrescribir: true", async () => {
    await runVegaTool("u1", "escribir_archivo", { ruta: "a.md", contenido: "uno" });
    await runVegaTool("u1", "escribir_archivo", { ruta: "a.md", contenido: "dos" });
    let read = await runVegaTool("u1", "leer_archivo", { ruta: "a.md" });
    expect(read.kind === "result" && read.response.contenido).toBe("uno\ndos");
    await runVegaTool("u1", "escribir_archivo", { ruta: "a.md", contenido: "tres", sobrescribir: true });
    read = await runVegaTool("u1", "leer_archivo", { ruta: "a.md" });
    expect(read.kind === "result" && read.response.contenido).toBe("tres");
    const foreign = await runVegaTool("u2", "leer_archivo", { ruta: "a.md" });
    expect(foreign.kind).toBe("invalid");
  });
});
