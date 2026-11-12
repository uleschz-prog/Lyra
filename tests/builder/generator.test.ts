import { describe, expect, it } from "vitest";

import { buildPreviewHtml, bundleProject } from "@/lib/builder/bundle";
import { checkGeneratedFile, extractCode } from "@/lib/builder/checks";
import { builderDailyLimit, builderModels, builderPrice } from "@/lib/builder/config";
import { designSystems, rankDesignSystems } from "@/lib/builder/design-systems";
import { advanceEngine, initialState, type EngineState } from "@/lib/builder/engine";
import { templateSource } from "@/lib/builder/generate";
import { composeSkeleton, normalizePlan } from "@/lib/builder/plan";
import { fileTasks, scaffoldFiles } from "@/lib/builder/scaffold";
import { sectionLibrary, sectionTemplates } from "@/lib/builder/sections";
import { banks, fixtureModel, fixturePlan } from "./fixtures";

async function runToSave(bank: (typeof banks)[number], options: Parameters<typeof fixtureModel>[1] = {}) {
  const model = fixtureModel(bank, options);
  let state: EngineState = initialState();
  for (let round = 0; round < 20 && state.status !== "failed" && state.step !== "save"; round += 1) {
    ({ state } = await advanceEngine(state, { brief: bank.brief, kind: bank.kind, title: bank.title }, { model, now: Date.now }, 48_000));
  }
  return { state, model };
}

describe("Generador v2: biblioteca", () => {
  it("tiene 40–60 secciones premium y 6–8 sistemas de diseño, todas con plantilla", () => {
    expect(sectionLibrary.length).toBeGreaterThanOrEqual(40);
    expect(sectionLibrary.length).toBeLessThanOrEqual(60);
    expect(designSystems.length).toBeGreaterThanOrEqual(6);
    expect(designSystems.length).toBeLessThanOrEqual(8);
    for (const def of sectionLibrary) expect(sectionTemplates[def.id], def.id).toBeTypeOf("function");
    expect(new Set(sectionLibrary.map((def) => def.id)).size).toBe(sectionLibrary.length);
  });

  it("cada plantilla de cada fixture pasa las reglas del servidor", () => {
    for (const bank of banks) {
      const plan = fixturePlan(bank);
      for (const task of fileTasks(plan)) {
        const source = templateSource(plan, task);
        expect(checkGeneratedFile(task.path, source), `${bank.id} ${task.path}`).toEqual([]);
      }
    }
  });
});

describe("Generador v2: barra de calidad", () => {
  it("briefs distintos producen sistemas de diseño y mezclas de secciones distintas", () => {
    const plans = banks.map((bank) => fixturePlan(bank));
    const systems = plans.map((plan) => plan.designSystem);
    expect(new Set(systems).size).toBe(banks.length);
    const mixes = plans.map((plan) => [...plan.chrome.map((s) => s.id), ...plan.pages.flatMap((page) => page.sections.map((s) => s.id))]);
    expect(new Set(mixes.map((mix) => mix.join("|"))).size).toBe(banks.length);
    // Ningún par de sitios comparte más del 75 % de sus secciones.
    const sites = mixes.filter((_, index) => banks[index].kind === "sitio");
    for (let a = 0; a < sites.length; a += 1) {
      for (let b = a + 1; b < sites.length; b += 1) {
        const left = new Set(sites[a]);
        const right = new Set(sites[b]);
        const shared = [...left].filter((id) => right.has(id)).length;
        expect(shared / Math.max(left.size, right.size), `${a}-${b}`).toBeLessThan(0.75);
      }
    }
  });

  it("la composición es determinista y responde al giro del negocio", () => {
    const brief = "Taquería con menú y pedidos por WhatsApp";
    expect(composeSkeleton(brief, "sitio")).toEqual(composeSkeleton(brief, "sitio"));
    expect(composeSkeleton(brief, "sitio").pages[0].sections).toContain("menu-board");
    expect(rankDesignSystems("clínica dental familiar", "sitio")[0].id).toBe("clinic");
    expect(rankDesignSystems("crossfit oscuro e intenso", "sitio")[0].id).toBe("noir");
    // «cafetería» no debe activar «ia» (coincidencia por palabra, no por subcadena).
    expect(rankDesignSystems("cafetería orgánica natural", "app")[0].id).toBe("organic");
  });

  it("un plan basura del modelo se normaliza a un plan válido", () => {
    const composition = composeSkeleton("Despacho de abogados", "sitio");
    const plan = normalizePlan({ pages: "x", designSystem: "inexistente", chrome: 4 }, { brief: "Despacho de abogados", kind: "sitio", composition, fallbackTitle: "Despacho" });
    expect(plan.pages[0].path).toBe("/");
    expect(plan.pages[0].sections.length).toBeGreaterThan(3);
    expect(designSystems.map((s) => s.id)).toContain(plan.designSystem);
    expect(plan.chrome.map((s) => s.name)).toEqual(["Nav", "Footer"]);
  });
});

