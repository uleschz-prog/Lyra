// El motor de datos en vivo que LYRA pone en cada app (src/lib/live.ts + src/lib/data.ts) contra
// la Data API real (rutas de Next) y Postgres. Cada «dispositivo» es una copia aparte del módulo.
// Corre solo con LIVEAPPS_TEST_DATABASE_URL.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { scaffoldFiles } from "@/lib/builder/scaffold";
import type { BuildPlan } from "@/lib/builder/types";
import { addMember, enableLiveSpace } from "@/lib/liveapps/core";

import { banks, fixturePlan } from "../builder/fixtures";
import { testManifest } from "./fixtures";

const url = process.env.LIVEAPPS_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

type Live = {
  loginWithPin(pin: string): Promise<{ ok: boolean; error?: string }>;
  logout(): Promise<void>;
  pull(reset?: boolean): Promise<void>;
  getLive(): { status: string; branch: string | null; member: { role: string } | null; pending: number; error: string | null };
  setBranch(branch: string | null): void;
  transact(run: () => void): void;
};
type Store = { list(): Record<string, unknown>[]; get(id: string): Record<string, unknown> | undefined; create(v: Record<string, unknown>): Record<string, unknown>; update(id: string, v: Record<string, unknown>): unknown; inc(id: string, f: string, by: number): void; remove(id: string): void };
type Data = { createCollection(key: string, seed: unknown[], scope: "branch" | "shared"): Store };
type Device = { live: Live; data: Data; stores: Record<string, Store> };

const root = path.join(process.cwd(), ".lyra-test-tmp", `sdk-${Date.now().toString(36)}`);

async function device(name: string): Promise<Device> {
  const plan: BuildPlan = { ...fixturePlan(banks.find((bank) => bank.kind === "app")!), live: { roles: testManifest.roles, branches: testManifest.branches } };
  const files = scaffoldFiles(plan);
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "live.ts"), files["src/lib/live.ts"]);
  writeFileSync(path.join(dir, "data.ts"), files["src/lib/data.ts"]);
  const live = (await import(/* @vite-ignore */ path.join(dir, "live.ts"))) as Live;
  const data = (await import(/* @vite-ignore */ path.join(dir, "data.ts"))) as Data;
  const stores = Object.fromEntries(testManifest.collections.map((collection) => [collection.key, data.createCollection(collection.key, [], collection.scope as "branch" | "shared")]));
  return { live, data, stores };
}

