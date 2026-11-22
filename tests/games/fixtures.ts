import type { BuilderModel } from "@/lib/builder/model";
import { neonBlocksSource } from "@/lib/games/template-neon";

export const gamePlanJson = {
  title: "Taco Esquiva",
  summary: "Un taco que esquiva chiles y junta limones.",
  genre: "arcade",
  orientation: "portrait",
  width: 540,
  height: 960,
  howTo: "Esquiva los chiles y junta limones.",
  touchHint: "Arrastra para moverte.",
  keysHint: "Flechas para moverte.",
  mechanics: ["Chiles caen cada vez más rápido", "Limones suman 10 puntos", "Tres vidas"],
  art: "Neón morado y cian",
  controls: { joystick: false, buttons: [{ id: "dash", label: "Turbo", keys: ["space", "x", "rm -rf"] }], tap: "dash" },
  colors: { bg: "#0B0718", primary: "#7C3AED", accent: "#22D3EE", text: "#EDE9FE" },
  maxScore: 50000,
  maxPerSecond: 200,
  suggestions: ["Agregar un jefe final"],
  assumptions: ["Elegí colores de LYRA"],
};

/** Un juego mínimo válido sobre LyraGame. */
export const tinyGame = `var SPEED = 200;
LyraGame.start({
  title: "Taco Esquiva", orientation: "portrait", width: 540, height: 960, leaderboard: true, maxScore: 50000, maxPerSecond: 200,
  init: function (g) { return { x: 270, chiles: [], t: 0 }; },
  update: function (s, g, dt) {
    s.x = g.clamp(s.x + g.axis.x * SPEED * dt, 20, 520);
    s.t += dt;
    if (s.t > 1) { s.t = 0; s.chiles.push({ x: g.rand(20, 520), y: 0, r: 12 }); g.addScore(1); }
    for (var i = 0; i < s.chiles.length; i++) { s.chiles[i].y += 220 * dt; if (g.circleHit(s.chiles[i], { x: s.x, y: 900, r: 20 })) g.over("Te picó un chile."); }
  },
  draw: function (s, g, ctx) {
    ctx.fillStyle = g.colors.bg; ctx.fillRect(0, 0, g.width, g.height);
    ctx.fillStyle = g.colors.accent; ctx.beginPath(); ctx.arc(s.x, 900, 20, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < s.chiles.length; i++) { ctx.fillStyle = "#F43F5E"; ctx.beginPath(); ctx.arc(s.chiles[i].x, s.chiles[i].y, 12, 0, Math.PI * 2); ctx.fill(); }
  }
});
`;

export const brokenGame = "LyraGame.start({ init: function (g) { return {}; }, update: function (s, g, dt) { fetch('https://evil.example.com'); }, draw: function (s, g, ctx) { ctx.fillRect(0,0,1,1) ; }\n";

/** Modelo de prueba: plan JSON y luego las respuestas de código en orden. */
export function gameModel(codes: string[], options: { plan?: unknown; note?: string } = {}): BuilderModel & { calls: { purpose: string; user: string }[] } {
  const calls: { purpose: string; user: string }[] = [];
  let index = 0;
  const usage = { provider: "gemini", model: "gemini-2.5-flash", inputTokens: 10, outputTokens: 20, costUsd: 0 } as never;
  const model = (async (input: Parameters<BuilderModel>[0]) => {
    calls.push({ purpose: input.purpose, user: input.user });
    if (input.purpose === "plan") return { ok: true as const, text: JSON.stringify(options.plan ?? gamePlanJson), usage };
    const code = codes[Math.min(index, codes.length - 1)];
    index += 1;
    return { ok: true as const, text: "```js\n" + code + "\n```" + (options.note ? `\nNota: ${options.note}` : ""), usage };
  }) as unknown as BuilderModel & { calls: typeof calls };
  model.calls = calls;
  return model;
}

export const neonCode = neonBlocksSource();
