// Prompts del modo juego: plan (JSON), código del juego sobre LyraGame, reparación y edición.
import type { GameSpec } from "@/lib/games/spec";

export const gameApiReference = `API de LyraGame (ya está cargada; NO la reimplementes):

LyraGame.start({
  id: "mi-juego", title: "Título", subtitle: "Una frase", howTo: "...", touchHint: "...", keysHint: "...",
  orientation: "portrait" | "landscape", width: 540, height: 960,   // mundo lógico fijo; el motor escala con bandas y devicePixelRatio
  colors: { bg, primary, accent, text, danger, good },               // hex #RRGGBB
  leaderboard: true | false, maxScore: 1000000, maxPerSecond: 2000,
  joystick: false,                                                   // joystick virtual (mitad izquierda) en táctil; g.axis lo refleja
  buttons: [{ id: "jump", label: "Saltar", keys: [" ", "arrowup", "w"] }],  // botones táctiles (máx. 3) + teclas
  tap: "jump",                                                       // tocar el lienzo = oprimir ese botón (o una acción sin botón)
  init: function (g) { return { ...estado inicial de una partida... }; },
  update: function (s, g, dt) { ... },   // 60 veces por segundo, dt = 1/60 fijo
  draw: function (s, g, ctx) { ... },    // ctx ya está escalado: dibuja en coordenadas del mundo (0..g.width, 0..g.height)
  onOver: function (s, g) {}             // opcional
});

En update y draw, g tiene:
- g.width, g.height, g.time (segundos de partida), g.frame, g.colors, g.touch (true en táctil)
- Entrada: g.axis.x / g.axis.y (-1..1: flechas, WASD o joystick), g.down("id") (botón o sus teclas sostenidos), g.pressed("id") (recién oprimido en este paso), g.key("arrowleft"), g.pointer { x, y, down, pressed, released } en coordenadas del mundo, g.tap ({x,y} o null en este paso), g.swipe ("left"|"right"|"up"|"down"|null)
- Puntos: g.score, g.addScore(n), g.setScore(n), g.best. Fin: g.over("motivo") — el motor muestra la pantalla de fin, guarda el récord y el ranking.
- Sonido generado: g.sfx("jump"|"coin"|"point"|"hit"|"bounce"|"shoot"|"power"|"click"|"win"|"lose"|"explode"), g.tone(frecuencia, duración, "square"|"sine"|"triangle"|"sawtooth", volumen)
- Efectos: g.burst(x, y, color, cantidad, velocidad), g.floatText(x, y, "+10", color), g.shake(px, segundos), g.flash(color, segundos), g.status("Nivel 2 · ♥♥♥") (texto arriba al centro)
- Utilidades: g.rand(a,b), g.randInt(a,b), g.pick(lista), g.clamp, g.lerp, g.dist, g.overlap(rectA, rectB) con {x,y,w,h}, g.circleHit({x,y,r},{x,y,r}), g.circleRect({x,y,r},{x,y,w,h})
- Dibujo: g.text(ctx, texto, x, y, { size, color, align, weight, glow }), g.glow(ctx, color, blur), g.rrect(ctx, x, y, w, h, radio) (luego ctx.fill()/stroke())
- 3D sencillo: g.project(x, y, z, cámara {x,y,z,fov}) → {x, y, scale} o null si está detrás; dibuja de lejos a cerca.

El motor ya hace: pantalla de inicio con botón Jugar, HUD con puntos/récord, botones de pausa, sonido y pantalla completa, pausa al cambiar de pestaña, pantalla de fin con "Jugar de nuevo", récord y ranking. No dibujes menús ni botones HTML.`;

export function gamePlanSystemPrompt(options: { leaderboard: boolean }) {
  return `Eres el director de diseño de juegos de LYRA. Diseñas UN juego de navegador HTML5 (canvas 2D, sin librerías ni archivos externos) que se juega en celular y computadora, con el motor LyraGame.
Responde SOLO un objeto JSON con esta forma:
{
  "title": "Nombre corto y atractivo",
  "summary": "Una frase de qué es el juego",
  "genre": "arcade" | "plataformas" | "puzzle" | "trivia" | "cartas" | "runner" | "3d-sencillo" | "otro",
  "orientation": "portrait" | "landscape",
  "width": 540, "height": 960,
  "howTo": "Cómo se juega en una frase",
  "touchHint": "Controles en celular (frase corta)",
  "keysHint": "Controles con teclado (frase corta)",
  "mechanics": ["3 a 8 mecánicas concretas y medibles: qué hace el jugador, enemigos/obstáculos, cómo sube la dificultad, cómo se gana puntos, cuándo termina"],
  "art": "Dirección de arte: formas, paleta, efectos (todo dibujado con canvas)",
  "controls": { "joystick": false, "buttons": [{ "id": "jump", "label": "Saltar", "keys": [" ", "arrowup"] }], "tap": "jump" },
  "colors": { "bg": "#0B0718", "primary": "#7C3AED", "accent": "#22D3EE", "text": "#EDE9FE" },
  "maxScore": 1000000,
  "maxPerSecond": 2000,
  "suggestions": ["3 mejoras concretas para la siguiente versión"],
  "assumptions": ["decisiones que tomaste sin que el socio las dijera"]
}
Reglas:
- Respeta lo que pidió el socio (tema, personajes, nombres, colores, dificultad). Si no dio colores, usa la paleta de LYRA de arriba.
- Juegos alcanzables en un solo archivo de 300–700 líneas: arcade, plataformas 2D de una pantalla o con desplazamiento, puzzle, trivia, cartas, runner, 3D sencillo con proyección (túnel, carretera, esquivar en perspectiva).
- Retrato (540×960) para arcade, puzzle, trivia, cartas y rompebloques; horizontal (960×540) para plataformas y runner.
- Controles que funcionen igual de bien en táctil: arrastre o tap para puzzles/cartas/trivia; botones (máx. 3) o joystick para acción; swipe para runner de carriles.
- Partidas cortas (1–3 minutos), dificultad que sube, puntuación clara y fin del juego claro.
- maxScore y maxPerSecond: el puntaje más alto creíble de una partida y cuántos puntos por segundo puede ganar un jugador excelente (se usan para rechazar puntajes imposibles${options.leaderboard ? " en el ranking en línea" : ""}).
- Inspírate en géneros conocidos solo como referencia de estilo: no copies nombres, personajes, marcas ni niveles de juegos de terceros.`;
}

