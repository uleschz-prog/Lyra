import { describe, expect, it } from "vitest";

import { builderPrice } from "@/lib/builder/config";
import { buildCharge } from "@/lib/builder/runner";
import { basicGameDraft, basicGameFiles } from "@/lib/games/basic";
import { GAME_CODE_PATH, GAME_MANIFEST_PATH, gameManifest, gameManifestFromFiles, gameProjectFiles, isGameProject, normalizeGameSpec } from "@/lib/games/spec";
import { neonBlocksTemplate } from "@/lib/marketplace/official/game";
import { officialTemplates } from "@/lib/marketplace/official";

import { gamePlanJson, tinyGame } from "./fixtures";

describe("especificación del juego", () => {
  it("normaliza y limpia lo que propone el modelo", () => {
    const spec = normalizeGameSpec({ ...gamePlanJson, width: 99999, colors: { bg: "red", primary: "#123456" }, genre: "mmo" }, { leaderboard: true });
    expect(spec.genre).toBe("arcade");
    expect(spec.width).toBe(1600);
    expect(spec.colors.bg).toBe("#0B0718");
    expect(spec.colors.primary).toBe("#123456");
    expect(spec.controls.buttons[0]).toEqual({ id: "dash", label: "Turbo", keys: [" ", "x"] });
    expect(spec.controls.tap).toBe("dash");
    expect(spec.leaderboard).toBe(true);
  });

  it("valores seguros si el plan viene vacío; runner y plataformas en horizontal", () => {
    expect(normalizeGameSpec({}, { leaderboard: false })).toMatchObject({ orientation: "portrait", width: 540, height: 960, leaderboard: false, maxScore: 1_000_000 });
    expect(normalizeGameSpec({ genre: "runner" }, { leaderboard: false })).toMatchObject({ orientation: "landscape", width: 960, height: 540 });
  });

  it("manifiesto: ida y vuelta, y proyecto editable", () => {
    const spec = normalizeGameSpec(gamePlanJson, { leaderboard: true });
    const files = gameProjectFiles({ title: "Taco Esquiva", summary: "x", code: tinyGame, manifest: gameManifest("Taco Esquiva", spec) });
    expect(Object.keys(files).sort()).toEqual(["README.md", "index.html", GAME_MANIFEST_PATH, GAME_CODE_PATH, "src/lyra-game.js"].sort());
    expect(gameManifestFromFiles(files)).toMatchObject({ leaderboard: true, maxScore: 50000, maxPerSecond: 200, genre: "arcade" });
    expect(isGameProject(files)).toBe(true);
    expect(isGameProject({ ...files, [GAME_MANIFEST_PATH]: "{" })).toBe(false);
    expect(files["index.html"]).toContain("LyraGame.start");
    expect(files["README.md"]).toMatch(/no es a prueba de trampas/);
  });

  it("versión básica: honesta (dice que es el juego base) y con el color del socio", () => {
    const draft = basicGameDraft({ title: "Taco Run", summary: "Corre taco corre", color: "#FF6600", leaderboard: false, suggestions: [] });
    expect(draft.kind).toBe("juego");
    expect(draft.summary).toMatch(/^Versión básica: el juego base de LYRA/);
    expect(draft.files.find((file) => file.path === GAME_CODE_PATH)?.content).toContain("#FF6600");
    expect(gameManifestFromFiles(basicGameFiles({ title: "X", summary: "y", leaderboard: true }))?.leaderboard).toBe(true);
  });
});

describe("precio del modo juego", () => {
  it("10 créditos, 20 con ranking en línea; configurable por entorno", () => {
    expect(builderPrice("juego", {})).toBe(10);
    expect(builderPrice("juego_ranking", {})).toBe(20);
    expect(builderPrice("juego", { VEGA_BUILDER_PRICE_GAME: "12" })).toBe(12);
    expect(builderPrice("juego_ranking", { VEGA_BUILDER_PRICE_GAME_RANKING: "25" })).toBe(25);
    expect(buildCharge("juego", false, {})).toEqual({ price: 10, label: "juego" });
    expect(buildCharge("juego", true, {})).toEqual({ price: 20, label: "juego con ranking en línea" });
    expect(buildCharge("app", true, {}).price).toBe(20);
    expect(buildCharge("sitio", true, {}).price).toBe(10);
  });
});

describe("plantilla oficial del Marketplace", () => {
  it("Bloques Neón está entre las oficiales, es un juego con ranking y vista previa", () => {
    const template = neonBlocksTemplate();
    expect(officialTemplates.map((item) => item.slug)).toContain("oficial-juego-bloques-neon");
    expect(template.kind).toBe("juego");
    expect(template.previewHtml).toContain("LyraGame");
    expect(gameManifestFromFiles(template.files)?.leaderboard).toBe(true);
    expect(isGameProject(Object.fromEntries(template.files.map((file) => [file.path, file.content])))).toBe(true);
  });
});
