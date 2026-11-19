// Invitación a instalar LYRA como app (lógica pura, sin React ni navegador).

export type InstallPlatform = {
  os: "ios" | "android" | "other";
  /** safari = Safari de iOS; chromium = Chrome/Edge/Samsung en Android; inapp = navegador dentro de otra app. */
  browser: "safari" | "chromium" | "inapp" | "other";
  device: "iPhone" | "iPad" | "Android" | "other";
};

export type InstallMode = "android" | "android-inapp" | "ios-safari" | "ios-other";

export const snoozeKey = "lyra-install-snooze";
export const installedKey = "lyra-installed";
export const snoozeDays = 7;

const inAppPattern = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|TikTok|BytedanceWebview|musical_ly|Snapchat|LinkedInApp|Pinterest|Twitter|\bwv\b/i;
const iosOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|Brave/i;
const androidChromium = /Chrome\/\d+/i;
const androidOther = /Firefox|FxiOS|OPR\/|Opera Mini|UCBrowser/i;

export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent || "";
  const iPadOs = /Macintosh/.test(ua) && maxTouchPoints > 1;
  if (/iPhone|iPod/.test(ua) || /iPad/.test(ua) || iPadOs) {
    const device = /iPhone|iPod/.test(ua) ? "iPhone" : "iPad";
    if (inAppPattern.test(ua)) return { os: "ios", browser: "inapp", device };
    if (iosOtherBrowser.test(ua)) return { os: "ios", browser: "other", device };
    return { os: "ios", browser: /Safari\//.test(ua) ? "safari" : "inapp", device };
  }
  if (/Android/i.test(ua)) {
    if (inAppPattern.test(ua) || /; wv\)/.test(ua)) return { os: "android", browser: "inapp", device: "Android" };
    if (androidOther.test(ua)) return { os: "android", browser: "other", device: "Android" };
    if (androidChromium.test(ua)) return { os: "android", browser: "chromium", device: "Android" };
    return { os: "android", browser: "other", device: "Android" };
  }
  return { os: "other", browser: "other", device: "other" };
}

/** Rutas donde nunca se invita a instalar: sitios publicados de clientes, API, pagos y vistas internas. */
export function installAllowedOn(pathname: string) {
  return !/^\/(s|api|pago|preview-vega)(\/|$)/.test(pathname || "/");
}

export function isSnoozed(rawUntil: string | null | undefined, now: number) {
  const until = Number(rawUntil);
  return Number.isFinite(until) && until > now;
}

export function snoozeUntil(now: number, days = snoozeDays) {
  return String(now + days * 86_400_000);
}

/**
 * Qué invitación mostrar, o null. En Android con Chrome solo si el navegador ofreció instalar
 * (beforeinstallprompt): así nunca prometemos un botón que no funciona.
 */
export function installMode(input: {
  platform: InstallPlatform;
  pathname: string;
  standalone: boolean;
  installed: boolean;
  snoozed: boolean;
  nativePromptReady: boolean;
}): InstallMode | null {
  const { platform, pathname, standalone, installed, snoozed, nativePromptReady } = input;
  if (standalone || installed || snoozed || !installAllowedOn(pathname)) return null;
  if (platform.os === "ios") return platform.browser === "safari" ? "ios-safari" : "ios-other";
  if (platform.os === "android") {
    if (platform.browser === "inapp") return "android-inapp";
    if (nativePromptReady) return "android";
  }
  return null;
}

/** Enlace que pide a Android abrir la página en Chrome (desde el navegador de otra app). */
export function chromeIntentUrl(href: string) {
  try {
    const url = new URL(href);
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
  } catch {
    return null;
  }
}
