import { describe, expect, it } from "vitest";

import { bundleProject } from "@/lib/builder/bundle";
import { fileTasks, scaffoldFiles, scaffoldPaths } from "@/lib/builder/scaffold";
import { templateSource } from "@/lib/builder/generate";
import type { BuildPlan } from "@/lib/builder/types";
import { normalizeManifest } from "@/lib/liveapps/manifest";
import { liveConfigScript, publishedCsp, publishedPageHtml } from "@/lib/publish/page";

import { banks, fixturePlan } from "../builder/fixtures";

const appBank = banks.find((bank) => bank.kind === "app")!;

function livePlan(): BuildPlan {
  const plan = fixturePlan(appBank);
  return {
    ...plan,
    live: { roles: [{ key: "mesero", label: "Mesero" }], branches: [{ id: "centro", name: "Centro" }, { id: "norte", name: "Norte" }] },
    entities: plan.entities.map((entity, index) => ({ ...entity, scope: index === 0 ? "branch" : "shared", sync: index === 0 ? "recent" : "all", write: index === 0 ? ["mesero"] : undefined })),
  };
}

async function compile(plan: BuildPlan) {
  const files = scaffoldFiles(plan);
  for (const task of fileTasks(plan)) files[task.path] = templateSource(plan, task);
  return { files, result: await bundleProject(files) };
}

describe("andamiaje con datos en vivo", () => {
  it("una app con datos en vivo trae PIN, motor y manifiesto válido", async () => {
    const plan = livePlan();
    const { files, result } = await compile(plan);
    expect(result.ok).toBe(true);
    expect(files["src/App.tsx"]).toContain("<LiveGate>");
    expect(files["src/lib/live.ts"]).toContain('"id":"norte"');
    expect(files["src/data/stores.ts"]).toContain("createCollection(");
    expect(files["README.md"]).toContain("Datos en vivo");
    const manifest = normalizeManifest(JSON.parse(files["lyra.app.json"]));
    expect(manifest?.branches.map((branch) => branch.id)).toEqual(["centro", "norte"]);
    expect(manifest?.roles.map((role) => role.key)).toEqual(["admin", "mesero"]);
    expect(manifest?.collections[0]).toMatchObject({ scope: "branch", sync: "recent", write: ["mesero"] });
    for (const path of ["src/lib/live.ts", "src/components/LiveGate.tsx", "lyra.app.json"]) expect(scaffoldPaths.has(path)).toBe(true);
  }, 30_000);

  it("una app normal sigue local: sin PIN ni manifiesto", async () => {
    const plan = fixturePlan(appBank);
    const { files, result } = await compile(plan);
    expect(result.ok).toBe(true);
    expect(files["src/App.tsx"]).not.toContain("LiveGate");
    expect(files["lyra.app.json"]).toBeUndefined();
    expect(files["src/components/LiveGate.tsx"]).toBeUndefined();
    expect(files["README.md"]).toContain("pídele a Vega la versión con datos en vivo");
  }, 30_000);
});

describe("publicación de apps con datos en vivo", () => {
  it("la configuración va al inicio de <head> y no se puede romper con </script>", () => {
    const script = liveConfigScript({ api: "https://lyra.mx/api/apps/demo/", slug: "demo</script><script>alert(1)", status: "active" });
    expect(script).not.toContain("</script><script>alert");
    const html = publishedPageHtml("<html><head><title>x</title></head><body><script>app()</script></body></html>", { title: "x", description: "", url: "https://lyra.mx/s/demo", indexable: false, appUrl: "https://lyra.mx" }, "", script);
    expect(html.indexOf("__LYRA_DATA__")).toBeLessThan(html.indexOf("app()"));
    expect(html.indexOf("__LYRA_DATA__")).toBeLessThan(html.indexOf("<title>"));
  });

  it("el CSP solo abre la Data API de esa app", () => {
    const csp = publishedCsp(["https://lyra.mx/api/apps/demo/"]);
    expect(csp).toContain("connect-src https://lyra.mx/api/apps/demo/");
    expect(csp).toContain("sandbox allow-scripts");
  });
});
