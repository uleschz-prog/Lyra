// Modo juego: motor confiable sobre el que el modelo escribe cada juego (LyraGame). El modelo
// solo escribe la lógica (init/update/draw); el bucle de paso fijo, el lienzo responsivo con
// devicePixelRatio, los controles táctiles y de teclado, la pausa, las pantallas de inicio y
// fin, el sonido generado con WebAudio, el récord local y el ranking en línea viven aquí.
// Se escribe como texto JS (sin comillas invertidas ni «${»: lo verifica una prueba) para
// incrustarlo en el HTML del juego.

export const GAME_RUNTIME_VERSION = 1;

export const gameRuntimeSource = String.raw`/* LyraGame v1 · motor de juegos de LYRA (canvas 2D, sin dependencias). */
(function () {
  "use strict";
  var W = window, D = document;
  var STEP = 1 / 60;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function circleHit(a, b) { return dist(a.x, a.y, b.x, b.y) < a.r + b.r; }
  function circleRect(c, r) {
    var nx = clamp(c.x, r.x, r.x + r.w), ny = clamp(c.y, r.y, r.y + r.h);
    var dx = c.x - nx, dy = c.y - ny;
    return dx * dx + dy * dy < c.r * c.r;
  }
  function esc(text) { return String(text).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }

  /* ---------- Almacenamiento (en /s/ el documento tiene origen opaco: puede no haber localStorage) ---------- */
  var store = (function () {
    var mem = {}, ok = false;
    try { var k = "__lyra_probe"; W.localStorage.setItem(k, "1"); W.localStorage.removeItem(k); ok = true; } catch (e) { ok = false; }
    return {
      persistent: ok,
      get: function (key) { if (ok) { try { return W.localStorage.getItem(key); } catch (e) {} } return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
      set: function (key, value) { mem[key] = String(value); if (ok) { try { W.localStorage.setItem(key, String(value)); } catch (e) {} } }
    };
  })();

  /* ---------- Sonido generado en código (WebAudio, sin archivos) ---------- */
  var audio = { ctx: null, master: null, muted: false };
  function audioUnlock() {
    var AC = W.AudioContext || W.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audio.ctx) {
        audio.ctx = new AC();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = 0.45;
        audio.master.connect(audio.ctx.destination);
      }
      if (audio.ctx.state === "suspended") audio.ctx.resume();
    } catch (e) { audio.ctx = null; }
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!audio.ctx || audio.muted || !(freq > 0)) return;
    try {
      var t = audio.ctx.currentTime + (delay || 0), d = Math.max(0.02, dur || 0.1);
      var o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(clamp(vol || 0.18, 0.001, 1), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(audio.master);
      o.start(t); o.stop(t + d + 0.03);
    } catch (e) {}
  }
  function noise(dur, vol, delay) {
    if (!audio.ctx || audio.muted) return;
    try {
      var len = Math.floor(audio.ctx.sampleRate * dur), buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate), data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = audio.ctx.createBufferSource(), g = audio.ctx.createGain(), f = audio.ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 1400;
      g.gain.value = vol || 0.25;
      src.buffer = buf; src.connect(f); f.connect(g); g.connect(audio.master);
      src.start(audio.ctx.currentTime + (delay || 0));
    } catch (e) {}
  }
  var sounds = {
    jump: function () { tone(320, 0.16, "square", 0.14, 720); },
    coin: function () { tone(880, 0.07, "square", 0.12); tone(1320, 0.12, "square", 0.12, 0, 0.06); },
    point: function () { tone(660, 0.08, "triangle", 0.16, 990); },
    hit: function () { noise(0.18, 0.3); tone(140, 0.18, "sawtooth", 0.12, 60); },
    bounce: function () { tone(520, 0.05, "triangle", 0.14); },
    shoot: function () { tone(900, 0.09, "square", 0.08, 300); },
    power: function () { tone(440, 0.09, "triangle", 0.14); tone(660, 0.09, "triangle", 0.14, 0, 0.08); tone(990, 0.16, "triangle", 0.14, 0, 0.16); },
    click: function () { tone(700, 0.04, "square", 0.08); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.16, "triangle", 0.16, 0, i * 0.1); }); },
    lose: function () { tone(392, 0.2, "triangle", 0.16, 0, 0); tone(330, 0.2, "triangle", 0.16, 0, 0.18); tone(262, 0.4, "triangle", 0.16, 180, 0.36); },
    explode: function () { noise(0.45, 0.4); tone(90, 0.4, "sawtooth", 0.12, 40); }
  };
  function sfx(name) { var fn = sounds[name] || sounds.click; fn(); }

  /* ---------- Estilos y pantallas ---------- */
  function injectStyle(c) {
    var css = [
      "html,body{margin:0;height:100%;overflow:hidden;background:" + c.bg + ";color:" + c.text + ";overscroll-behavior:none;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}",
      "body{position:fixed;inset:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
      "#lg-root{position:fixed;inset:0;overflow:hidden}",
      "#lg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}",
      ".lg-layer{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));box-sizing:border-box;z-index:5}",
      ".lg-layer.on{display:flex}",
      ".lg-card{width:min(440px,100%);max-height:100%;overflow:auto;text-align:center;padding:26px 22px;border-radius:22px;background:rgba(10,8,22,.78);border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.45),0 0 0 1px " + c.primary + "33 inset;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-sizing:border-box}",
      ".lg-title{margin:0 0 8px;font-size:clamp(28px,7vw,44px);line-height:1.05;font-weight:900;letter-spacing:-.02em;color:#fff;text-shadow:0 0 18px " + c.primary + ",0 0 36px " + c.accent + "88}",
      ".lg-sub{margin:0 0 18px;color:" + c.text + "cc;font-size:15px;line-height:1.45}",
      ".lg-btn{appearance:none;border:0;cursor:pointer;font-weight:800;font-size:17px;line-height:1;font-family:inherit;color:#fff;padding:15px 26px;border-radius:999px;background:linear-gradient(135deg," + c.primary + "," + c.accent + ");box-shadow:0 8px 26px " + c.primary + "77;min-width:180px;margin:4px;touch-action:manipulation}",
      ".lg-btn:focus-visible{outline:3px solid #fff;outline-offset:3px}",
      ".lg-btn.ghost{background:rgba(255,255,255,.1);box-shadow:none;min-width:0;font-weight:700;font-size:15px}",
      ".lg-score{font-size:56px;font-weight:900;margin:4px 0;color:#fff;text-shadow:0 0 22px " + c.accent + "}",
      ".lg-small{font-size:13px;color:" + c.text + "aa;margin:6px 0}",
      ".lg-badge{display:inline-block;padding:5px 12px;border-radius:999px;background:" + c.accent + ";color:#06121a;font-weight:800;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}",
      ".lg-board{list-style:none;margin:14px 0 6px;padding:0;text-align:left;font-size:14px}",
      ".lg-board li{display:flex;justify-content:space-between;gap:12px;padding:7px 10px;border-radius:10px}",
      ".lg-board li:nth-child(odd){background:rgba(255,255,255,.05)}",
      ".lg-board li.me{background:" + c.primary + "55}",
      ".lg-board b{font-variant-numeric:tabular-nums}",
      ".lg-form{display:flex;gap:8px;margin:12px 0 4px}",
      ".lg-form input{flex:1;min-width:0;font-weight:600;font-size:16px;font-family:inherit;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;user-select:text;-webkit-user-select:text}",
      ".lg-form .lg-btn{min-width:0;padding:12px 16px;font-size:15px}",
      "#lg-hud{position:absolute;left:0;right:0;top:0;display:none;align-items:flex-start;justify-content:space-between;padding:max(10px,env(safe-area-inset-top)) 12px 0;z-index:4;pointer-events:none}",
      "#lg-hud.on{display:flex}",
      "#lg-hud .sc{font-weight:900;font-size:26px;color:#fff;text-shadow:0 0 12px " + c.accent + ";font-variant-numeric:tabular-nums;line-height:1}",
      "#lg-hud .bs{font-size:12px;color:" + c.text + "aa;margin-top:4px}",
      "#lg-hud .st{position:absolute;left:50%;transform:translateX(-50%);top:max(14px,env(safe-area-inset-top));font-weight:800;font-size:15px;color:#fff;text-shadow:0 0 10px " + c.primary + ";white-space:nowrap}",
      "#lg-hud .tools{display:flex;gap:8px;pointer-events:auto}",
      ".lg-icon{appearance:none;border:0;width:42px;height:42px;border-radius:12px;background:rgba(10,8,22,.55);color:#fff;font-size:18px;cursor:pointer;display:grid;place-items:center;touch-action:manipulation}",
      "#lg-pad{position:absolute;inset:0;z-index:3;pointer-events:none}",
      ".lg-tbtn{position:absolute;pointer-events:auto;width:76px;height:76px;border-radius:50%;background:" + c.primary + "55;border:2px solid " + c.accent + "aa;color:#fff;font-weight:800;font-size:13px;line-height:1.1;font-family:inherit;display:grid;place-items:center;text-align:center;touch-action:none;box-shadow:0 0 18px " + c.primary + "66}",
      ".lg-tbtn.down{background:" + c.accent + "aa}",
      ".lg-joy{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:2px solid " + c.accent + "88;background:rgba(255,255,255,.06);display:none;pointer-events:none}",
      ".lg-joy i{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:" + c.accent + "cc;box-shadow:0 0 16px " + c.accent + "}",
      "@media (max-width:560px){#lg-hud .st{top:calc(max(10px,env(safe-area-inset-top)) + 50px);font-size:14px}}",
      "#lg-error{position:absolute;left:12px;right:12px;bottom:12px;z-index:9;display:none;padding:10px 12px;border-radius:12px;background:#7f1d1d;color:#fff;font-weight:600;font-size:13px;line-height:1.4;font-family:inherit}"
    ].join("\n");
    var tag = D.createElement("style");
    tag.textContent = css;
    D.head.appendChild(tag);
  }

  function el(tag, attrs, html) {
    var node = D.createElement(tag);
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (html != null) node.innerHTML = html;
    return node;
  }

  /* ---------- Ranking en línea (solo publicado en LYRA con ranking activo) ---------- */
  function leaderboard(enabled) {
    var data = W.__LYRA_GAME__ || null;
    var api = enabled && data && typeof data.api === "string" ? data.api : null;
    var lb = { online: Boolean(api), top: [], run: null, loading: false, error: "" };
    function req(path, body) {
      var opts = { method: body ? "POST" : "GET", mode: "cors", credentials: "omit", cache: "no-store" };
      if (body) { opts.headers = { "Content-Type": "text/plain" }; opts.body = JSON.stringify(body); }
      return fetch(api + path, opts).then(function (res) { return res.json().catch(function () { return { ok: false }; }); });
    }
    lb.refresh = function () {
      if (!api) return Promise.resolve(lb);
      lb.loading = true;
      return req("scores").then(function (res) {
        lb.loading = false;
        if (res && res.ok) { lb.top = Array.isArray(res.top) ? res.top : []; lb.run = typeof res.run === "string" ? res.run : null; lb.error = ""; }
        else lb.error = (res && res.error) || "Ranking no disponible.";
        return lb;
      }).catch(function () { lb.loading = false; lb.error = "Sin conexión con el ranking."; return lb; });
    };
    lb.submit = function (name, score) {
      if (!api) return Promise.resolve({ ok: false, error: "El ranking funciona al publicar el juego en LYRA." });
      return req("score", { name: name, score: score, run: lb.run }).then(function (res) {
        if (res && res.ok) { lb.top = Array.isArray(res.top) ? res.top : lb.top; }
        return res || { ok: false };
      }).catch(function () { return { ok: false, error: "Sin conexión con el ranking." }; });
    };
    return lb;
  }

  /* ---------- Motor ---------- */
  function start(config) {
    if (!config || typeof config.init !== "function" || typeof config.update !== "function" || typeof config.draw !== "function") {
      throw new Error("LyraGame.start necesita init, update y draw.");
    }
    var defaults = { bg: "#0B0718", primary: "#7C3AED", accent: "#22D3EE", text: "#EDE9FE", danger: "#F43F5E", good: "#34D399" };
    var colors = {};
    for (var ck in defaults) { var cv = config.colors && config.colors[ck]; colors[ck] = typeof cv === "string" && /^#[0-9a-f]{6}$/i.test(cv) ? cv : defaults[ck]; }
    if (config.colors) for (var extra in config.colors) if (!(extra in colors)) colors[extra] = config.colors[extra];
    var portrait = config.orientation === "portrait";
    var game = {
      width: clamp(Math.round(config.width || (portrait ? 540 : 960)), 200, 4000),
      height: clamp(Math.round(config.height || (portrait ? 960 : 540)), 200, 4000),
      colors: colors,
      title: String(config.title || "Juego"),
      dt: STEP, time: 0, frame: 0, score: 0, best: 0, touch: false,
      axis: { x: 0, y: 0 }, pointer: { x: 0, y: 0, down: false, pressed: false, released: false }, tap: null, swipe: null,
      clamp: clamp, lerp: lerp, rand: rand, randInt: randInt, pick: pick, dist: dist, overlap: overlap, circleHit: circleHit, circleRect: circleRect,
      sfx: sfx, tone: function (f, d, t, v, s) { tone(f, d, t, v, s); }
    };
    var key = "lyra-game:" + (config.id || game.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    game.best = Number(store.get(key + ":best")) || 0;
    var lb = leaderboard(Boolean(config.leaderboard));
    injectStyle(colors);

    var root = el("div", { id: "lg-root" });
    var canvas = el("canvas", { id: "lg-canvas", "aria-label": game.title, role: "img" });
    root.appendChild(canvas);
    var hud = el("div", { id: "lg-hud" }, '<div><div class="sc">0</div><div class="bs"></div></div><div class="st"></div><div class="tools"><button class="lg-icon" data-a="mute" aria-label="Silenciar">🔊</button><button class="lg-icon" data-a="full" aria-label="Pantalla completa">⛶</button><button class="lg-icon" data-a="pause" aria-label="Pausa">❚❚</button></div>');
    var pad = el("div", { id: "lg-pad" });
    var joy = el("div", { class: "lg-joy" }, "<i></i>");
    pad.appendChild(joy);
    var startLayer = el("div", { class: "lg-layer on", id: "lg-start" });
    var pauseLayer = el("div", { class: "lg-layer", id: "lg-pause" });
    var overLayer = el("div", { class: "lg-layer", id: "lg-over" });
    var errorBox = el("div", { id: "lg-error", role: "alert" });
    [hud, pad, startLayer, pauseLayer, overLayer, errorBox].forEach(function (n) { root.appendChild(n); });
    (D.getElementById("game") || D.body).appendChild(root);
    var ctx = canvas.getContext("2d");
    var scoreEl = hud.querySelector(".sc"), bestEl = hud.querySelector(".bs"), statusEl = hud.querySelector(".st");
    var fullBtn = hud.querySelector('[data-a="full"]');
    var canFull = Boolean(D.fullscreenEnabled && root.requestFullscreen);
    if (!canFull) fullBtn.style.display = "none";

    /* Escala: el mundo (width × height) se ajusta a la pantalla con bandas; nitidez con devicePixelRatio. */
    var view = { scale: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 };
    function resize() {
      var cw = W.innerWidth, ch = W.innerHeight, dpr = clamp(W.devicePixelRatio || 1, 1, 2.5);
      view.cw = cw; view.ch = ch; view.dpr = dpr;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      view.scale = Math.min(cw / game.width, ch / game.height);
      view.ox = (cw - game.width * view.scale) / 2;
      view.oy = (ch - game.height * view.scale) / 2;
      var inset = view.ox > 40 ? Math.round(view.ox) : 0;
      hud.style.left = inset + "px"; hud.style.right = inset + "px";
      layoutButtons();
    }
    function toWorld(cx, cy) { return { x: (cx - view.ox) / view.scale, y: (cy - view.oy) / view.scale }; }

    /* ---------- Entrada ---------- */
    var keysDown = {}, queued = {}, stepPressed = {};
    var buttons = (Array.isArray(config.buttons) ? config.buttons : []).slice(0, 3).map(function (b, i) {
      return { id: String(b.id || "b" + i), label: String(b.label || b.id || "A").slice(0, 10), keys: (b.keys || []).map(function (k) { return String(k).toLowerCase(); }), down: false, node: null };
    });
    var tapButton = config.tap ? String(config.tap) : null;
    function buttonByKey(k) { for (var i = 0; i < buttons.length; i++) if (buttons[i].keys.indexOf(k) >= 0) return buttons[i]; return null; }
    function press(id) { queued[id] = true; }
    game.key = function (k) { return Boolean(keysDown[String(k).toLowerCase()]); };
    game.down = function (id) {
      for (var i = 0; i < buttons.length; i++) if (buttons[i].id === id) { var b = buttons[i]; if (b.down) return true; for (var j = 0; j < b.keys.length; j++) if (keysDown[b.keys[j]]) return true; return false; }
      return false;
    };
    game.pressed = function (id) { return Boolean(stepPressed[id]); };

    var joyState = { id: null, sx: 0, sy: 0, x: 0, y: 0 };
    var useJoystick = Boolean(config.joystick);
    function updateAxis() {
      var x = 0, y = 0;
      if (keysDown.arrowleft || keysDown.a) x -= 1;
      if (keysDown.arrowright || keysDown.d) x += 1;
      if (keysDown.arrowup || keysDown.w) y -= 1;
      if (keysDown.arrowdown || keysDown.s) y += 1;
      if (joyState.id !== null) { x = joyState.x; y = joyState.y; }
      game.axis.x = clamp(x, -1, 1); game.axis.y = clamp(y, -1, 1);
    }
    var mode = "menu";
    W.addEventListener("keydown", function (e) {
      var k = String(e.key || "").toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(k) >= 0 && e.target === D.body) e.preventDefault();
      if (e.target && e.target.tagName === "INPUT") return;
      if (!keysDown[k]) { var b = buttonByKey(k); if (b) press(b.id); }
      keysDown[k] = true;
      if (mode === "menu" && (k === "enter" || k === " ")) { e.preventDefault(); begin(); }
      else if (mode === "over" && k === "enter") { e.preventDefault(); begin(); }
      else if ((k === "p" || k === "escape") && (mode === "playing" || mode === "paused")) { e.preventDefault(); mode === "playing" ? pause() : resume(); }
      updateAxis();
    });
    W.addEventListener("keyup", function (e) { keysDown[String(e.key || "").toLowerCase()] = false; updateAxis(); });

    var pointers = {};
    function canvasPoint(e) { var r = canvas.getBoundingClientRect(); return { cx: e.clientX - r.left, cy: e.clientY - r.top }; }
    canvas.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") markTouch();
      audioUnlock();
      var p = canvasPoint(e), w = toWorld(p.cx, p.cy);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      if (useJoystick && game.touch && mode === "playing" && p.cx < view.cw * 0.5 && joyState.id === null) {
        joyState.id = e.pointerId; joyState.sx = p.cx; joyState.sy = p.cy; joyState.x = 0; joyState.y = 0;
        joy.style.display = "block"; joy.style.left = p.cx + "px"; joy.style.top = p.cy + "px"; joy.firstChild.style.transform = "";
        updateAxis();
        return;
      }
      pointers[e.pointerId] = { sx: p.cx, sy: p.cy, t: performance.now() };
      game.pointer.x = w.x; game.pointer.y = w.y; game.pointer.down = true;
      queued.__pdown = true;
      queued.__tap = { x: w.x, y: w.y };
      if (tapButton && mode === "playing") press(tapButton);
    });
    canvas.addEventListener("pointermove", function (e) {
      var p = canvasPoint(e);
      if (e.pointerId === joyState.id) {
        var dx = p.cx - joyState.sx, dy = p.cy - joyState.sy, len = Math.sqrt(dx * dx + dy * dy), max = 46;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        joyState.x = dx / max; joyState.y = dy / max;
        joy.firstChild.style.transform = "translate(" + dx + "px," + dy + "px)";
        updateAxis();
        return;
      }
      var w = toWorld(p.cx, p.cy);
      game.pointer.x = w.x; game.pointer.y = w.y;
    });
    function pointerEnd(e) {
      if (e.pointerId === joyState.id) { joyState.id = null; joy.style.display = "none"; updateAxis(); return; }
      var start = pointers[e.pointerId];
      delete pointers[e.pointerId];
      if (!Object.keys(pointers).length) game.pointer.down = false;
      queued.__pup = true;
      if (start) {
        var p = canvasPoint(e), dx = p.cx - start.sx, dy = p.cy - start.sy, min = Math.max(28, Math.min(view.cw, view.ch) * 0.06);
        if (performance.now() - start.t < 600 && (Math.abs(dx) > min || Math.abs(dy) > min)) {
          queued.__swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
        }
      }
    }
    canvas.addEventListener("pointerup", pointerEnd);
    canvas.addEventListener("pointercancel", pointerEnd);
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    D.addEventListener("touchmove", function (e) { if (!e.target || e.target.tagName !== "INPUT") e.preventDefault(); }, { passive: false });
    D.addEventListener("gesturestart", function (e) { e.preventDefault(); });

    function markTouch() {
      if (game.touch) return;
      game.touch = true;
      buttons.forEach(function (b) { if (b.node) b.node.style.display = "grid"; });
      renderStart();
    }
    if (W.matchMedia && W.matchMedia("(pointer: coarse)").matches) game.touch = true;
    buttons.forEach(function (b) {
      var node = el("button", { class: "lg-tbtn", "aria-label": b.label }, esc(b.label));
      node.style.display = game.touch ? "grid" : "none";
      node.addEventListener("pointerdown", function (e) { e.preventDefault(); audioUnlock(); markTouch(); b.down = true; press(b.id); node.classList.add("down"); try { node.setPointerCapture(e.pointerId); } catch (err) {} });
      var up = function () { b.down = false; node.classList.remove("down"); };
      node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up); node.addEventListener("lostpointercapture", up);
      b.node = node; pad.appendChild(node);
    });
    function layoutButtons() {
      var gap = 14, size = 76, bottom = Math.max(64, view.ch * 0.08);
      buttons.forEach(function (b, i) {
        if (!b.node) return;
        b.node.style.right = (16 + i * (size + gap) + (i === 1 ? 0 : 0)) + "px";
        b.node.style.bottom = (bottom + (i === 1 ? size * 0.55 : 0)) + "px";
      });
    }

    /* ---------- Efectos ---------- */
    var particles = [], floats = [], shakeT = 0, shakeA = 0, flashT = 0, flashC = "#fff", flashD = 0.2;
    game.burst = function (x, y, color, count, speed) {
      var n = clamp(count || 14, 1, 80), s = speed || 220;
      for (var i = 0; i < n && particles.length < 600; i++) {
        var a = Math.random() * Math.PI * 2, v = s * (0.3 + Math.random() * 0.7);
        particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, max: 1, size: 2 + Math.random() * 3, color: color || colors.accent });
      }
    };
    game.floatText = function (x, y, text, color) { if (floats.length < 40) floats.push({ x: x, y: y, text: String(text), color: color || "#fff", life: 0.9 }); };
    game.shake = function (amount, dur) { shakeA = Math.max(shakeA, amount || 6); shakeT = Math.max(shakeT, dur || 0.25); };
    game.flash = function (color, dur) { flashC = color || "#fff"; flashD = dur || 0.18; flashT = flashD; };
    function updateEffects(dt) {
      for (var i = particles.length - 1; i >= 0; i--) { var p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy = p.vy * 0.96 + 260 * dt; if (p.life <= 0) particles.splice(i, 1); }
      for (var j = floats.length - 1; j >= 0; j--) { var f = floats[j]; f.life -= dt; f.y -= 50 * dt; if (f.life <= 0) floats.splice(j, 1); }
      if (shakeT > 0) shakeT -= dt;
      if (flashT > 0) flashT -= dt;
    }

    /* ---------- Dibujo: utilidades ---------- */
    game.text = function (c, str, x, y, opts) {
      opts = opts || {};
      c.save();
      c.font = (opts.weight || 800) + " " + (opts.size || 24) + "px " + (opts.font || "system-ui,-apple-system,'Segoe UI',sans-serif");
      c.textAlign = opts.align || "center"; c.textBaseline = opts.baseline || "middle";
      c.fillStyle = opts.color || colors.text;
      if (opts.glow) { c.shadowColor = opts.glow === true ? (opts.color || colors.accent) : opts.glow; c.shadowBlur = opts.blur || 14; }
      c.fillText(String(str), x, y);
      c.restore();
    };
    game.glow = function (c, color, blur) { c.shadowColor = color || colors.accent; c.shadowBlur = blur == null ? 16 : blur; };
    game.rrect = function (c, x, y, w, h, r) {
      r = Math.min(r || 0, w / 2, h / 2);
      c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    };
    /* 3D sencillo: proyección en perspectiva de (x, y, z) con cámara { x, y, z, fov }. */
    game.project = function (x, y, z, cam) {
      cam = cam || {};
      var fz = z - (cam.z || 0), f = (cam.fov || 0.9) * game.height;
      if (fz <= 1) return null;
      var s = f / fz;
      return { x: game.width / 2 + (x - (cam.x || 0)) * s, y: game.height / 2 + (y - (cam.y || 0)) * s, scale: s };
    };
    game.status = function (text) { statusEl.textContent = text == null ? "" : String(text).slice(0, 40); };

    /* ---------- Ciclo de vida ---------- */
    var state = null, acc = 0, last = 0, overAt = 0, overReason = "", runStarted = 0, playMs = 0;
    function safe(fn) { try { return fn(); } catch (err) { showError(err); mode = "error"; return null; } }
    function showError(err) {
      errorBox.style.display = "block";
      errorBox.textContent = "El juego encontró un error: " + (err && err.message ? err.message : String(err)).slice(0, 160);
      if (W.console) console.error(err);
    }
    function freshState() { game.time = 0; game.frame = 0; game.score = 0; game.status(""); particles.length = 0; floats.length = 0; return safe(function () { return config.init(game); }) || {}; }

    game.addScore = function (n) { game.score = Math.max(0, Math.round(game.score + (Number(n) || 0))); };
    game.setScore = function (n) { game.score = Math.max(0, Math.round(Number(n) || 0)); };
    game.over = function (reason) {
      if (mode !== "playing") return;
      mode = "ending"; overAt = game.time; overReason = reason ? String(reason).slice(0, 80) : "";
    };

    function begin() {
      audioUnlock();
      sfx("click");
      state = freshState();
      acc = 0; playMs = 0; runStarted = performance.now();
      queued = {}; stepPressed = {};
      [startLayer, pauseLayer, overLayer].forEach(function (l) { l.classList.remove("on"); });
      hud.classList.add("on");
      mode = "playing";
      if (lb.online) lb.refresh();
      canvas.focus && canvas.focus();
    }
    function pause() {
      if (mode !== "playing") return;
      mode = "paused";
      pauseLayer.innerHTML = '<div class="lg-card"><h2 class="lg-title" style="font-size:34px">Pausa</h2><p class="lg-sub">Tómate tu tiempo.</p><button class="lg-btn" data-a="resume">Continuar</button><br><button class="lg-btn ghost" data-a="restart">Reiniciar</button> <button class="lg-btn ghost" data-a="menu">Menú</button></div>';
      pauseLayer.classList.add("on");
    }
    function resume() {
      if (mode !== "paused") return;
      pauseLayer.classList.remove("on");
      mode = "playing"; last = performance.now() / 1000; acc = 0;
    }
    function toMenu() {
      mode = "menu";
      [pauseLayer, overLayer].forEach(function (l) { l.classList.remove("on"); });
      hud.classList.remove("on");
      state = freshState();
      renderStart();
      startLayer.classList.add("on");
      if (lb.online) lb.refresh().then(renderStart);
    }
    function boardHtml(limit, highlight) {
      if (!lb.online) return "";
      if (!lb.top.length) return '<p class="lg-small">' + (lb.loading ? "Cargando ranking…" : lb.error ? esc(lb.error) : "Aún no hay puntajes. ¡Sé el primero!") + "</p>";
      return '<ol class="lg-board">' + lb.top.slice(0, limit).map(function (row, i) {
        var me = highlight && row.name === highlight.name && row.score === highlight.score;
        return '<li class="' + (me ? "me" : "") + '"><span>' + (i + 1) + ". " + esc(row.name) + "</span><b>" + Number(row.score).toLocaleString("es-MX") + "</b></li>";
      }).join("") + "</ol>";
    }
    function controlsHint() {
      if (game.touch) return esc(config.touchHint || config.howTo || "Toca para jugar.");
      return esc(config.keysHint || config.howTo || "Usa las flechas o el ratón.");
    }
    function renderStart() {
      if (mode !== "menu") return;
      startLayer.innerHTML = '<div class="lg-card"><h1 class="lg-title">' + esc(game.title) + '</h1><p class="lg-sub">' + esc(config.subtitle || "") + "</p>" +
        '<p class="lg-sub" style="font-size:14px">' + controlsHint() + "</p>" +
        '<button class="lg-btn" data-a="play">Jugar</button>' +
        (game.best ? '<p class="lg-small">Tu récord: <b>' + game.best.toLocaleString("es-MX") + "</b></p>" : "") +
        (lb.online ? '<p class="lg-small" style="margin-top:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Top 5</p>' + boardHtml(5) : "") +
        "</div>";
    }
    function renderOver(newBest, saved, message) {
      var canSave = lb.online && game.score > 0 && !saved;
      var name = store.get("lyra-game:name") || "";
      overLayer.innerHTML = '<div class="lg-card">' + (newBest ? '<div class="lg-badge">¡Nuevo récord!</div>' : "") +
        '<h2 class="lg-title" style="font-size:32px">' + esc(config.overTitle || "Fin del juego") + "</h2>" +
        (overReason ? '<p class="lg-sub">' + esc(overReason) + "</p>" : "") +
        '<div class="lg-score">' + game.score.toLocaleString("es-MX") + "</div>" +
        '<p class="lg-small">Récord: ' + game.best.toLocaleString("es-MX") + (store.persistent ? "" : " · en esta sesión") + "</p>" +
        (canSave ? '<form class="lg-form" data-a="save"><input name="n" maxlength="16" placeholder="Tu nombre" aria-label="Tu nombre" value="' + esc(name) + '" autocomplete="nickname"><button class="lg-btn" type="submit">Guardar</button></form>' : "") +
        (message ? '<p class="lg-small">' + esc(message) + "</p>" : "") +
        boardHtml(10, saved) +
        '<button class="lg-btn" data-a="play">Jugar de nuevo</button><br><button class="lg-btn ghost" data-a="menu">Menú</button></div>';
    }
    function finish() {
      mode = "over";
      playMs = performance.now() - runStarted;
      hud.classList.remove("on");
      var newBest = game.score > game.best;
      if (newBest) { game.best = game.score; store.set(key + ":best", game.best); }
      sfx(newBest && game.score > 0 ? "win" : "lose");
      if (typeof config.onOver === "function") safe(function () { config.onOver(state, game); });
      renderOver(newBest, null, "");
      overLayer.classList.add("on");
    }

    root.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-a]") : null;
      if (!t || t.tagName === "FORM") return;
      var a = t.getAttribute("data-a");
      if (a === "play" || a === "restart") begin();
      else if (a === "resume") resume();
      else if (a === "menu") toMenu();
      else if (a === "pause") pause();
      else if (a === "mute") { audio.muted = !audio.muted; t.textContent = audio.muted ? "🔇" : "🔊"; t.setAttribute("aria-label", audio.muted ? "Activar sonido" : "Silenciar"); }
      else if (a === "full") {
        try { if (D.fullscreenElement) D.exitFullscreen(); else { var r = root.requestFullscreen({ navigationUI: "hide" }); if (r && r.catch) r.catch(function () { fullBtn.style.display = "none"; }); } } catch (err) { fullBtn.style.display = "none"; }
      }
    });
    root.addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target, input = form.querySelector("input"), name = String(input.value || "").trim().slice(0, 16);
      if (name.length < 2) { input.focus(); return; }
      store.set("lyra-game:name", name);
      form.querySelector("button").disabled = true;
      lb.submit(name, game.score).then(function (res) {
        var row = res && res.ok ? { name: res.name || name, score: game.score } : null;
        renderOver(false, row, res && res.ok ? (res.rank ? "Quedaste en el lugar " + res.rank + "." : "Puntaje guardado.") : (res && res.error) || "No se pudo guardar.");
      });
    });

    function hidden() { if (mode === "playing") pause(); }
    D.addEventListener("visibilitychange", function () { if (D.hidden) hidden(); });
    W.addEventListener("blur", hidden);
    W.addEventListener("resize", resize);
    W.addEventListener("orientationchange", function () { setTimeout(resize, 120); });

    /* ---------- Bucle de paso fijo ---------- */
    function step() {
      stepPressed = queued; queued = {};
      game.pointer.pressed = Boolean(stepPressed.__pdown);
      game.pointer.released = Boolean(stepPressed.__pup);
      game.tap = stepPressed.__tap || null;
      game.swipe = stepPressed.__swipe || null;
      game.time += STEP; game.frame += 1;
      if (mode === "playing") safe(function () { config.update(state, game, STEP); });
      else if (mode === "ending" && config.updateWhileEnding !== false) safe(function () { config.update(state, game, STEP); });
      updateEffects(STEP);
      if (mode === "ending" && game.time - overAt > 0.7) finish();
    }
    /* Fondo ambiental en toda la pantalla (también en las bandas fuera del mundo). */
    var glowCache = null;
    function backdrop(c) {
      var w = canvas.width, h = canvas.height;
      if (!glowCache || glowCache.w !== w || glowCache.h !== h) {
        var g1 = c.createRadialGradient(w * 0.15, h * 0.1, 0, w * 0.15, h * 0.1, Math.max(w, h) * 0.7);
        g1.addColorStop(0, colors.primary + "44"); g1.addColorStop(1, colors.primary + "00");
        var g2 = c.createRadialGradient(w * 0.9, h * 0.95, 0, w * 0.9, h * 0.95, Math.max(w, h) * 0.6);
        g2.addColorStop(0, colors.accent + "33"); g2.addColorStop(1, colors.accent + "00");
        glowCache = { w: w, h: h, g1: g1, g2: g2 };
      }
      c.fillStyle = glowCache.g1; c.fillRect(0, 0, w, h);
      c.fillStyle = glowCache.g2; c.fillRect(0, 0, w, h);
    }
    function render() {
      var c = ctx, s = view.scale * view.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = colors.bg; c.fillRect(0, 0, canvas.width, canvas.height);
      if (config.backdrop !== false) backdrop(c);
      var sx = 0, sy = 0;
      if (shakeT > 0) { sx = (Math.random() * 2 - 1) * shakeA; sy = (Math.random() * 2 - 1) * shakeA; } else shakeA = 0;
      c.setTransform(s, 0, 0, s, view.ox * view.dpr + sx * s, view.oy * view.dpr + sy * s);
      c.save();
      c.beginPath(); c.rect(0, 0, game.width, game.height); c.clip();
      if (state) safe(function () { config.draw(state, game, c); });
      c.globalCompositeOperation = "lighter";
      for (var i = 0; i < particles.length; i++) { var p = particles[i]; c.globalAlpha = clamp(p.life, 0, 1); c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
      for (var j = 0; j < floats.length; j++) { var f = floats[j]; c.globalAlpha = clamp(f.life * 1.4, 0, 1); game.text(c, f.text, f.x, f.y, { size: 22, color: f.color, glow: true }); }
      c.globalAlpha = 1;
      if (flashT > 0) { c.globalAlpha = clamp(flashT / flashD, 0, 1) * 0.5; c.fillStyle = flashC; c.fillRect(0, 0, game.width, game.height); c.globalAlpha = 1; }
      c.restore();
      if (view.ox > 4 || view.oy > 4) {
        c.save(); c.strokeStyle = colors.primary; c.globalAlpha = 0.55; c.lineWidth = 2 / view.scale; game.glow(c, colors.primary, 18);
        c.strokeRect(0, 0, game.width, game.height); c.restore();
      }
      scoreEl.textContent = game.score.toLocaleString("es-MX");
      bestEl.textContent = game.best ? "Récord " + game.best.toLocaleString("es-MX") : "";
    }
    function frame(ts) {
      W.requestAnimationFrame(frame);
      var now = ts / 1000;
      if (!last) last = now;
      var delta = Math.min(0.25, Math.max(0, now - last));
      last = now;
      if (mode === "playing" || mode === "ending") {
        acc += delta;
        var n = 0;
        while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
        if (n === 5) acc = 0;
      } else if (mode === "menu" || mode === "over") {
        updateEffects(delta);
      }
      if (mode !== "error") render();
    }

    W.addEventListener("error", function (e) { if (mode !== "error") { showError(e.error || e.message); } });
    resize();
    state = freshState();
    renderStart();
    if (lb.online) lb.refresh().then(renderStart);
    W.requestAnimationFrame(frame);
    /* Pruebas automáticas (sin efectos en el juego): estado legible. */
    W.__lyraGame = { get mode() { return mode; }, get state() { return state; }, get score() { return game.score; }, get best() { return game.best; }, start: begin, pause: pause, resume: resume, game: game };
    return game;
  }

  W.LyraGame = { start: start, version: 1 };
})();
`;

/** Lo que el juego publicado recibe de LYRA (va en <head>): solo la dirección pública del ranking. */
export function gameConfigScript(config: { api: string; slug: string }) {
  const json = JSON.stringify(config).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");
  return `<script>window.__LYRA_GAME__=${json};</script>`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Evita que un «</script>» dentro del código cierre la etiqueta. */
export function inlineScript(source: string) {
  return source.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

/** HTML único del juego: motor + código del juego en línea, listo para /s/[slug] o cualquier hosting. */
export function gameHtml(input: { title: string; description: string; bg: string; code: string }) {
  const bg = /^#[0-9a-f]{6}$/i.test(input.bg) ? input.bg : "#0B0718";
  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="${bg}" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="description" content="${escapeHtml(input.description.slice(0, 160))}" />
<title>${escapeHtml(input.title)}</title>
<style>html,body{margin:0;height:100%;background:${bg};overflow:hidden;overscroll-behavior:none;touch-action:none}</style>
</head>
<body>
<div id="game"></div>
<script>${inlineScript(gameRuntimeSource)}</script>
<script>${inlineScript(input.code)}</script>
</body>
</html>
`;
}
