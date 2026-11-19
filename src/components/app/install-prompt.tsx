"use client";

import { Check, Copy, Share, SquarePlus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import {
  chromeIntentUrl,
  detectPlatform,
  installedKey,
  installMode,
  isSnoozed,
  snoozeKey,
  snoozeUntil,
  type InstallMode,
  type InstallPlatform,
} from "@/lib/pwa/install";
import { cn } from "@/lib/utils";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window {
    __lyraInstallEvent?: InstallEvent | null;
  }
}

/** Espera a que pase el splash y la página se acomode antes de invitar. */
const SHOW_DELAY_MS = 2200;

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo privado: la invitación volverá en otra visita */
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Captura temprana de «beforeinstallprompt» (va en el <head>, antes de que React arranque). */
export const installCaptureScript = `window.__lyraInstallEvent=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__lyraInstallEvent=e;window.dispatchEvent(new Event('lyra:installable'));});window.addEventListener('appinstalled',function(){window.__lyraInstallEvent=null;try{localStorage.setItem('lyra-installed','1')}catch(e){}});`;

/**
 * Invitación a instalar LYRA, solo en celular:
 * - Android con Chrome: hoja con «Instalar» que abre el diálogo nativo.
 * - iPhone/iPad con Safari: los pasos (Compartir → Agregar a pantalla de inicio).
 * - iOS en otro navegador o dentro de otra app: pide abrirla en Safari (o en Chrome en Android).
 * No aparece si ya está instalada, si la cerraste hace menos de 7 días ni en /s/* (sitios de clientes).
 */
