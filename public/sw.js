/* LYRA · service worker mínimo.
 *
 * Qué hace:
 *  - Guarda los archivos estáticos con huella (/_next/static/…) y los íconos de la app.
 *  - Si no hay red al abrir una página, muestra /offline.html.
 * Qué NO hace (a propósito):
 *  - No guarda páginas HTML (pueden tener datos de tu sesión).
 *  - No toca /api/*, /s/* (sitios publicados de clientes), /login, /register ni nada que no sea GET.
 *  - No intercepta flujos en vivo (text/event-stream) ni peticiones con Range.
 */
const VERSION = "lyra-sw-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const MAX_STATIC_ENTRIES = 150;
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

const NEVER = [/^\/api(\/|$)/, /^\/s(\/|$)/, /^\/login(\/|$)/, /^\/register(\/|$)/, /^\/pago(\/|$)/, /^\/_next\/data\//, /^\/_next\/image/, /^\/sw\.js$/];
const STATIC_ASSET = [/^\/_next\/static\//, /^\/icon-(192|512|maskable-512)\.png$/, /^\/apple-touch-icon\.png$/, /^\/favicon(-32\.png|\.ico)$/, /^\/splash\//];

/**
 * Decide qué hacer con una petición: "static" (caché primero), "page" (red; si falla, página
 * sin conexión) o "skip" (el navegador la maneja como siempre).
 */
function routeFor(request, origin) {
  if (request.method !== "GET") return "skip";
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return "skip";
  }
  if (url.origin !== origin) return "skip";
  const headers = request.headers;
  const accept = (headers && headers.get && headers.get("accept")) || "";
  if (accept.includes("text/event-stream")) return "skip";
  if (headers && headers.get && headers.get("range")) return "skip";
  if (NEVER.some((pattern) => pattern.test(url.pathname))) return "skip";
  if (request.mode === "navigate") return "page";
  if (STATIC_ASSET.some((pattern) => pattern.test(url.pathname))) return "static";
  return "skip";
}

/** Mantiene la caché chica: borra los archivos más viejos (de despliegues anteriores). */
function trim(cache) {
  return cache.keys().then((keys) => {
    const extra = keys.length - MAX_STATIC_ENTRIES;
    if (extra <= 0) return undefined;
    const precached = new Set(PRECACHE.map((path) => new URL(path, self.location.origin).href));
    const removable = keys.filter((request) => !precached.has(request.url)).slice(0, extra);
    return Promise.all(removable.map((request) => cache.delete(request)));
  });
}

self.__lyraRouteFor = routeFor;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("lyra-sw-") && !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const route = routeFor(event.request, self.location.origin);
  if (route === "skip") return;

  if (route === "page") {
    // Siempre la red: las páginas nunca se guardan. Solo si no hay conexión mostramos la página offline.
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((offline) => offline || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok && response.type === "basic") {
              cache.put(event.request, response.clone()).then(() => trim(cache)).catch(() => undefined);
            }
            return response;
          }),
      ),
    ),
  );
});
