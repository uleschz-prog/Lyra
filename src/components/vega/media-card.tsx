"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { recordStudioClip } from "@/lib/studio/record-clip";
import { zipStore } from "@/lib/vega/zip-store";
import type { ImageDraft, VideoDraft } from "@/lib/vega/tools";

function save(name: string, bytes: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function MediaCard({ image, video }: { image?: ImageDraft; video?: VideoDraft }) {
  const imageUrl = image?.imageUrl ?? image?.dataUrl;
  if (image && imageUrl) {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9]">
        <div className="flex items-center justify-between gap-3 border-b border-[#F0ECE6] px-4 py-2.5">
          <p className="text-xs font-medium text-[#5C5854]">Imagen lista</p>
          <a href={imageUrl} download="vega-imagen.png" className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-2.5 py-1.5 text-xs font-medium text-white">
            <Download className="size-3.5" />
            Descargar
          </a>
        </div>
        <div className="px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={image.prompt} className="max-h-[420px] w-full rounded-xl object-contain bg-white" />
        </div>
      </div>
    );
  }

  if (!video) return null;
  return <VideoCard video={video} />;
}

function VideoCard({ video }: { video: VideoDraft }) {
  const [url, setUrl] = useState(video.videoUrl);
  const [preparing, setPreparing] = useState(!video.videoUrl);
  const [libraryError, setLibraryError] = useState("");

  useEffect(() => {
    if (video.videoUrl) return;
    let cancelled = false;
    recordStudioClip({
      title: video.title,
      script: video.script,
      format: "9:16",
      styleId: "cine",
      duration: "15 s",
    })
      .then(async (clip) => {
        if (cancelled) return;
        setUrl(clip.url);
        const file = await fetch(clip.url).then((response) => response.blob());
        const form = new FormData();
        form.append("file", file, `${video.title || "video"}.webm`);
        form.append("title", video.title);
        form.append("script", video.script);
        if (video.libraryPieceId) form.append("pieceId", video.libraryPieceId);
        const response = await fetch("/api/library/video", { method: "POST", body: form });
        const result = (await response.json().catch(() => ({}))) as { videoUrl?: string; error?: string };
        if (!response.ok || !result.videoUrl) {
          throw new Error(result.error ?? "No se pudo guardar el video en Biblioteca.");
        }
        if (!cancelled) {
          setUrl(result.videoUrl);
          setLibraryError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLibraryError(error instanceof Error ? error.message : "No se pudo guardar el video en Biblioteca.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [video.libraryPieceId, video.script, video.title, video.videoUrl]);

  function downloadVideo() {
    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.download = `${video.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "video"}.${url.startsWith("data:video/webm") ? "webm" : "mp4"}`;
      link.click();
      return;
    }
    save(`${video.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "video"}.zip`, zipStore(video.files), "application/zip");
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7E2DA] bg-[#FCFBF9]">
      <div className="flex items-center justify-between gap-3 border-b border-[#F0ECE6] px-4 py-2.5">
        <p className="text-xs font-medium text-[#5C5854]">Video · {video.title}</p>
        <button type="button" onClick={downloadVideo} className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-2.5 py-1.5 text-xs font-medium text-white">
          <Download className="size-3.5" />
          Descargar
        </button>
      </div>
      <div className="px-4 py-3">
        {url ? (
          <video src={url} controls className="max-h-[420px] w-full rounded-xl bg-black" />
        ) : preparing ? (
          <p className="rounded-xl bg-[#1E1B4B] px-4 py-10 text-center text-sm text-white">Preparando el video…</p>
        ) : (
          <iframe title={`Video ${video.title}`} sandbox="allow-scripts" srcDoc={video.html} className="h-[280px] w-full rounded-xl border border-[#E7E2DA] bg-[#1E1B4B]" />
        )}
        {libraryError ? <p className="mt-3 text-xs text-[#9A3B2F]">{libraryError} El video sigue disponible en este chat.</p> : null}
      </div>
    </div>
  );
}
