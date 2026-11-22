// Juego oficial de ejemplo (y respaldo del modo juego): «Bloques Neón», un rompebloques con los
// colores de LYRA. Usa solo la API de LyraGame, igual que los juegos que escribe el modelo.
// Texto JS sin comillas invertidas ni «${» (lo verifica una prueba).

export const neonGameDefaults = {
  title: "Bloques Neón",
  colors: { bg: "#0B0718", primary: "#7C3AED", accent: "#22D3EE", text: "#EDE9FE" },
};

/** Código del juego. `title` y colores se pueden cambiar sin tocar la lógica. */
export function neonBlocksSource(input: { title?: string; colors?: Partial<typeof neonGameDefaults.colors>; leaderboard?: boolean } = {}) {
  const safe = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");
  const title = safe((input.title ?? neonGameDefaults.title).slice(0, 60));
  const colors = safe({ ...neonGameDefaults.colors, ...(input.colors ?? {}), danger: "#F43F5E", good: "#34D399", pink: "#F472B6" });
  return String.raw`/* Bloques Neón · rompebloques sobre LyraGame. */
var PALETTE = ["#A78BFA", "#8B5CF6", "#7C3AED", "#22D3EE", "#06B6D4", "#F472B6"];
var COLS = 8, BRICK_W = 58, BRICK_H = 24, GAP = 6, TOP = 120;

function buildLevel(level) {
  var bricks = [];
  var rows = Math.min(4 + level, 9);
  var left = (540 - (COLS * BRICK_W + (COLS - 1) * GAP)) / 2;
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < COLS; c++) {
      if (level % 2 === 0 && (r + c) % 5 === 0) continue;
      if (level >= 3 && r === 1 && (c === 0 || c === COLS - 1)) continue;
      var tough = level >= 2 && (r === 0 || (level >= 4 && r === 2));
      bricks.push({ x: left + c * (BRICK_W + GAP), y: TOP + r * (BRICK_H + GAP), w: BRICK_W, h: BRICK_H, hp: tough ? 2 : 1, color: PALETTE[r % PALETTE.length], points: (rows - r) * 10, hit: 0 });
    }
  }
  return bricks;
}

function newBall(s, g) {
  return { x: s.paddle.x + s.paddle.w / 2, y: s.paddle.y - 10, r: 8, vx: 0, vy: 0, stuck: true, trail: [] };
}

function launch(s, ball) {
  var angle = (-Math.PI / 2) + (Math.random() * 0.6 - 0.3);
  ball.vx = Math.cos(angle) * s.speed; ball.vy = Math.sin(angle) * s.speed; ball.stuck = false;
}

LyraGame.start({
  id: "bloques-neon",
  title: ${title},
  subtitle: "Rompe todos los bloques sin dejar caer la bola.",
  touchHint: "Arrastra el dedo para mover la barra. Toca para lanzar.",
  keysHint: "Flechas o ratón para mover · Espacio para lanzar · P para pausa.",
  orientation: "portrait",
  width: 540,
  height: 900,
  colors: ${colors},
  leaderboard: ${input.leaderboard === false ? "false" : "true"},
  maxScore: 2000000,
  maxPerSecond: 3000,
  buttons: [],
  tap: "launch",
  init: function (g) {
    var s = { level: 1, lives: 3, combo: 0, speed: 430, wideT: 0, slowT: 0, idle: 0, drops: [], stars: [], lastPointerX: null };
    s.paddle = { x: 270 - 48, y: 820, w: 96, h: 14, baseW: 96 };
    s.bricks = buildLevel(1);
    s.balls = [newBall(s, g)];
    for (var i = 0; i < 60; i++) s.stars.push({ x: g.rand(0, 540), y: g.rand(0, 900), z: g.rand(0.2, 1) });
    g.status("Nivel 1 · ♥♥♥");
    return s;
  },
  update: function (s, g, dt) {
    var p = s.paddle;
    // Barra: puntero (arrastre o ratón) o teclado.
    if (s.lastPointerX === null) s.lastPointerX = g.pointer.x;
    if (g.pointer.down || Math.abs(g.pointer.x - s.lastPointerX) > 0.5) {
      p.x = g.lerp(p.x, g.pointer.x - p.w / 2, 0.45);
      s.lastPointerX = g.pointer.x;
    }
    p.x += g.axis.x * 640 * dt;
    var targetW = s.wideT > 0 ? p.baseW * 1.6 : p.baseW;
    p.w = g.lerp(p.w, targetW, 0.15);
    p.x = g.clamp(p.x, 8, 540 - 8 - p.w);
    if (s.wideT > 0) s.wideT -= dt;
    if (s.slowT > 0) s.slowT -= dt;
    var speedFactor = s.slowT > 0 ? 0.7 : 1;

    var launchNow = g.pressed("launch") || g.key(" ") || g.key("arrowup");
    s.idle += dt;
    for (var b = s.balls.length - 1; b >= 0; b--) {
      var ball = s.balls[b];
      if (ball.stuck) {
        ball.x = p.x + p.w / 2; ball.y = p.y - ball.r - 2;
        if (launchNow || s.idle > 3) { launch(s, ball); g.sfx("shoot"); }
        continue;
      }
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 8) ball.trail.shift();
      var steps = 3;
      for (var k = 0; k < steps; k++) {
        ball.x += ball.vx * speedFactor * dt / steps;
        ball.y += ball.vy * speedFactor * dt / steps;
        if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); g.sfx("bounce"); }
        if (ball.x > 540 - ball.r) { ball.x = 540 - ball.r; ball.vx = -Math.abs(ball.vx); g.sfx("bounce"); }
        if (ball.y < 70 + ball.r) { ball.y = 70 + ball.r; ball.vy = Math.abs(ball.vy); g.sfx("bounce"); }
        // Barra: el ángulo depende de dónde pega.
        if (ball.vy > 0 && g.circleRect(ball, p)) {
          var rel = g.clamp((ball.x - (p.x + p.w / 2)) / (p.w / 2), -1, 1);
          var ang = -Math.PI / 2 + rel * 1.05;
          var sp = Math.min(Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * 1.01, 680);
          ball.vx = Math.cos(ang) * sp; ball.vy = Math.sin(ang) * sp;
          ball.y = p.y - ball.r - 1;
          s.combo = 0;
          g.sfx("bounce");
          g.burst(ball.x, p.y, g.colors.accent, 6, 120);
        }
        // Bloques.
        for (var i = s.bricks.length - 1; i >= 0; i--) {
          var br = s.bricks[i];
          if (!g.circleRect(ball, br)) continue;
          var cx = g.clamp(ball.x, br.x, br.x + br.w), cy = g.clamp(ball.y, br.y, br.y + br.h);
          if (Math.abs(ball.x - cx) > Math.abs(ball.y - cy)) ball.vx = -ball.vx; else ball.vy = -ball.vy;
          br.hp -= 1; br.hit = 0.15;
          s.combo += 1;
          if (br.hp <= 0) {
            var mult = Math.min(1 + Math.floor(s.combo / 3), 5);
            var pts = br.points * mult;
            g.addScore(pts);
            g.floatText(br.x + br.w / 2, br.y, "+" + pts + (mult > 1 ? " x" + mult : ""), br.color);
            g.burst(br.x + br.w / 2, br.y + br.h / 2, br.color, 16, 260);
            g.sfx(mult > 2 ? "coin" : "point");
            if (Math.random() < 0.13) s.drops.push({ x: br.x + br.w / 2, y: br.y, kind: g.pick(["wide", "multi", "slow", "wide", "multi", "life"]) });
            s.bricks.splice(i, 1);
          } else {
            g.sfx("bounce");
          }
          break;
        }
      }
      if (ball.y > 900 + 20) s.balls.splice(b, 1);
    }

    // Poderes que caen.
    for (var d = s.drops.length - 1; d >= 0; d--) {
      var drop = s.drops[d];
      drop.y += 170 * dt;
      if (g.overlap({ x: drop.x - 14, y: drop.y - 10, w: 28, h: 20 }, p)) {
        if (drop.kind === "wide") { s.wideT = 10; g.floatText(drop.x, p.y - 20, "Barra ancha", g.colors.accent); }
        if (drop.kind === "slow") { s.slowT = 8; g.floatText(drop.x, p.y - 20, "Cámara lenta", g.colors.accent); }
        if (drop.kind === "life") { s.lives = Math.min(5, s.lives + 1); g.floatText(drop.x, p.y - 20, "+1 vida", g.colors.good); }
        if (drop.kind === "multi" && s.balls.length) {
          var src = s.balls[0];
          for (var m = 0; m < 2 && s.balls.length < 6; m++) {
            var nb = { x: src.x, y: src.y, r: 8, vx: 0, vy: 0, stuck: false, trail: [] };
            var a2 = -Math.PI / 2 + (m ? 0.5 : -0.5);
            nb.vx = Math.cos(a2) * s.speed; nb.vy = Math.sin(a2) * s.speed;
            s.balls.push(nb);
          }
          g.floatText(drop.x, p.y - 20, "Multibola", g.colors.pink);
        }
        g.sfx("power"); g.flash(g.colors.accent, 0.15);
        s.drops.splice(d, 1);
      } else if (drop.y > 920) s.drops.splice(d, 1);
    }

    // Bola perdida.
    if (!s.balls.length) {
      s.lives -= 1; s.combo = 0; s.wideT = 0; s.slowT = 0; s.drops = [];
      g.shake(10, 0.35); g.flash(g.colors.danger, 0.25); g.sfx("hit");
      if (s.lives <= 0) { g.over("Se acabaron las vidas."); s.lives = 0; }
      else { s.balls = [newBall(s, g)]; s.idle = 0; }
    }

    // Nivel completo.
    if (!s.bricks.length) {
      g.addScore(500 * s.level);
      g.floatText(270, 450, "¡Nivel " + s.level + " completo! +" + (500 * s.level), g.colors.good);
      g.sfx("win");
      s.level += 1; s.speed = Math.min(430 + (s.level - 1) * 30, 620);
      s.bricks = buildLevel(s.level); s.drops = []; s.idle = 0;
      s.balls = [newBall(s, g)];
    }
    for (var h = 0; h < s.bricks.length; h++) if (s.bricks[h].hit > 0) s.bricks[h].hit -= dt;
    for (var t = 0; t < s.stars.length; t++) { var st = s.stars[t]; st.y += st.z * 22 * dt; if (st.y > 900) { st.y = 0; st.x = g.rand(0, 540); } }
    var hearts = ""; for (var q = 0; q < s.lives; q++) hearts += "♥";
    g.status("Nivel " + s.level + " · " + hearts);
  },
  draw: function (s, g, ctx) {
    var bg = ctx.createLinearGradient(0, 0, 0, 900);
    bg.addColorStop(0, "#140C2E"); bg.addColorStop(1, g.colors.bg);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 540, 900);
    // Estrellas y rejilla en perspectiva.
    for (var i = 0; i < s.stars.length; i++) { var st = s.stars[i]; ctx.globalAlpha = 0.25 + st.z * 0.5; ctx.fillStyle = "#C4B5FD"; ctx.fillRect(st.x, st.y, st.z * 2.2, st.z * 2.2); }
    ctx.globalAlpha = 0.22; ctx.strokeStyle = g.colors.primary; ctx.lineWidth = 1;
    for (var gx = -6; gx <= 6; gx++) { ctx.beginPath(); ctx.moveTo(270 + gx * 18, 700); ctx.lineTo(270 + gx * 110, 900); ctx.stroke(); }
    for (var gy = 0; gy < 7; gy++) { var yy = 700 + Math.pow(gy / 6, 1.8) * 200 + ((g.time * 30) % 30) * (gy / 6); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(540, yy); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Techo.
    ctx.fillStyle = g.colors.primary; ctx.globalAlpha = 0.5; ctx.fillRect(0, 68, 540, 2); ctx.globalAlpha = 1;
    // Bloques.
    for (var b = 0; b < s.bricks.length; b++) {
      var br = s.bricks[b];
      ctx.save();
      g.glow(ctx, br.color, br.hit > 0 ? 26 : 12);
      ctx.fillStyle = br.hit > 0 ? "#FFFFFF" : br.color;
      g.rrect(ctx, br.x, br.y, br.w, br.h, 6); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.25)"; g.rrect(ctx, br.x + 3, br.y + 3, br.w - 6, 6, 3); ctx.fill();
      if (br.hp > 1) { ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2; g.rrect(ctx, br.x + 1, br.y + 1, br.w - 2, br.h - 2, 6); ctx.stroke(); }
      ctx.restore();
    }
    // Poderes.
    for (var d = 0; d < s.drops.length; d++) {
      var drop = s.drops[d], col = drop.kind === "life" ? g.colors.good : drop.kind === "multi" ? g.colors.pink : g.colors.accent;
      ctx.save(); g.glow(ctx, col, 16); ctx.fillStyle = col; g.rrect(ctx, drop.x - 14, drop.y - 10, 28, 20, 10); ctx.fill(); ctx.restore();
      g.text(ctx, drop.kind === "wide" ? "↔" : drop.kind === "multi" ? "●●" : drop.kind === "slow" ? "◷" : "♥", drop.x, drop.y + 1, { size: 13, color: "#0B0718" });
    }
    // Barra.
    var p = s.paddle;
    ctx.save();
    var pg = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
    pg.addColorStop(0, g.colors.primary); pg.addColorStop(1, g.colors.accent);
    g.glow(ctx, g.colors.accent, 20); ctx.fillStyle = pg; g.rrect(ctx, p.x, p.y, p.w, p.h, 7); ctx.fill();
    ctx.restore();
    // Bolas con estela.
    for (var k = 0; k < s.balls.length; k++) {
      var ball = s.balls[k];
      for (var t = 0; t < ball.trail.length; t++) { var tr = ball.trail[t]; ctx.globalAlpha = (t / ball.trail.length) * 0.35; ctx.fillStyle = g.colors.accent; ctx.beginPath(); ctx.arc(tr.x, tr.y, ball.r * (t / ball.trail.length), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.save(); g.glow(ctx, "#FFFFFF", 18); ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (s.balls.length && s.balls[0].stuck) g.text(ctx, g.touch ? "Toca para lanzar" : "Espacio para lanzar", 270, 770, { size: 18, color: g.colors.text, weight: 700 });
  }
});
`;
}