describe("Generador v2: plan → generar → validar → reparar", () => {
  it.each(banks.map((bank) => [bank.id, bank] as const))("%s llega a guardar con vista previa compilada", async (_id, bank) => {
    const { state, model } = await runToSave(bank);
    expect(state.status).toBe("running");
    expect(state.step).toBe("save");
    expect(state.tasks.every((task) => task.state === "done")).toBe(true);
    expect(model.calls.filter((call) => call.purpose === "plan")).toHaveLength(1);
    const files = Object.keys(state.files);
    expect(files).toEqual(expect.arrayContaining(["package.json", "vite.config.ts", "index.html", "src/main.tsx", "src/App.tsx", "src/lib/router.tsx"]));
    if (bank.kind === "app") expect(files).toEqual(expect.arrayContaining(["src/lib/data.ts", "src/data/stores.ts"]));
    const preview = await buildPreviewHtml(state.plan!, state.files);
    expect(preview.ok).toBe(true);
    expect(preview.html).toContain(bank.brand.name.replace(/&/g, "&amp;"));
    expect(preview.html).toContain("fonts.googleapis.com");
    expect(preview.html!.length).toBeLessThan(600_000);
    expect(preview.html).not.toMatch(/<script[^>]+src=/);
  }, 30_000);

  it("repara un archivo roto en la siguiente ronda", async () => {
    const bank = banks[0];
    const broken = fileTasks(fixturePlan(bank)).find((task) => task.path.startsWith("src/sections/"))!.path;
    const { state, model } = await runToSave(bank, { breakFiles: [broken] });
    expect(state.step).toBe("save");
    expect(state.repairRound).toBe(1);
    expect(model.calls.some((call) => call.purpose === "repair")).toBe(true);
    expect(state.files[broken]).not.toContain("NoExiste");
    expect(state.tasks.find((task) => task.path === broken)?.state).toBe("done");
  }, 30_000);

  it("falla (para reembolsar) si el modelo no responde el plan", async () => {
    const { state } = await runToSave(banks[1], { failPlan: true });
    expect(state.status).toBe("failed");
    expect(state.error).toBeTruthy();
  });

  it("el andamiaje exporta un proyecto Vite válido", () => {
    const files = scaffoldFiles(fixturePlan(banks[5]));
    const pkg = JSON.parse(files["package.json"]);
    expect(pkg.scripts.build).toContain("vite build");
    expect(pkg.dependencies).toHaveProperty("react");
    expect(files["src/lib/data.ts"]).toContain("interface DataStore");
    expect(files["README.md"]).toContain("DataStore");
  });
});

describe("Generador v2: reglas de seguridad del código", () => {
  const ok = 'import { Star } from "lucide-react";\nexport default function Hero() { return <section><Star /></section>; }\n';

  it("acepta un componente limpio", () => {
    expect(checkGeneratedFile("src/sections/Hero.tsx", ok)).toEqual([]);
  });

  it.each([
    ["fetch", 'export default function A() { fetch("https://x.com"); return null; }'],
    ["paquete no permitido", 'import axios from "axios";\nexport default function A() { return null; }'],
    ["dominio externo", 'export default function A() { return <img src="https://evil.example.com/a.png" alt="" />; }'],
    // La llave falsa se arma en ejecución para no dejar nada con forma de secreto en el repo.
    ["llave", `const k = "${["sk", "proj", "x".repeat(36)].join("-")}";\nexport default function A() { return null; }`],
    ["innerHTML", 'export default function A() { return <div dangerouslySetInnerHTML={{ __html: "x" }} />; }'],
    ["almacenamiento", 'export default function A() { localStorage.setItem("a", "b"); return null; }'],
    ["sin export default", "function A() { return null; }"],
  ])("rechaza %s", (_label, source) => {
    expect(checkGeneratedFile("src/sections/A.tsx", source).length).toBeGreaterThan(0);
  });

  it("permite imágenes de Unsplash y fuentes de Google", () => {
    const source = 'export default function A() { return <img src="https://images.unsplash.com/photo-1?w=800" alt="Foto" />; }';
    expect(checkGeneratedFile("src/sections/A.tsx", source)).toEqual([]);
  });

  it("extrae el código de un bloque ```tsx", () => {
    expect(extractCode("Aquí va:\n```tsx\nconst a = 1;\n```\nlisto")).toBe("const a = 1;\n");
  });

  it("esbuild reporta el archivo culpable", async () => {
    const files = scaffoldFiles(fixturePlan(banks[2]));
    const plan = fixturePlan(banks[2]);
    for (const task of fileTasks(plan)) files[task.path] = templateSource(plan, task);
    const target = fileTasks(plan)[1].path;
    files[target] = "export default function Roto( { return <div>; }";
    const result = await bundleProject(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.path === target)).toBe(true);
  });
});

describe("Generador v2: configuración", () => {
  it("precios por trabajo y límites diarios por plan con variables de entorno", () => {
    expect([builderPrice("sitio", {}), builderPrice("app", {}), builderPrice("edit", {}), builderPrice("agente", {})]).toEqual([10, 10, 2, 5]);
    expect(builderPrice("sitio", { VEGA_BUILDER_PRICE_SITE: "12" })).toBe(12);
    expect(builderDailyLimit({ package: null }, {})).toBe(2);
    expect(builderDailyLimit({ package: null, role: "ADMIN" }, {})).toBeNull();
    expect(builderDailyLimit({ package: null }, { VEGA_BUILDER_DAILY_DEFAULT: "7" })).toBe(7);
    expect(builderModels({})).toEqual({ gemini: "gemini-2.5-flash", openrouter: "google/gemini-2.5-flash" });
    expect(builderModels({ VEGA_BUILDER_MODEL: "gemini-2.5-pro" }).openrouter).toBe("google/gemini-2.5-pro");
  });
});
