import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

import { chromeIntentUrl, detectPlatform, installAllowedOn, installMode, isSnoozed, snoozeUntil } from "@/lib/pwa/install";

const ua = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 360.0.0.0 (iPhone15,2; iOS 18_5; es_MX)",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidFacebook: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

describe("detectPlatform", () => {
  it("distingue Safari de iOS, otros navegadores y apps", () => {
    expect(detectPlatform(ua.iphoneSafari)).toEqual({ os: "ios", browser: "safari", device: "iPhone" });
    expect(detectPlatform(ua.iphoneChrome).browser).toBe("other");
    expect(detectPlatform(ua.iphoneInstagram).browser).toBe("inapp");
    expect(detectPlatform(ua.ipadOs, 5)).toEqual({ os: "ios", browser: "safari", device: "iPad" });
    expect(detectPlatform(ua.ipadOs, 0).os).toBe("other");
  });

  it("distingue Chrome/Samsung, apps y otros en Android", () => {
    expect(detectPlatform(ua.androidChrome).browser).toBe("chromium");
    expect(detectPlatform(ua.androidSamsung).browser).toBe("chromium");
    expect(detectPlatform(ua.androidFacebook).browser).toBe("inapp");
    expect(detectPlatform(ua.androidFirefox).browser).toBe("other");
    expect(detectPlatform(ua.desktopChrome).os).toBe("other");
  });
});

describe("installMode", () => {
  const base = { pathname: "/", standalone: false, installed: false, snoozed: false, nativePromptReady: false };

  it("elige la hoja según el dispositivo", () => {
    expect(installMode({ ...base, platform: detectPlatform(ua.iphoneSafari) })).toBe("ios-safari");
    expect(installMode({ ...base, platform: detectPlatform(ua.iphoneChrome) })).toBe("ios-other");
    expect(installMode({ ...base, platform: detectPlatform(ua.iphoneInstagram) })).toBe("ios-other");
    expect(installMode({ ...base, platform: detectPlatform(ua.androidFacebook) })).toBe("android-inapp");
  });

  it("en Android solo ofrece «Instalar» si el navegador lo permitió", () => {
    expect(installMode({ ...base, platform: detectPlatform(ua.androidChrome) })).toBeNull();
    expect(installMode({ ...base, platform: detectPlatform(ua.androidChrome), nativePromptReady: true })).toBe("android");
    expect(installMode({ ...base, platform: detectPlatform(ua.androidFirefox) })).toBeNull();
  });

  it("no aparece en computadora, instalada, pospuesta ni en sitios de clientes", () => {
    const iphone = detectPlatform(ua.iphoneSafari);
    expect(installMode({ ...base, platform: detectPlatform(ua.desktopChrome), nativePromptReady: true })).toBeNull();
    expect(installMode({ ...base, platform: iphone, standalone: true })).toBeNull();
    expect(installMode({ ...base, platform: iphone, installed: true })).toBeNull();
    expect(installMode({ ...base, platform: iphone, snoozed: true })).toBeNull();
    expect(installMode({ ...base, platform: iphone, pathname: "/s/taqueria" })).toBeNull();
    expect(installMode({ ...base, platform: iphone, pathname: "/dashboard" })).toBe("ios-safari");
  });

  it("rutas permitidas", () => {
    expect(installAllowedOn("/")).toBe(true);
    expect(installAllowedOn("/dashboard/super-agent")).toBe(true);
    expect(installAllowedOn("/login")).toBe(true);
    expect(installAllowedOn("/s")).toBe(false);
    expect(installAllowedOn("/s/mi-sitio")).toBe(false);
    expect(installAllowedOn("/pago/exito")).toBe(false);
    expect(installAllowedOn("/api/x")).toBe(false);
    expect(installAllowedOn("/sitios")).toBe(true);
  });
});

describe("posponer 7 días", () => {
  it("vence a los 7 días", () => {
    const now = Date.UTC(2026, 10, 18);
    const until = snoozeUntil(now);
    expect(isSnoozed(until, now + 6 * 86_400_000)).toBe(true);
    expect(isSnoozed(until, now + 7 * 86_400_000 + 1)).toBe(false);
    expect(isSnoozed(null, now)).toBe(false);
    expect(isSnoozed("basura", now)).toBe(false);
  });
});

describe("chromeIntentUrl", () => {
  it("arma el enlace de Chrome con regreso a la página", () => {
    const url = chromeIntentUrl("https://lyyra.vercel.app/register?ref=ABC");
    expect(url).toContain("intent://lyyra.vercel.app/register?ref=ABC#Intent;scheme=https;package=com.android.chrome;");
    expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent("https://lyyra.vercel.app/register?ref=ABC")}`);
    expect(chromeIntentUrl("no es url")).toBeNull();
  });
});

describe("service worker: qué intercepta", () => {
  const sandbox: Record<string, unknown> = { URL, addEventListener: () => undefined, location: { origin: "https://lyyra.vercel.app" } };
  sandbox.self = sandbox;
  vm.runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), sandbox);
  const routeFor = sandbox.__lyraRouteFor as (request: unknown, origin: string) => string;
  const origin = "https://lyyra.vercel.app";
  const req = (path: string, init: { method?: string; mode?: string; accept?: string; range?: string; host?: string } = {}) => ({
    url: `${init.host ?? origin}${path}`,
    method: init.method ?? "GET",
    mode: init.mode ?? "cors",
    headers: new Headers({ ...(init.accept ? { accept: init.accept } : {}), ...(init.range ? { range: init.range } : {}) }),
  });

  it("guarda solo estáticos con huella e íconos", () => {
    expect(routeFor(req("/_next/static/chunks/app-123.js"), origin)).toBe("static");
    expect(routeFor(req("/icon-192.png"), origin)).toBe("static");
    expect(routeFor(req("/splash/1170x2532.png"), origin)).toBe("static");
  });

  it("las páginas van a la red (con respaldo sin conexión), nunca a caché", () => {
    expect(routeFor(req("/dashboard", { mode: "navigate" }), origin)).toBe("page");
    expect(routeFor(req("/", { mode: "navigate" }), origin)).toBe("page");
  });

  it("nunca toca API, sitios publicados, sesión, pagos, flujos en vivo ni otros dominios", () => {
    expect(routeFor(req("/api/vega/chat"), origin)).toBe("skip");
    expect(routeFor(req("/api/auth/session", { mode: "navigate" }), origin)).toBe("skip");
    expect(routeFor(req("/s/taqueria", { mode: "navigate" }), origin)).toBe("skip");
    expect(routeFor(req("/login", { mode: "navigate" }), origin)).toBe("skip");
    expect(routeFor(req("/register", { mode: "navigate" }), origin)).toBe("skip");
    expect(routeFor(req("/pago/exito", { mode: "navigate" }), origin)).toBe("skip");
    expect(routeFor(req("/dashboard", { method: "POST", mode: "navigate" }), origin)).toBe("skip");
    expect(routeFor(req("/dashboard/eventos", { accept: "text/event-stream" }), origin)).toBe("skip");
    expect(routeFor(req("/video.mp4", { range: "bytes=0-" }), origin)).toBe("skip");
    expect(routeFor(req("/_next/static/x.js", { host: "https://cdn.otro.com" }), origin)).toBe("skip");
    expect(routeFor(req("/dashboard?_rsc=abc"), origin)).toBe("skip");
    expect(routeFor(req("/sw.js"), origin)).toBe("skip");
  });
});
