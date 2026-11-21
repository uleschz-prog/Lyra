import { describe, expect, it } from "vitest";

import { canRead, canWrite, normalizeManifest, publicManifest, validateData } from "@/lib/liveapps/manifest";
import { isPin, isWeakPin, pinDigest, randomPin, tokenHash } from "@/lib/liveapps/secrets";

import { testManifest } from "./fixtures";

describe("manifiesto de datos en vivo", () => {
  it("normaliza roles, sucursales y colecciones", () => {
    const manifest = normalizeManifest(testManifest)!;
    expect(manifest.roles.map((role) => role.key)).toEqual(["admin", "mesero", "cocina"]);
    expect(manifest.branches.map((branch) => branch.id)).toEqual(["centro", "norte"]);
    expect(manifest.collections.map((collection) => [collection.key, collection.scope, collection.sync])).toEqual([
      ["insumos", "shared", "all"],
      ["existencias", "branch", "all"],
      ["comandas", "branch", "recent"],
    ]);
    expect(publicManifest(manifest).collections.every((collection) => !("seed" in collection))).toBe(true);
  });

  it("descarta lo inseguro: llaves raras, refs a colecciones inexistentes y roles desconocidos", () => {
    const manifest = normalizeManifest({
      roles: [{ key: "Admin Root!" }, { key: "caja" }],
      collections: [
        {
          key: "ventas",
          write: ["caja", "hacker"],
          fields: [
            { key: "__proto__", type: "text" },
            { key: "cliente", type: "ref", ref: "clientes" },
            { key: "monto", type: "money" },
          ],
        },
        { key: "DROP TABLE", fields: [{ key: "x" }] },
      ],
    })!;
    expect(manifest.roles.map((role) => role.key)).toEqual(["admin", "caja"]);
    expect(manifest.branches).toEqual([{ id: "principal", name: "Principal" }]);
    expect(manifest.collections).toHaveLength(1);
    const ventas = manifest.collections[0];
    expect(ventas.fields.map((field) => [field.key, field.type])).toEqual([
      ["cliente", "text"],
      ["monto", "money"],
    ]);
    expect(ventas.write).toEqual(["caja"]);
    expect(normalizeManifest({ collections: [] })).toBeNull();
    expect(normalizeManifest("x")).toBeNull();
  });

  it("valida registros contra el esquema", () => {
    const manifest = normalizeManifest(testManifest)!;
    const comandas = manifest.collections.find((collection) => collection.key === "comandas")!;
    expect(validateData(comandas, { mesa: "4", estado: "En cocina", total: "250.5", extra: "fuera", items: [{ nombre: "Cecina", cantidad: 2, raro: 1 }] }, { partial: false })).toEqual({
      ok: true,
      data: { mesa: "4", estado: "En cocina", total: 250.5, items: [{ nombre: "Cecina", cantidad: 2 }] },
    });
    expect(validateData(comandas, { estado: "En cocina" }, { partial: false })).toEqual({ ok: false, error: "Falta «Mesa»." });
    expect(validateData(comandas, { estado: "Robada" }, { partial: true }).ok).toBe(false);
    expect(validateData(comandas, { total: "mucho" }, { partial: true }).ok).toBe(false);
    expect(validateData(comandas, { items: Array.from({ length: 61 }, () => ({})) }, { partial: true }).ok).toBe(false);
    expect(validateData(comandas, { mesa: "x".repeat(501) }, { partial: true }).ok).toBe(false);
    expect(validateData(comandas, ["no"], { partial: true }).ok).toBe(false);
  });

  it("permisos por rol: admin siempre; los demás según write/read", () => {
    const manifest = normalizeManifest(testManifest)!;
    const insumos = manifest.collections[0];
    const comandas = manifest.collections[2];
    expect(canWrite(insumos, "admin")).toBe(true);
    expect(canWrite(insumos, "mesero")).toBe(false);
    expect(canWrite(comandas, "cocina")).toBe(true);
    expect(canRead(insumos, "cocina")).toBe(true);
  });
});

describe("PIN y tokens", () => {
  const env = { SESSION_SECRET: "secreto-de-prueba-suficientemente-largo" };

  it("la huella del PIN depende del espacio y del secreto", () => {
    expect(pinDigest("a", "482913", env)).toBe(pinDigest("a", "482913", env));
    expect(pinDigest("a", "482913", env)).not.toBe(pinDigest("b", "482913", env));
    expect(pinDigest("a", "482913", env)).not.toBe(pinDigest("a", "482913", { SESSION_SECRET: "otro-secreto-de-prueba-largo-123" }));
    expect(() => pinDigest("a", "482913", {})).toThrow();
  });

  it("los PIN aleatorios tienen 6 dígitos y no son obvios", () => {
    for (let index = 0; index < 200; index += 1) {
      const pin = randomPin();
      expect(isPin(pin)).toBe(true);
      expect(isWeakPin(pin)).toBe(false);
    }
    expect(isWeakPin("111111")).toBe(true);
    expect(isWeakPin("123456")).toBe(true);
    expect(isWeakPin("654321")).toBe(true);
    expect(isPin("12345")).toBe(false);
    expect(isPin("12a456")).toBe(false);
    expect(tokenHash("x")).toHaveLength(64);
  });
});
