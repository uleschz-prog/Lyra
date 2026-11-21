// Pruebas de la Data API contra Postgres real. Corren solo con LIVEAPPS_TEST_DATABASE_URL
// (una base desechable con el esquema aplicado); en CI sin base se saltan.
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { addMember, applyBatch, authenticate, enableLiveSpace, exportCollection, listChanges, loginWithPin, resetMemberPin, saveBranches, setMemberActive, setSpaceStatus, spaceOverview } from "@/lib/liveapps/core";

import { testManifest } from "./fixtures";

const url = process.env.LIVEAPPS_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("Data API de apps (Postgres)", () => {
  let db: PrismaClient;
  const run = Date.now().toString(36);
  const slug = `prueba-${run}`;
  const otherSlug = `otra-${run}`;
  let userId = "";
  let projectId = "";
  let adminPin = "";
  const pins: Record<string, string> = {};

  async function makeApp(owner: string, slugValue: string) {
    const project = await db.project.create({ data: { userId: owner, kind: "app", title: `App ${slugValue}`, summary: "Prueba", groupKey: `g-${slugValue}`, versionCount: 1 } });
    const version = await db.projectVersion.create({ data: { projectId: project.id, number: 1, title: project.title, summary: "", files: [] } });
    await db.projectPublish.create({ data: { projectId: project.id, slug: slugValue, versionId: version.id, status: "published", publishedAt: new Date() } });
    return project.id;
  }

  async function token(pin: string, slugValue = slug, ip = "10.0.0.1") {
    const result = await loginWithPin(db, { slug: slugValue, pin, ip });
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  async function ctxFor(pin: string, slugValue = slug) {
    const login = await token(pin, slugValue);
    const auth = await authenticate(db, { slug: slugValue, token: login.token });
    if (!auth.ok) throw new Error(auth.error);
    return auth.ctx;
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= "secreto-local-de-prueba-para-pines-1234567890";
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, max: 4 }) });
    const user = await db.user.create({ data: { name: "Dueña", email: `duena-${run}@example.com`, username: `duena${run}`, password: "x", referralCode: `R${run}` } });
    userId = user.id;
    projectId = await makeApp(userId, slug);
    const enabled = await enableLiveSpace(db, { userId, projectId, manifest: testManifest });
    if (!enabled.ok || !enabled.adminPin) throw new Error("no se activó");
    adminPin = enabled.adminPin;
    for (const [name, role, branchId] of [
      ["Ana mesera centro", "mesero", "centro"],
      ["Beto mesero centro", "mesero", "centro"],
      ["Caro cocina centro", "cocina", "centro"],
      ["Dani mesero norte", "mesero", "norte"],
    ] as const) {
      const added = await addMember(db, { userId, projectId, name, role, branchId });
      if (!added.ok) throw new Error(added.error);
      pins[name] = added.pin;
    }
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await db?.$disconnect();
  });

  it("solo el dueño activa; la segunda vez conserva datos y no crea otro admin", async () => {
    expect((await enableLiveSpace(db, { userId: "otro", projectId, manifest: testManifest })).ok).toBe(false);
    const again = await enableLiveSpace(db, { userId, projectId, manifest: testManifest });
    expect(again).toMatchObject({ ok: true, created: false, adminPin: null });
    expect(await db.appRecord.count({ where: { space: { projectId } } })).toBe(4);
  });

  it("PIN: incorrecto falla, correcto abre sesión con su rol y sucursal", async () => {
    expect(await loginWithPin(db, { slug, pin: "000000", ip: "10.0.0.9" })).toMatchObject({ ok: false, status: 401 });
    const login = await token(pins["Ana mesera centro"]);
    expect(login.session.member).toMatchObject({ name: "Ana mesera centro", role: "mesero", branchId: "centro" });
    expect(login.session.branches.map((branch) => branch.id)).toEqual(["centro", "norte"]);
    expect(await authenticate(db, { slug, token: "x".repeat(43) })).toMatchObject({ ok: false, status: 401 });
  });

  it("cada sucursal ve solo lo suyo y el catálogo compartido; admin ve todo", async () => {
    const centro = await listChanges(db, await ctxFor(pins["Ana mesera centro"]), "0");
    expect(centro.records.map((row) => row.id).sort()).toEqual(["cecina", "centro_cecina", "queso"]);
    const norte = await listChanges(db, await ctxFor(pins["Dani mesero norte"]), "0");
    expect(norte.records.map((row) => row.id).sort()).toEqual(["cecina", "norte_cecina", "queso"]);
    const admin = await listChanges(db, await ctxFor(adminPin), "0");
    expect(admin.records).toHaveLength(4);
  });

  it("escritura atómica: comanda + descuento de inventario; la sucursal la pone el servidor", async () => {
    const ana = await ctxFor(pins["Ana mesera centro"]);
    const before = ana.space.seq;
    const result = await applyBatch(db, ana, [
      { op: "create", c: "comandas", id: `c1-${run}`, branch: "norte", data: { mesa: "4", estado: "En cocina", total: 320, items: [{ nombre: "Cecina", cantidad: 2 }] } },
      { op: "inc", c: "existencias", id: "centro_cecina", field: "cantidad", by: -0.4 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seq).toBe(before + 2);
    const comanda = result.records.find((row) => row.c === "comandas")!;
    expect(comanda.b).toBe("centro");
    expect(result.records.find((row) => row.id === "centro_cecina")!.d.cantidad).toBe(9.6);
    // La cocina del centro la recibe en su siguiente sincronización; la del norte no.
    const caro = await ctxFor(pins["Caro cocina centro"]);
    const seen = await listChanges(db, caro, String(before));
    expect(seen.records.map((row) => row.id)).toContain(`c1-${run}`);
    const dani = await ctxFor(pins["Dani mesero norte"]);
    expect((await listChanges(db, dani, String(before))).records.map((row) => row.id)).not.toContain(`c1-${run}`);
  });

  it("si una operación falla no se guarda ninguna", async () => {
    const ana = await ctxFor(pins["Ana mesera centro"]);
    const stock = async () => ((await db.appRecord.findFirst({ where: { rid: "centro_cecina", space: { projectId } } }))!.data as { cantidad: number }).cantidad;
    const start = await stock();
    const result = await applyBatch(db, ana, [
      { op: "inc", c: "existencias", id: "centro_cecina", field: "cantidad", by: -1 },
      { op: "update", c: "comandas", id: "no-existe", data: { estado: "Lista" } },
    ]);
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(await stock()).toBe(start);
  });

  it("permisos: rol sin escritura, otra sucursal y conflicto de versión", async () => {
    const ana = await ctxFor(pins["Ana mesera centro"]);
    expect(await applyBatch(db, ana, [{ op: "update", c: "insumos", id: "cecina", data: { nombre: "Gratis" } }])).toMatchObject({ ok: false, status: 403 });
    const dani = await ctxFor(pins["Dani mesero norte"]);
    expect(await applyBatch(db, dani, [{ op: "inc", c: "existencias", id: "centro_cecina", field: "cantidad", by: -5 }])).toMatchObject({ ok: false, status: 403 });
    expect(await applyBatch(db, dani, [{ op: "update", c: "comandas", id: `c1-${run}`, data: { estado: "Cobrada" } }])).toMatchObject({ ok: false, status: 403 });
    const caro = await ctxFor(pins["Caro cocina centro"]);
    expect(await applyBatch(db, caro, [{ op: "update", c: "comandas", id: `c1-${run}`, data: { estado: "Lista" }, expect: 99 }])).toMatchObject({ ok: false, status: 409 });
    expect((await applyBatch(db, caro, [{ op: "update", c: "comandas", id: `c1-${run}`, data: { estado: "Lista" }, expect: 1 }])).ok).toBe(true);
    expect(await applyBatch(db, caro, [{ op: "inc", c: "comandas", id: `c1-${run}`, field: "mesa", by: 1 }])).toMatchObject({ ok: false, status: 400 });
    expect(await applyBatch(db, caro, [{ op: "create", c: "comandas", id: "../../etc", data: { mesa: "1" } }])).toMatchObject({ ok: false, status: 400 });
  });

  it("concurrencia: 20 descuentos simultáneos de dos meseros no se pisan", async () => {
    const ana = await ctxFor(pins["Ana mesera centro"]);
    const beto = await ctxFor(pins["Beto mesero centro"]);
    const before = ((await db.appRecord.findFirst({ where: { rid: "centro_cecina", space: { projectId } } }))!.data as { cantidad: number }).cantidad;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        applyBatch(db, index % 2 ? ana : beto, [
          { op: "create", c: "comandas", id: `par-${run}-${index}`, data: { mesa: String(index), estado: "En cocina" } },
          { op: "inc", c: "existencias", id: "centro_cecina", field: "cantidad", by: -0.1 },
        ]),
      ),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    const after = ((await db.appRecord.findFirst({ where: { rid: "centro_cecina", space: { projectId } } }))!.data as { cantidad: number }).cantidad;
    expect(Math.round((before - after) * 1000) / 1000).toBe(2);
    const seqs = results.flatMap((result) => (result.ok ? [result.seq] : [])).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(20);
  });

  it("aislamiento entre apps: el token de una app no sirve en otra", async () => {
    const other = await makeApp(userId, otherSlug);
    const enabled = await enableLiveSpace(db, { userId, projectId: other, manifest: testManifest });
    expect(enabled.ok).toBe(true);
    const ana = await token(pins["Ana mesera centro"]);
    expect(await authenticate(db, { slug: otherSlug, token: ana.token })).toMatchObject({ ok: false, status: 401 });
    expect(await loginWithPin(db, { slug: otherSlug, pin: pins["Ana mesera centro"], ip: "10.0.0.2" })).toMatchObject({ ok: false });
  });

  it("baja, nuevo PIN, pausa y sucursales", async () => {
    const login = await token(pins["Beto mesero centro"]);
    const members = await db.appMember.findMany({ where: { space: { projectId }, name: "Beto mesero centro" } });
    expect((await setMemberActive(db, { userId, projectId, memberId: members[0].id, active: false })).ok).toBe(true);
    expect(await authenticate(db, { slug, token: login.token })).toMatchObject({ ok: false, status: 401 });
    const reset = await resetMemberPin(db, { userId, projectId, memberId: members[0].id });
    expect(reset.ok).toBe(true);
    if (reset.ok) expect((await loginWithPin(db, { slug, pin: reset.pin, ip: "10.0.0.3" })).ok).toBe(true);
    expect(await saveBranches(db, { userId, projectId, branches: [{ id: "centro", name: "Centro histórico" }] })).toMatchObject({ ok: false });
    const saved = await saveBranches(db, { userId, projectId, branches: [{ id: "centro", name: "Centro histórico" }, { id: "norte", name: "Norte" }, { name: "Sur" }] });
    expect(saved).toMatchObject({ ok: true, branches: [{ id: "centro", name: "Centro histórico" }, { id: "norte" }, { id: "sur", name: "Sur" }] });
    const admin = await token(adminPin);
    expect((await setSpaceStatus(db, { userId, projectId, active: false })).ok).toBe(true);
    expect(await authenticate(db, { slug, token: admin.token })).toMatchObject({ ok: false, status: 401 });
    expect(await loginWithPin(db, { slug, pin: adminPin, ip: "10.0.0.4" })).toMatchObject({ ok: false, status: 404 });
    expect((await setSpaceStatus(db, { userId, projectId, active: true })).ok).toBe(true);
  });

  it("límite de intentos de PIN por IP", async () => {
    for (let index = 0; index < 10; index += 1) await loginWithPin(db, { slug, pin: "000000", ip: "10.9.9.9" });
    expect(await loginWithPin(db, { slug, pin: adminPin, ip: "10.9.9.9" })).toMatchObject({ ok: false, status: 429 });
    expect((await loginWithPin(db, { slug, pin: adminPin, ip: "10.9.9.10" })).ok).toBe(true);
  });

  it("panel del dueño: conteos, equipo y exportación (nadie más los ve)", async () => {
    const overview = await spaceOverview(db, userId, projectId);
    expect(overview?.collections.find((collection) => collection.key === "comandas")!.count).toBeGreaterThanOrEqual(21);
    expect(overview?.members.length).toBe(5);
    expect(overview?.today.writes).toBeGreaterThan(0);
    expect(await spaceOverview(db, "intruso", projectId)).toBeNull();
    const exported = await exportCollection(db, userId, projectId, "existencias");
    expect(exported?.rows.map((row) => row.id).sort()).toEqual(["centro_cecina", "norte_cecina"]);
    expect(await exportCollection(db, userId, projectId, "noexiste")).toBeNull();
  });
});