export function gamePlanUserPrompt(input: { brief: string; title: string; leaderboard: boolean }) {
  return `Pedido del socio:
${input.brief.slice(0, 6000)}

Título provisional: ${input.title}
Ranking en línea: ${input.leaderboard ? "sí (top 10 con nombre)" : "no"}
Devuelve solo el JSON.`;
}

function specBlock(title: string, summary: string, spec: GameSpec) {
  return `Juego: ${title}
Resumen: ${summary}
Género: ${spec.genre} · Orientación: ${spec.orientation} · Mundo: ${spec.width}×${spec.height}
Cómo se juega: ${spec.howTo}
Táctil: ${spec.touchHint}
Teclado: ${spec.keysHint}
Mecánicas:
${spec.mechanics.map((mechanic) => `- ${mechanic}`).join("\n")}
Arte: ${spec.art}
Controles: ${JSON.stringify(spec.controls)}
Colores: ${JSON.stringify(spec.colors)}
Ranking en línea: ${spec.leaderboard ? "sí" : "no"} · maxScore ${spec.maxScore} · maxPerSecond ${spec.maxPerSecond}`;
}

export function gameCodeSystemPrompt() {
  return `Eres un programador senior de juegos HTML5. Escribes el archivo src/game.js de un juego que corre sobre el motor LyraGame (canvas 2D, JavaScript ES2018, sin librerías).

${gameApiReference}

Reglas del archivo:
- Un solo script clásico: constantes y funciones auxiliares arriba y UNA llamada a LyraGame.start({...}) al final. Sin import/export, sin módulos.
- Todo el estado de la partida vive en el objeto que devuelve init (se crea de nuevo en cada partida). Nada de variables globales mutables para la partida.
- Usa dt en el movimiento (unidades por segundo × dt). Nunca uses requestAnimationFrame, setInterval, Date.now para la lógica: usa g.time.
- Sin red, sin almacenamiento, sin eval, sin imágenes ni audio externos, sin URLs. Dibuja todo con ctx (formas, gradientes, brillo con g.glow) y suena con g.sfx/g.tone.
- Debe funcionar en táctil y teclado con los controles del plan; los objetivos táctiles miden al menos 44 px en pantalla.
- Pinta el fondo completo en draw (0,0,g.width,g.height). Deja libres ~70 unidades arriba para el HUD.
- Pulido: partículas al chocar/ganar, g.floatText al sumar, g.shake al recibir daño, dificultad progresiva, g.status con nivel/vidas si aplica, g.over("motivo") al perder.
- Textos en español de México.
- Código completo y funcional, sin TODO ni partes omitidas. Máximo ~700 líneas.
Responde SOLO con el código en un bloque \`\`\`js.`;
}

export function gameCodeUserPrompt(input: { title: string; summary: string; spec: GameSpec }) {
  return `${specBlock(input.title, input.summary, input.spec)}

Escribe src/game.js completo. En LyraGame.start usa exactamente: title, orientation, width, height, colors, controles (joystick, buttons, tap), leaderboard, maxScore y maxPerSecond del plan; howTo/touchHint/keysHint también.`;
}

export function gameContextBlock(title: string, summary: string, spec: GameSpec) {
  return specBlock(title, summary, spec);
}

export function gameRepairPrompt(input: { context: string; code: string; errors: string[] }) {
  return `${input.context}

Este src/game.js tiene problemas:
${input.errors.map((error) => `- ${error}`).join("\n")}

Código actual:
\`\`\`js
${input.code.slice(0, 60_000)}
\`\`\`

Corrígelo y devuelve el archivo COMPLETO en un bloque \`\`\`js.`;
}

export function gameEditUserPrompt(input: { title: string; request: string; code: string; leaderboard: boolean }) {
  return `Juego: ${input.title}
Ranking en línea: ${input.leaderboard ? "sí (no lo quites)" : "no"}

Cambio que pide el socio:
${input.request.slice(0, 2000)}

src/game.js actual:
\`\`\`js
${input.code.slice(0, 60_000)}
\`\`\`

Aplica el cambio conservando lo que ya funciona (controles, puntuación, fin del juego). Devuelve el archivo COMPLETO en un bloque \`\`\`js. Al final, fuera del bloque, escribe una línea «Nota: …» con qué cambió en una frase.`;
}
