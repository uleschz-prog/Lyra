import { beforeEach, describe, expect, it, vi } from "vitest";

import { table } from "./fake-prisma";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => db.current }));

const { MEMORY_LIMIT, forgetAllMemories, forgetMemory, listMemories, saveMemory, searchMemories } = await import("@/lib/vega/memory");
const { duplicateOf, memoryPrompt, parseKind, searchMemoryList, selectMemoriesForPrompt } = await import("@/lib/vega/memory-logic");
const { runVegaTool } = await import("@/lib/vega/tools");

let memories: ReturnType<typeof table>;
beforeEach(() => {
  memories = table(() => ({ kind: "fact" }));
  db.current = { vegaMemory: memories };
});

describe("lógica de memoria", () => {
  it("entiende los tipos en español", () => {
    expect(parseKind("perfil")).toBe("profile");
    expect(parseKind("Preferencia")).toBe("preference");
    expect(parseKind("diario")).toBe("journal");
    expect(parseKind("otra cosa")).toBe("fact");
  });

  it("detecta duplicados exactos (sin acentos ni mayúsculas) y casi iguales", () => {
    const items = [{ id: "1", content: "Vende seguros de vida en Pachuca" }];
    expect(duplicateOf(items, "vende seguros de vida en pachuca.")?.match).toBe("exact");
    expect(duplicateOf(items, "Vende seguros de vida en Pachuca Hidalgo")?.match).toBe("similar");
    expect(duplicateOf(items, "Su meta es 20 socios")).toBeNull();
  });

  it("busca por palabras clave sin importar acentos", () => {
    const items = [
      { id: "1", content: "Su clienta Mariana compra cada mes", kind: "fact", updatedAt: "2026-01-01" },
      { id: "2", content: "Prefiere mensajes cortos", kind: "preference", updatedAt: "2026-01-02" },
    ];
    expect(searchMemoryList(items, "¿qué compra MARIANA?").map((item) => item.id)).toEqual(["1"]);
    expect(searchMemoryList(items, "nada que ver")).toEqual([]);
  });

  it("arma la porción del prompt con tope de caracteres y prioriza perfil, preferencias y lo relacionado", () => {
    const items = Array.from({ length: 60 }, (_, index) => ({
      id: `f${index}`,
      content: `Dato número ${index} sobre ventas y prospectos de la semana con bastante texto de relleno`,
      kind: "fact",
      updatedAt: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    }));
    items.push({ id: "p1", content: "Es distribuidor de suplementos en Pachuca", kind: "profile", updatedAt: "2025-01-01" });
    items.push({ id: "k1", content: "Su proveedor de cajas se llama Logística Rápida", kind: "fact", updatedAt: "2025-01-01" });
    const { selected, omitted } = selectMemoriesForPrompt(items, "¿cómo se llama mi proveedor de cajas?", 1_500);
    const ids = selected.map((item) => item.id);
    expect(ids[0]).toBe("p1");
    expect(ids).toContain("k1");
    expect(selected.reduce((sum, item) => sum + item.content.length + 24, 0)).toBeLessThanOrEqual(1_500);
    expect(omitted).toBeGreaterThan(0);
    expect(memoryPrompt(selected, omitted)).toContain("buscar_memoria");
  });
});

describe("memoria en base de datos", () => {
  it("rechaza datos sensibles", async () => {
    const result = await saveMemory("u1", "Su tarjeta es 4111 1111 1111 1111");
    expect(result.ok).toBe(false);
    expect(memories.rows).toHaveLength(0);
  });

  it("no duplica y actualiza un dato casi igual", async () => {
    const first = await saveMemory("u1", "Vende seguros de vida en Pachuca", "perfil");
    expect(first.ok && first.memory.kind).toBe("profile");
    const again = await saveMemory("u1", "vende seguros de vida en pachuca");
    expect(again.ok && again.duplicate).toBe(true);
    const updated = await saveMemory("u1", "Vende seguros de vida en Pachuca Hidalgo", "perfil");
    expect(updated.ok && updated.updated).toBe(true);
    expect(memories.rows).toHaveLength(1);
    expect(memories.rows[0].content).toBe("Vende seguros de vida en Pachuca Hidalgo");
  });

  it("aísla la memoria de cada socio", async () => {
    await saveMemory("u1", "Vende seguros de vida");
    await saveMemory("u2", "Vende seguros de vida");
    const other = await saveMemory("u2", "Su clienta Mariana compra cada mes");
    expect(memories.rows).toHaveLength(3);
    expect((await listMemories("u1")).map((memory) => memory.content)).toEqual(["Vende seguros de vida"]);
    expect(await searchMemories("u1", "Mariana")).toEqual([]);
    expect(other.ok && (await forgetMemory("u1", other.memory.id))).toBe(false);
    expect(await forgetAllMemories("u1")).toBe(1);
    expect(memories.rows).toHaveLength(2);
  });

  it("al llenarse rota solo el diario y avisa con los demás tipos", async () => {
    for (let index = 0; index < MEMORY_LIMIT; index += 1) {
      memories.rows.push({ id: `m${index}`, userId: "u1", content: `entrada ${index} palabra${index}`, kind: index === 0 ? "journal" : "fact", createdAt: new Date(index), updatedAt: new Date(index) });
    }
    const fact = await saveMemory("u1", "Nuevo dato importante del negocio");
    expect(fact.ok).toBe(false);
    const journal = await saveMemory("u1", "Hoy cerró tres ventas nuevas", "diario");
    expect(journal.ok).toBe(true);
    expect(memories.rows.find((row) => row.id === "m0")).toBeUndefined();
    expect(memories.rows).toHaveLength(MEMORY_LIMIT);
  });
});

describe("herramientas de memoria de Vega", () => {
  it("recordar guarda con tipo, buscar_memoria encuentra y olvidar borra", async () => {
    const saved = await runVegaTool("u1", "recordar", { dato: "Prefiere mensajes cortos y sin emojis", tipo: "preferencia" });
    expect(saved.kind).toBe("result");
    expect(memories.rows[0]).toMatchObject({ userId: "u1", kind: "preference" });

    const found = await runVegaTool("u1", "buscar_memoria", { busqueda: "emojis" });
    expect(found.kind === "result" && found.response.recuerdos).toEqual([
      { id: memories.rows[0].id, tipo: "preferencia", dato: "Prefiere mensajes cortos y sin emojis" },
    ]);
    const foreign = await runVegaTool("u2", "buscar_memoria", { busqueda: "emojis" });
    expect(foreign.kind === "result" && foreign.response.recuerdos).toBe("(sin coincidencias)");

    const removed = await runVegaTool("u1", "olvidar", { id: memories.rows[0].id });
    expect(removed.kind).toBe("result");
    expect(memories.rows).toHaveLength(0);
  });

  it("recordar rechaza contraseñas", async () => {
    const outcome = await runVegaTool("u1", "recordar", { dato: "Su contraseña es Gato123!" });
    expect(outcome.kind).toBe("invalid");
    expect(memories.rows).toHaveLength(0);
  });
});
