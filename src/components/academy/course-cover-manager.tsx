"use client";

import { upload } from "@vercel/blob/client";
import { ImagePlus, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { removeAcademyCourseCover } from "@/app/dashboard/academy/creator/cover-actions";

const maxSourceBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function cropCover(file: File) {
  const bitmap = await createImageBitmap(file);
  const ratio = 16 / 9;
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const cropWidth = sourceWidth / sourceHeight > ratio ? sourceHeight * ratio : sourceWidth;
  const cropHeight = sourceWidth / sourceHeight > ratio ? sourceHeight : sourceWidth / ratio;
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Tu navegador no pudo preparar la portada.");
  }
  context.drawImage(
    bitmap,
    (sourceWidth - cropWidth) / 2,
    (sourceHeight - cropHeight) / 2,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("No se pudo recortar la imagen.");
  return blob;
}

export function CourseCoverManager({
  courseId,
  courseTitle,
  coverImageUrl,
}: {
  courseId: string;
  courseTitle: string;
  coverImageUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [coverOverride, setCoverOverride] = useState<{ base: string | null; value: string | null } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropped, setCropped] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const savedCover = coverOverride?.base === coverImageUrl ? coverOverride.value : coverImageUrl;

  async function prepareFile(file?: File) {
    if (!file) return;
    if (!allowedTypes.has(file.type)) {
      toast.error("Elige una imagen JPG, PNG o WebP.");
      return;
    }
    if (file.size > maxSourceBytes) {
      toast.error("La imagen debe pesar 5 MB o menos.");
      return;
    }
    try {
      const blob = await cropCover(file);
      setCropped(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo preparar la portada.");
    }
  }

  async function saveCover() {
    if (!cropped) return;
    setBusy(true);
    try {
      const path = `lyra-academy-covers/${courseId}-${crypto.randomUUID()}.webp`;
      const blob = await upload(path, cropped, {
        access: "public",
        contentType: "image/webp",
        handleUploadUrl: "/api/academy/cover-upload",
        clientPayload: JSON.stringify({ courseId }),
        multipart: false,
      });
      setCoverOverride({ base: coverImageUrl, value: blob.url });
      setCropped(null);
      setPreviewUrl(null);
      toast.success("Portada guardada y recortada a 16:9.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la portada.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCover() {
    setBusy(true);
    try {
      const result = await removeAcademyCourseCover(courseId);
      if (!result.ok) throw new Error(result.error ?? "No se pudo quitar la portada.");
      setCoverOverride({ base: coverImageUrl, value: null });
      setCropped(null);
      setPreviewUrl(null);
      toast.success("Se usará la portada visual predeterminada de LYRA.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo quitar la portada.");
    } finally {
      setBusy(false);
    }
  }

  const displayedCover = previewUrl ?? savedCover;
  return (
    <div className="mt-4 rounded-xl border border-border bg-white p-3">
      <div
        className="relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-violet-950 via-indigo-800 to-cyan-600"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void prepareFile(event.dataTransfer.files[0]);
        }}
      >
        {displayedCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayedCover} alt={`Vista previa de portada: ${courseTitle}`} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-r from-black/25 to-transparent p-4 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">LYRA · ACADEMIA</p>
            <p className="mt-1 line-clamp-2 text-base font-semibold">{courseTitle}</p>
          </div>
        )}
        {cropped ? <span className="absolute left-2 top-2 rounded-full bg-violet-700 px-2 py-1 text-[10px] font-semibold text-white">Vista previa · 16:9</span> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          void prepareFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <p className="mt-2 text-xs text-[#77716A]">JPG, PNG o WebP · hasta 5 MB · recorte centrado a 16:9. También puedes arrastrar una imagen a la vista previa.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-[#312F2F] hover:bg-surface-hover disabled:opacity-50">
          <ImagePlus size={15} aria-hidden="true" />Elegir portada
        </button>
        {cropped ? (
          <button type="button" disabled={busy} onClick={() => void saveCover()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}
            Guardar portada
          </button>
        ) : null}
        {savedCover && !cropped ? (
          <button type="button" disabled={busy} onClick={() => void removeCover()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-[#5C5854] hover:bg-surface-hover disabled:opacity-50">
            <RotateCcw size={15} aria-hidden="true" />Usar portada LYRA
          </button>
        ) : null}
        {cropped ? (
          <button type="button" disabled={busy} onClick={() => { setCropped(null); setPreviewUrl(null); }} className="inline-flex h-9 items-center rounded-lg px-3 text-xs text-[#6A6662] hover:bg-surface-hover disabled:opacity-50">
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  );
}
