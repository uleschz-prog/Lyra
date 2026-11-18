import { describe, expect, it } from "vitest";

import { findPublished, getPublishState, publishProject, unpublishProject, type PublishDb } from "@/lib/publish/core";
import { defaultFavicon, publishedCsp, publishedHeaders, publishedPageHtml } from "@/lib/publish/page";
import { checkSlug, suggestSlug } from "@/lib/publish/slug";

import { fakePublishDb } from "./fake-db";

describe("reglas de la dirección", () => {
  it("acepta direcciones simples", () => {
    expect(checkSlug("taqueria-el-guero")).toEqual({ ok: true, slug: "taqueria-el-guero" });
    expect(checkSlug("  Dental2026 ")).toEqual({ ok: true, slug: "dental2026" });
  });

  it("rechaza formatos inválidos y palabras reservadas", () => {
    for (const bad of ["ab", "a".repeat(41), "con espacio", "acentó", "-inicio", "fin-", "doble--guion", "a/b", "admin", "api", "dashboard", "vega", "lyra-oficial", "lyyra"]) {
      expect(checkSlug(bad).ok, bad).toBe(false);
    }
    expect(checkSlug(42).ok).toBe(false);
  });

  it("sugiere una dirección válida a partir del título", () => {
    expect(suggestSlug("Clínica Dental Sonrisa")).toBe("clinica-dental-sonrisa");
    expect(checkSlug(suggestSlug("Admin")).ok).toBe(true);
    expect(checkSlug(suggestSlug("¡¡!!")).ok).toBe(true);
  });
});

describe("publicar", () => {
  function setup() {
    const fake = fakePublishDb();
    fake.addProject({ id: "projectaaaa1", userId: "u1" });
    fake.addProject({ id: "projectbbbb2", userId: "u2" });
    fake.addProject({ id: "agentecccc3", userId: "u1", kind: "agente" }, 1);
    return { ...fake, db: fake.db as unknown as PublishDb };
  }

  it("solo el dueño publica, y fija la versión elegida", async () => {
    const { db } = setup();
    const other = await publishProject(db, { userId: "u2", projectId: "projectaaaa1", slug: "taqueria", versionNumber: 1, indexable: false });
    expect(other).toEqual({ ok: false, error: "No encontramos ese proyecto." });
    const own = await publishProject(db, { userId: "u1", projectId: "projectaaaa1", slug: "taqueria", versionNumber: 1, indexable: true });
    expect(own.ok && own.publish).toMatchObject({ slug: "taqueria", status: "published", versionNumber: 1, indexable: true });
    expect(await getPublishState(db, "u2", "projectaaaa1")).toBeNull();
    expect(await getPublishState(db, "u1", "projectaaaa1")).toMatchObject({ versionNumber: 1 });
  });

  it("no publica agentes, versiones inexistentes ni direcciones ajenas", async () => {
    const { db } = setup();
    expect((await publishProject(db, { userId: "u1", projectId: "agentecccc3", slug: "mi-agente", versionNumber: 1, indexable: false })).ok).toBe(false);
    expect((await publishProject(db, { userId: "u1", projectId: "projectaaaa1", slug: "taqueria", versionNumber: 9, indexable: false })).ok).toBe(false);
    await publishProject(db, { userId: "u2", projectId: "projectbbbb2", slug: "ocupada", versionNumber: 1, indexable: false });
    const taken = await publishProject(db, { userId: "u1", projectId: "projectaaaa1", slug: "ocupada", versionNumber: 1, indexable: false });
    expect(taken).toEqual({ ok: false, error: "Esa dirección ya la usa otro sitio. Prueba con otra." });
  });

  it("sirve solo lo publicado y deja de servirlo al despublicar o borrar", async () => {
    const fake = setup();
    const { db } = fake;
    await publishProject(db, { userId: "u1", projectId: "projectaaaa1", slug: "taqueria", versionNumber: 1, indexable: false });
    expect((await findPublished(db, "taqueria"))?.version.number).toBe(1);
    await publishProject(db, { userId: "u1", projectId: "projectaaaa1", slug: "taqueria", versionNumber: 2, indexable: false });
    expect((await findPublished(db, "taqueria"))?.version.number).toBe(2);
    expect((await unpublishProject(db, { userId: "u2", projectId: "projectaaaa1" })).ok).toBe(false);
    expect((await unpublishProject(db, { userId: "u1", projectId: "projectaaaa1" })).ok).toBe(true);
    expect(await findPublished(db, "taqueria")).toBeNull();
    await publishProject(db, { userId: "u1", projectId: "projectaaaa1", slug: "taqueria", versionNumber: 2, indexable: false });
    fake.projects[0].deletedAt = new Date();
    expect(await findPublished(db, "taqueria")).toBeNull();
    expect(await findPublished(db, "../admin")).toBeNull();
  });
});

describe("página publicada", () => {
  const meta = { title: "Taquería <El Güero>", description: "Los mejores tacos", url: "https://lyyra.vercel.app/s/taqueria", indexable: false, appUrl: "https://lyyra.vercel.app" };

  it("agrega noindex, OG, ícono y el sello sin romper el HTML", () => {
    const html = publishedPageHtml('<!doctype html><html><head><title>x</title></head><body><header>hola</header></body></html>', meta);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain('property="og:title" content="Taquería &lt;El Güero&gt;"');
    expect(html).toContain('rel="icon"');
    expect(html).toContain("Hecho con LYRA");
    expect(html.indexOf("Hecho con LYRA")).toBeLessThan(html.indexOf("</body>"));
    expect(html.indexOf('name="robots"')).toBeLessThan(html.indexOf("<header>"));
  });

  it("si el dueño lo permite, se puede indexar con URL canónica", () => {
    const html = publishedPageHtml("<html><head></head><body></body></html>", { ...meta, indexable: true });
    expect(html).toContain('content="index, follow"');
    expect(html).toContain('rel="canonical" href="https://lyyra.vercel.app/s/taqueria"');
    expect(publishedHeaders({ indexable: true })["X-Robots-Tag"]).toBeUndefined();
    expect(publishedHeaders({ indexable: false })["X-Robots-Tag"]).toBe("noindex, nofollow");
  });

  it("CSP con sandbox (origen opaco), sin red salvo lo permitido", () => {
    const csp = publishedCsp();
    expect(csp).toMatch(/^sandbox allow-scripts allow-forms allow-popups/);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("connect-src 'none'");
    expect(publishedCsp(["https://lyyra.vercel.app/api/s/taqueria/contacto"])).toContain("connect-src https://lyyra.vercel.app/api/s/taqueria/contacto");
  });

  it("el ícono por defecto es un SVG con la inicial", () => {
    expect(decodeURIComponent(defaultFavicon("taquería"))).toContain(">T</text>");
  });
});