export function InstallPrompt() {
  const pathname = usePathname() ?? "/";
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [nativeReady, setNativeReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
      setNativeReady(Boolean(window.__lyraInstallEvent));
    });
    const onInstallable = () => setNativeReady(Boolean(window.__lyraInstallEvent));
    const onInstalled = () => {
      writeStorage(installedKey, "1");
      setClosed(true);
    };
    window.addEventListener("lyra:installable", onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    const timer = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("lyra:installable", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: InstallMode | null =
    platform && ready && !closed
      ? installMode({
          platform,
          pathname,
          standalone: isStandalone(),
          installed: readStorage(installedKey) === "1",
          snoozed: isSnoozed(readStorage(snoozeKey), Date.now()),
          nativePromptReady: nativeReady,
        })
      : null;

  useEffect(() => {
    if (!mode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!mode || !platform) return null;

  function dismiss() {
    writeStorage(snoozeKey, snoozeUntil(Date.now()));
    setClosed(true);
  }

  async function install() {
    const event = window.__lyraInstallEvent;
    if (!event) {
      dismiss();
      return;
    }
    setInstalling(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      window.__lyraInstallEvent = null;
      if (choice.outcome === "accepted") {
        writeStorage(installedKey, "1");
        setClosed(true);
      } else dismiss();
    } catch {
      dismiss();
    } finally {
      setInstalling(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copia este enlace", window.location.href);
    }
  }

  const device = platform.device === "iPad" ? "iPad" : platform.device === "iPhone" ? "iPhone" : "celular";
  const primary =
    "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#FFFFFF] px-5 text-[15px] font-semibold text-[#0B0A10] transition hover:bg-[#EDE9FE] focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#16141F] focus-visible:outline-none disabled:opacity-60";
  const secondary =
    "inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-medium text-[#C9C4D6] transition hover:bg-white/[0.06] hover:text-[#FFFFFF] focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="lyra-install-title"
        aria-describedby="lyra-install-text"
        className="lyra-install-sheet pointer-events-auto relative w-full max-w-md rounded-[28px] bg-[#16141F] p-5 text-[#FFFFFF] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/10"
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-[#8E89A0] transition hover:bg-white/10 hover:text-[#FFFFFF] focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3.5 pr-8">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#0B0A10] ring-1 ring-white/10">
            <Logo compact className="[&_svg]:size-9" />
          </span>
          <div className="min-w-0">
            <h2 id="lyra-install-title" className="text-lg leading-tight font-semibold">
              {mode === "ios-other" ? "Ábrela en Safari para instalarla" : mode === "android-inapp" ? "Ábrela en Chrome para instalarla" : "Instala LYRA"}
            </h2>
            <p id="lyra-install-text" className="mt-1 text-sm leading-snug text-[#A9A3B8]">
              {mode === "android"
                ? "Tenla en tu pantalla de inicio y ábrela a pantalla completa, como una app. Sin pasar por la tienda."
                : mode === "ios-safari"
                  ? `Agrégala a la pantalla de inicio de tu ${device} y ábrela a pantalla completa, como una app.`
                  : mode === "ios-other"
                    ? `En tu ${device}, solo Safari permite agregar LYRA a la pantalla de inicio de forma confiable.`
                    : "El navegador de esta app no permite instalar LYRA."}
            </p>
          </div>
        </div>

        {mode === "ios-safari" ? (
          <ol className="mt-4 space-y-2.5 rounded-2xl bg-white/[0.04] p-4 text-[15px] leading-snug">
            <li className="flex items-start gap-3">
              <StepNumber n={1} />
              <span>
                Toca <Share className="mx-0.5 inline size-[18px] -translate-y-0.5 text-[#60A5FA]" aria-label="Compartir" /> <b className="font-semibold">Compartir</b> en la barra de Safari.
                <span className="block text-[13px] text-[#8E89A0]">Si no lo ves, toca primero ··· (más opciones).</span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <StepNumber n={2} />
              <span>
                Elige <SquarePlus className="mx-0.5 inline size-[18px] -translate-y-0.5" aria-hidden /> <b className="font-semibold">Agregar a pantalla de inicio</b>.
                <span className="block text-[13px] text-[#8E89A0]">Puede estar más abajo en la lista.</span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <StepNumber n={3} />
              <span>
                Toca <b className="font-semibold">Agregar</b>. LYRA aparecerá junto a tus apps.
              </span>
            </li>
          </ol>
        ) : null}

        {mode === "ios-other" || mode === "android-inapp" ? (
          <ol className="mt-4 space-y-2.5 rounded-2xl bg-white/[0.04] p-4 text-[15px] leading-snug">
            <li className="flex items-start gap-3">
              <StepNumber n={1} />
              <span>Copia el enlace de esta página.</span>
            </li>
            <li className="flex items-start gap-3">
              <StepNumber n={2} />
              <span>
                Abre <b className="font-semibold">{mode === "ios-other" ? "Safari" : "Chrome"}</b>, pega el enlace y entra.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <StepNumber n={3} />
              <span>Ahí te mostraremos cómo instalarla.</span>
            </li>
          </ol>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          {mode === "android" ? (
            <button type="button" onClick={() => void install()} disabled={installing} className={primary}>
              {installing ? "Abriendo…" : "Instalar"}
            </button>
          ) : mode === "ios-safari" ? (
            <button type="button" onClick={dismiss} className={primary}>
              Entendido
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void copyLink()} className={primary}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Enlace copiado" : "Copiar enlace"}
              </button>
              {mode === "android-inapp" ? <ChromeLink /> : null}
            </>
          )}
          {mode === "android" || mode === "ios-other" ? (
            <button type="button" onClick={dismiss} className={secondary}>
              Ahora no
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#7C3AED]/25 text-[13px] font-semibold text-[#C4B5FD]" aria-hidden>
      {n}
    </span>
  );
}

function ChromeLink() {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHref(chromeIntentUrl(window.location.href)));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  if (!href) return null;
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-full bg-white/[0.08] px-5 text-[15px] font-medium text-[#FFFFFF] transition hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none",
      )}
    >
      Abrir en Chrome
    </a>
  );
}

/** Registra el service worker en producción (fuera de /s/*). No hace nada si el navegador no lo soporta. */
export function ServiceWorkerRegister() {
  const pathname = usePathname() ?? "/";
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    if (/^\/s(\/|$)/.test(pathname)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, [pathname]);
  return null;
}