async function settle(devices: Device[]) {
  for (let i = 0; i < 50 && devices.some((d) => d.live.getLive().pending > 0); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  await Promise.all(devices.map((d) => d.live.pull()));
}

suite("SDK de datos en vivo contra la Data API (Postgres)", () => {
  let db: PrismaClient;
  const run = Date.now().toString(36);
  const slug = `sdk-${run}`;
  let userId = "";
  let adminPin = "";
  const pins: Record<string, string> = {};
  let centro: Device;
  let norte: Device;
  let admin: Device;

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= "secreto-local-de-prueba-para-pines-1234567890";
    process.env.DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, max: 4 }) });
    const user = await db.user.create({ data: { name: "Dueña SDK", email: `sdk-${run}@example.com`, username: `sdk${run}`, password: "x", referralCode: `S${run}` } });
    userId = user.id;
    const project = await db.project.create({ data: { userId, kind: "app", title: "SDK", summary: "Prueba", groupKey: `g-${slug}`, versionCount: 1 } });
    const version = await db.projectVersion.create({ data: { projectId: project.id, number: 1, title: "SDK", summary: "", files: [] } });
    await db.projectPublish.create({ data: { projectId: project.id, slug, versionId: version.id, status: "published", publishedAt: new Date() } });
    const enabled = await enableLiveSpace(db, { userId, projectId: project.id, manifest: testManifest });
    if (!enabled.ok || !enabled.adminPin) throw new Error("no se activó");
    adminPin = enabled.adminPin;
    for (const [name, role, branchId] of [["centro", "mesero", "centro"], ["norte", "mesero", "norte"]] as const) {
      const added = await addMember(db, { userId, projectId: project.id, name, role, branchId });
      if (!added.ok) throw new Error(added.error);
      pins[name] = added.pin;
    }

    const route = await import("@/app/api/apps/[slug]/[action]/route");
    (globalThis as unknown as { window: unknown }).window = { __LYRA_DATA__: { api: `https://lyra.test/api/apps/${slug}/`, slug, status: "active" } };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const target = new URL(String(input));
      const [, , , slugPart, action] = target.pathname.split("/");
      const request = new Request(target, { ...init, headers: { ...(init?.headers as Record<string, string>), "x-forwarded-for": "10.9.9.9" } });
      const context = { params: Promise.resolve({ slug: slugPart, action }) };
      return init?.method === "POST" ? route.POST(request, context) : route.GET(request, context);
    }) as typeof fetch;

    centro = await device("centro");
    norte = await device("norte");
    admin = await device("admin");
  }, 60_000);

  afterAll(async () => {
    for (const d of [centro, norte, admin]) await d?.live.logout().catch(() => undefined);
    await db?.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await db?.$disconnect();
    rmSync(root, { recursive: true, force: true });
  });

  it("PIN equivocado no entra; cada quien entra a su sucursal", async () => {
    expect((await centro.live.loginWithPin("000000")).ok).toBe(false);
    expect(await centro.live.loginWithPin(pins.centro)).toEqual({ ok: true });
    expect(await norte.live.loginWithPin(pins.norte)).toEqual({ ok: true });
    expect(await admin.live.loginWithPin(adminPin)).toEqual({ ok: true });
    expect(centro.live.getLive()).toMatchObject({ status: "online", branch: "centro" });
    expect(norte.live.getLive().branch).toBe("norte");
    expect(centro.stores.existencias.list().map((row) => row.id)).toEqual(["centro_cecina"]);
    expect(norte.stores.existencias.list().map((row) => row.id)).toEqual(["norte_cecina"]);
    expect(admin.stores.existencias.list().map((row) => row.id).sort()).toEqual(["centro_cecina", "norte_cecina"]);
  });

  it("una comanda con descuento de inventario entra completa y la ve la sucursal y administración, no la otra", async () => {
    centro.live.transact(() => {
      centro.stores.comandas.create({ id: "cmd-centro-1", mesa: "4", estado: "En cocina", total: 180, items: [{ nombre: "Cecina", cantidad: 2 }] });
      centro.stores.existencias.inc("centro_cecina", "cantidad", -0.5);
    });
    // Se ve al instante en el mismo dispositivo (antes de que responda el servidor).
    expect(centro.stores.comandas.get("cmd-centro-1")).toMatchObject({ mesa: "4", branchId: "centro" });
    await settle([centro, norte, admin]);
    expect(centro.live.getLive().pending).toBe(0);
    expect(admin.stores.comandas.get("cmd-centro-1")).toMatchObject({ mesa: "4", estado: "En cocina" });
    expect(admin.stores.existencias.get("centro_cecina")?.cantidad).toBe(9.5);
    expect(norte.stores.comandas.list()).toHaveLength(0);
  });

  it("sumas concurrentes desde dos dispositivos no se pisan", async () => {
    for (let i = 0; i < 10; i += 1) {
      centro.stores.existencias.inc("centro_cecina", "cantidad", 1);
      admin.stores.existencias.inc("centro_cecina", "cantidad", 1);
    }
    await settle([centro, admin]);
    await settle([centro, admin]);
    expect(admin.stores.existencias.get("centro_cecina")?.cantidad).toBe(29.5);
    expect(centro.stores.existencias.get("centro_cecina")?.cantidad).toBe(29.5);
  });

  it("si el servidor rechaza un cambio, la pantalla vuelve al dato real y muestra el error", async () => {
    norte.stores.insumos.create({ id: "nuevo-insumo", nombre: "Chorizo" });
    expect(norte.stores.insumos.get("nuevo-insumo")).toBeTruthy();
    await settle([norte]);
    expect(norte.stores.insumos.get("nuevo-insumo")).toBeUndefined();
    expect(norte.live.getLive().error).toMatch(/rol no puede/);
  });

  it("borrar y editar se propagan a otros dispositivos", async () => {
    centro.stores.comandas.update("cmd-centro-1", { estado: "Lista" });
    await settle([centro, admin]);
    expect(admin.stores.comandas.get("cmd-centro-1")?.estado).toBe("Lista");
    centro.stores.comandas.remove("cmd-centro-1");
    await settle([centro, admin]);
    expect(admin.stores.comandas.get("cmd-centro-1")).toBeUndefined();
  });

  it("administración puede crear en otra sucursal; una sucursal no", async () => {
    admin.live.setBranch(null);
    admin.stores.existencias.create({ id: "norte_queso", branchId: "norte", insumo: "queso", cantidad: 3 });
    centro.stores.existencias.create({ id: "centro_queso_x", branchId: "norte", insumo: "queso", cantidad: 1 });
    await settle([admin, centro, norte]);
    expect(norte.stores.existencias.get("norte_queso")).toMatchObject({ branchId: "norte", cantidad: 3 });
    expect(admin.stores.existencias.get("centro_queso_x")?.branchId).toBe("centro");
  });

  it("administración puede ver todas las sucursales o una sola", () => {
    admin.live.setBranch(null);
    expect(admin.live.getLive().branch).toBeNull();
    admin.live.setBranch("norte");
    expect(admin.live.getLive().branch).toBe("norte");
    centro.live.setBranch("norte");
    expect(centro.live.getLive().branch).toBe("centro");
  });

  it("al salir pide PIN otra vez", async () => {
    await norte.live.logout();
    expect(norte.live.getLive().status).toBe("login");
    expect(norte.stores.existencias.list()).toHaveLength(0);
  });
});
