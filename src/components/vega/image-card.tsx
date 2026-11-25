"use client";

import { Download, ImageIcon, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { VegaActionView } from "@/lib/vega/events";
import type { ImageRef, ImageView } from "@/lib/vega/images/runner";
import type { ImageDraft } from "@/lib/vega/images/tool";

export function imageRefFrom(payload: unknown): ImageRef | null {
  const image = (payload as { image?: unknown } | null)?.image;
  if (!image || typeof image !== "object" || typeof (image as ImageRef).generationId !== "string") return null;
  return image as ImageRef;
}

const aspectClass: Record<string, string> = {
  "1:1": "aspect-square",
  "2:3": "aspect-[2/3]",
  "3:2": "aspect-[3/2]",
  "9:16": "aspect-[9/16]",
  "4:5": "aspect-[4/5]",
};

/** Tarjeta de generar_imagen: pide la generación (≤ 60 s) y muestra la imagen con su botón de descarga. */
export function ImageCard({ action, onChange }: { action: VegaActionView; onChange: (action: VegaActionView, message: string) => void }) {
  const draft = action.payload as unknown as ImageDraft & { imageError?: string };
  const ref = imageRefFrom(action.payload);
  const [view, setView] = useState<ImageView | null>(null);
  const onChangeRef = useRef(onChange);
  const running = Boolean(ref) && (ref!.status === "queued" || ref!.status === "running");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!ref || !running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const tick = async () => {
      try {
        const response = await fetch(`/api/vega/images/${encodeURIComponent(ref.generationId)}`, { method: "POST", cache: "no-store" });
        if (cancelled) return;
        const payload = (await response.json().catch(() => ({}))) as { image?: ImageView; error?: string };
        if (!response.ok || !payload.image) throw new Error(payload.error ?? "sin respuesta");
        failures = 0;
        const image = payload.image;
        setView(image);
        if (image.status === "done" || image.status === "failed") {
          const result =
            image.status === "done"
              ? image.missingText?.length
                ? "Imagen lista (revisa el texto)"
                : "Imagen lista"
              : `No se pudo crear la imagen: ${image.error ?? ""} Te devolvimos los créditos.`.trim();
          const next: VegaActionView = {
            ...action,
            status: "done",
            result,
            payload: {
              ...(action.payload as object),
              image: { generationId: image.id, status: image.status, url: image.url, error: image.error, missingText: image.missingText },
            } as unknown as VegaActionView["payload"],
          };
          onChangeRef.current(next, result);
          return;
        }
        timer = setTimeout(() => void tick(), 1500);
      } catch {
        if (cancelled) return;
        failures += 1;
        timer = setTimeout(() => void tick(), Math.min(15_000, 2000 * failures));
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Solo se reinicia si cambia la imagen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref?.generationId, running]);

  if (!ref) {
    return (
      <div className="mt-3 rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] px-4 py-3 text-sm text-[#5C5854]">
        {draft.imageError ?? action.result ?? "No se pudo crear la imagen."} No se cobraron créditos.
      </div>
    );
  }

  const status = view?.status ?? ref.status;
  const url = view?.url ?? ref.url ?? null;
  const error = view?.error ?? ref.error ?? null;
  const missing = view?.missingText ?? ref.missingText ?? null;
  const shape = aspectClass[draft.aspectRatio] ?? "aspect-square";

  if (status === "queued" || status === "running") {
    return (
      <div className="mt-3 max-w-sm rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] p-3" aria-live="polite">
        <div className={`${shape} flex w-full flex-col items-center justify-center gap-2 rounded-xl bg-[#F3F0EA] text-[#8A8680]`}>
          <LoaderCircle className="size-6 animate-spin text-[#7C3AED]" />
          <p className="text-xs">Creando la imagen… (20 a 60 s)</p>
        </div>
      </div>
    );
  }

  if (status === "failed" || !url) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] px-4 py-3 text-sm text-[#5C5854]">
        <ImageIcon className="mt-0.5 size-4 shrink-0 text-[#8A8680]" />
        <span>{error ?? "No se pudo crear la imagen."} Te devolvimos los créditos.</span>
      </div>
    );
  }

  return (
    <div className="mt-3 max-w-sm rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9] p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por nuestra ruta autenticada */}
      <img src={url} alt={draft.exactText ? `Imagen con el texto: ${draft.exactText}` : draft.description} className={`${shape} w-full rounded-xl bg-[#F3F0EA] object-cover`} />
      {missing && missing.length > 0 ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[#B45309]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>Revisa el texto: no pude confirmar «{missing.join("», «")}». Pide a Vega que la corrija si hace falta.</span>
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <a
          href={`${url}?descargar=1`}
          className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-xs font-medium text-[#1E1E24]"
        >
          <Download className="size-3.5" />
          Descargar
        </a>
      </div>
    </div>
  );
}
