// Versión básica del modo juego: el juego base de LYRA («Bloques Neón») con el título y el color
// del socio. Se usa como respaldo honesto si el generador no puede terminar (y se reembolsa).
import { gameManifest, gameProjectFiles, lyraGameColors } from "@/lib/games/spec";
import { neonBlocksSource } from "@/lib/games/template-neon";

export function basicGameFiles(input: { title: string; summary: string; color?: string; leaderboard: boolean }) {
  const primary = input.color && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : lyraGameColors.primary;
  const colors = { ...lyraGameColors, primary };
  const code = neonBlocksSource({ title: input.title, colors, leaderboard: input.leaderboard });
  const manifest = gameManifest(input.title, { genre: "arcade", leaderboard: input.leaderboard, maxScore: 2_000_000, maxPerSecond: 3_000, colors });
  return gameProjectFiles({ title: input.title, summary: input.summary, code, manifest });
}

export function basicGameDraft(input: { title: string; summary: string; color?: string; leaderboard: boolean; suggestions: string[] }) {
  const summary = `Versión básica: el juego base de LYRA (rompebloques) con tu título y color. ${input.summary}`.slice(0, 280);
  const files = basicGameFiles({ ...input, summary });
  return {
    title: input.title,
    kind: "juego" as const,
    summary,
    files: Object.keys(files)
      .sort()
      .map((path) => ({ path, content: files[path] })),
    suggestions: input.suggestions,
  };
}
