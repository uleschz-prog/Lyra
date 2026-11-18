import { describe, expect, it } from "vitest";

import { handoffFiles, hasReadySite, hostingGuide, readySiteFileName, withHandoff } from "@/lib/projects/handoff";

describe("sitio listo (entrega)", () => {
  it("solo sitios y apps tienen archivo publicable", () => {
    expect(hasReadySite("sitio")).toBe(true);
    expect(hasReadySite("app")).toBe(true);
    expect(hasReadySite("agente")).toBe(false);
  });

  it("nombra el archivo sin acentos ni espacios", () => {
    expect(readySiteFileName("Clínica Dental Sonrisa", 3)).toBe("Clinica-Dental-Sonrisa-v3.html");
    expect(readySiteFileName("¿¿??", 1)).toBe("sitio-v1.html");
  });

  it("la guía es honesta sobre formularios y datos", () => {
    const site = hostingGuide({ title: "Taquería", kind: "sitio", number: 2, generator: "vega-v2" });
    expect(site).toContain("no envían correos ni guardan datos en un servidor");
    expect(site).toContain("npm run build");
    const app = hostingGuide({ title: "Agenda", kind: "app", number: 1, generator: "vega-v1" });
    expect(app).toContain("en el navegador de cada persona");
    expect(app).not.toContain("npm run build");
  });

  it("agrega el sitio listo y la guía sin pisar archivos existentes", () => {
    const extra = handoffFiles({ title: "X", kind: "sitio", number: 1, generator: "vega-v2", html: "<html></html>" });
    expect(extra.map((file) => file.path)).toEqual(["COMO-PUBLICAR.md", "sitio-listo/index.html"]);
    const merged = withHandoff([{ path: "COMO-PUBLICAR.md", content: "mío" }, { path: "index.html", content: "src" }], extra);
    expect(merged).toHaveLength(3);
    expect(merged.find((file) => file.path === "COMO-PUBLICAR.md")?.content).toBe("mío");
  });
});
