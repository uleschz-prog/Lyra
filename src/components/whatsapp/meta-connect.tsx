"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { completeMetaWhatsappSignup } from "@/app/dashboard/super-agent/actions";

declare global {
  interface Window {
    FB?: {
      init(input: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
      login(
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ): void;
    };
    fbAsyncInit?: () => void;
  }
}

type SignupAssets = { phone_number_id?: unknown; waba_id?: unknown; business_id?: unknown };

const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() ?? "";
const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ?? "";
const graphVersion = process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION?.trim() || "v26.0";

export function MetaWhatsappConnect({
  connected,
  phone,
  onConnected,
}: {
  connected: boolean;
  phone: string;
  onConnected: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef("");
  const assetsRef = useRef<SignupAssets | null>(null);
  const finishedRef = useRef(false);
  const connectedRef = useRef(onConnected);

  useEffect(() => {
    connectedRef.current = onConnected;
  }, [onConnected]);

  const finish = useCallback(async () => {
    if (!codeRef.current || !assetsRef.current || finishedRef.current) return;
    finishedRef.current = true;
    setBusy(true);
    const data = assetsRef.current;
    const result = await completeMetaWhatsappSignup({
      code: codeRef.current,
      phoneNumberId: data.phone_number_id,
      wabaId: data.waba_id,
      businessId: data.business_id,
    }).catch(() => ({ ok: false as const, error: "No se pudo completar la conexión con Meta." }));
    setBusy(false);
    codeRef.current = "";
    assetsRef.current = null;
    if (!result.ok) {
      finishedRef.current = false;
      toast.error(result.error);
      return;
    }
    toast.success(`WhatsApp Business conectado${result.phone ? ` · ${result.phone}` : ""}`);
    connectedRef.current();
  }, []);

  useEffect(() => {
    if (!appId || !configId) return;
    let active = true;
    const initialize = () => {
      if (!active || !window.FB) return;
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      setReady(true);
    };

    window.fbAsyncInit = initialize;
    if (window.FB) {
      initialize();
    } else if (!document.querySelector('script[src="https://connect.facebook.net/en_US/sdk.js"]')) {
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }

    const onMessage = (event: MessageEvent) => {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let payload: { type?: unknown; event?: unknown; data?: SignupAssets };
      try {
        payload = typeof event.data === "string" ? JSON.parse(event.data) as typeof payload : event.data as typeof payload;
      } catch {
        return;
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (typeof payload.event === "string" && payload.event.startsWith("FINISH")) {
        assetsRef.current = payload.data ?? null;
        void finish();
      } else if (payload.event === "CANCEL" || payload.event === "ERROR") {
        toast.error("No se completó el registro de WhatsApp Business en Meta.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      active = false;
      window.removeEventListener("message", onMessage);
    };
  }, [finish]);

  function connect() {
    if (!window.FB || !ready || !configId) return;
    finishedRef.current = false;
    codeRef.current = "";
    assetsRef.current = null;
    setBusy(true);
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setBusy(false);
          toast.error("Meta no devolvió la autorización. Puedes volver a intentarlo.");
          return;
        }
        codeRef.current = code;
        void finish();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      },
    );
  }

  if (!appId || !configId) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        La integración oficial de Meta aún no está configurada. LYRA necesita el App ID y el ID de configuración de Embedded Signup.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {connected ? <span className="text-sm text-emerald-700">Conectado {phone ? `· ${phone}` : ""}</span> : null}
      <button
        type="button"
        disabled={!ready || busy}
        onClick={connect}
        className="rounded-xl bg-[#1E1E24] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Conectando…" : connected ? "Volver a autorizar" : ready ? "Conectar WhatsApp Business" : "Cargando Meta…"}
      </button>
      <p className="basis-full text-xs leading-5 text-[#8A8680]">
        Meta abrirá su registro seguro. Para conservar el número en la app Business, sigue los pasos y confirma el código desde el teléfono.
      </p>
    </div>
  );
}
