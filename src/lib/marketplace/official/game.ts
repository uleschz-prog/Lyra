// Plantilla oficial del modo juego: «Bloques Neón», rompebloques con los colores de LYRA y
// ranking en línea (top 10 al publicarlo en LYRA). Se arma con el mismo motor que usa Vega.
import { basicGameFiles } from "@/lib/games/basic";
import { neonGameDefaults } from "@/lib/games/template-neon";

import type { OfficialTemplate } from "./index";

const summary = "Rompebloques neón para celular y computadora: niveles, poderes, combos y ranking en línea.";

function files() {
  const map = basicGameFiles({ title: neonGameDefaults.title, summary, leaderboard: true });
  return Object.keys(map)
    .sort()
    .map((path) => ({ path, content: map[path] }));
}

export function neonBlocksTemplate(): OfficialTemplate {
  const list = files();
  return {
    slug: "oficial-juego-bloques-neon",
    kind: "juego",
    title: neonGameDefaults.title,
    summary,
    description:
      "Juego HTML5 listo para publicar: barra con arrastre o flechas, bolas con estela, bloques resistentes, poderes (barra ancha, multibola, cámara lenta y vida extra), combos y niveles que suben de dificultad. Se pausa solo al cambiar de pestaña, el sonido se genera en código y trae ranking en línea (top 10 con nombre) que funciona al publicarlo en LYRA. Pídele a Vega que cambie colores, velocidad, textos o poderes.",
    category: "Juegos",
    tags: ["juego", "arcade", "rompebloques", "neón", "ranking"],
    generator: "vega-v2",
    files: list,
    previewHtml: list.find((file) => file.path === "index.html")?.content ?? null,
    agentConfig: null,
  };
}
