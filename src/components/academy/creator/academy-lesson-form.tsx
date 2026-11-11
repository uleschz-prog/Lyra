"use client";

import { upload } from "@vercel/blob/client";
import { FileVideo2, Link2, LoaderCircle, Upload } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { createAcademyLesson } from "@/app/dashboard/academy/creator/actions";

const maxVideoBytes = 120_000_000;
const videoTypes = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
]);

export function AcademyLessonForm({ courseId, moduleId }: { courseId: string; moduleId: string }) {
  const [source, setSource] = useState<"upload" | "link">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    let videoUrl = String(formData.get("videoUrl") ?? "");

    if (source === "upload" && file) {
      const extension = videoTypes.get(file.type);
      if (!extension) {
        toast.error("Elige un video MP4 o WebM.");
        return;
      }
      if (file.size > maxVideoBytes) {
        toast.error("El video debe pesar 120 MB o menos.");
        return;
      }

      setUploading(true);
      setProgress(0);
      try {
        const blob = await upload(
          `lyra-academy-videos/${courseId}/${crypto.randomUUID()}.${extension}`,
          file,
          {
            access: "public",
            contentType: file.type,
            handleUploadUrl: "/api/academy/lesson-video-upload",
            clientPayload: JSON.stringify({ courseId, moduleId }),
            multipart: true,
            onUploadProgress: ({ percentage }) => setProgress(percentage),
          },
        );
        videoUrl = blob.url;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo subir el video.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    if (source === "upload" && !file && !String(formData.get("content") ?? "").trim()) {
      toast.error("Elige un video o agrega contenido de texto.");
      return;
    }
    if (source === "link") videoUrl = String(formData.get("videoUrl") ?? "");
    formData.set("videoUrl", videoUrl);
    formData.set("uploadedVideo", source === "upload" && Boolean(file) ? "true" : "false");
    startTransition(async () => {
      await createAcademyLesson(formData);
    });
  }

  const busy = uploading || pending;

  return (
    <form onSubmit={submit} className="mt-5 overflow-hidden rounded-2xl border border-[#E8E3F0] bg-white shadow-[0_12px_30px_-26px_rgba(54,34,120,0.5)]" onDragOver={(event) => event.preventDefault()}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="moduleId" value={moduleId} />
      <div className="flex items-start gap-3 border-b border-[#F0EDF4] bg-gradient-to-r from-[#FBF9FF] to-white px-4 py-4 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
          <FileVideo2 size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Paso 03 · Lección</p>
          <p className="mt-0.5 text-sm font-semibold text-[#1E1E24]">Añade una lección</p>
          <p className="mt-0.5 text-xs leading-5 text-[#77716A]">Elige el video desde tu equipo o comparte un enlace.</p>
        </div>
        <span className="hidden rounded-full border border-violet-100 bg-white px-2.5 py-1 text-[10px] font-medium text-[#817B85] sm:inline-flex">
          Se guarda automáticamente
        </span>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[11px] font-semibold text-[#5C5854]">
            Título de la lección
            <input
              name="title"
              required
              maxLength={150}
              placeholder="Ej. Tu primera página web"
              aria-label="Título de la lección"
              className="h-10 rounded-xl border border-[#E6E2EC] bg-white px-3 text-sm font-normal text-[#1E1E24] outline-none transition placeholder:text-[#AAA5AE] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
            />
          </label>
          <label className="grid gap-1.5 text-[11px] font-semibold text-[#5C5854]">
            Descripción <span className="font-normal text-[#96909A]">· opcional</span>
            <input
              name="description"
              maxLength={1000}
              placeholder="Una breve introducción"
              aria-label="Descripción breve"
              className="h-10 rounded-xl border border-[#E6E2EC] bg-white px-3 text-sm font-normal text-[#1E1E24] outline-none transition placeholder:text-[#AAA5AE] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
            />
          </label>
        </div>
        <div className="rounded-xl border border-[#EEEAF4] bg-[#FAF9FC] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#312F2F]">Contenido de video</p>
              <p className="mt-0.5 text-[11px] text-[#8A8680]">Tu video o un enlace externo; tú eliges.</p>
            </div>
            <div className="inline-flex rounded-lg border border-[#E9E4EF] bg-white p-1 shadow-sm" role="group" aria-label="Origen del video">
              <button
                type="button"
                aria-pressed={source === "upload"}
                onClick={() => setSource("upload")}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition ${source === "upload" ? "bg-[#302044] text-white shadow-sm" : "text-[#716B76] hover:bg-[#F6F3F9]"}`}
              >
                <Upload size={13} aria-hidden="true" />Archivo
              </button>
              <button
                type="button"
                aria-pressed={source === "link"}
                onClick={() => setSource("link")}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition ${source === "link" ? "bg-[#302044] text-white shadow-sm" : "text-[#716B76] hover:bg-[#F6F3F9]"}`}
              >
                <Link2 size={13} aria-hidden="true" />Enlace
              </button>
            </div>
          </div>
          {source === "upload" ? (
            <div className="mt-3">
              <label
                className={`group flex min-h-[88px] cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 transition sm:px-4 ${dragging ? "border-violet-500 bg-violet-100/80" : file ? "border-violet-200 bg-white" : "border-[#D9D1E6] bg-white hover:border-violet-400 hover:bg-violet-50/50"}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  setFile(event.dataTransfer.files[0] ?? null);
                }}
              >
                <span className={`grid size-11 shrink-0 place-items-center rounded-xl transition ${file ? "bg-violet-100 text-violet-700" : "bg-[#F4F1F8] text-[#817B8A] group-hover:bg-violet-100 group-hover:text-violet-700"}`}>
                  <FileVideo2 size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[#312F2F]">
                    {file ? file.name : "Arrastra aquí tu video"}
                  </span>
                  <span className="mt-1 block text-[11px] text-[#8A8680]">
                    {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB · Listo para subir` : "o haz clic para buscarlo en tu equipo · MP4 o WebM"}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg border border-[#E9E4EF] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-violet-800 shadow-sm transition group-hover:border-violet-200">
                  {file ? "Cambiar" : "Buscar video"}
                </span>
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
                />
              </label>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[10px] text-[#96909A]">Máximo 120 MB · Tu video se guarda de forma segura en LYRA.</p>
                {file && !busy ? (
                  <button type="button" onClick={() => setFile(null)} className="text-[10px] font-medium text-[#77716A] underline decoration-[#CCC5D2] underline-offset-2 hover:text-red-700">
                    Quitar archivo
                  </button>
                ) : null}
              </div>
              {uploading ? (
                <div className="mt-3 rounded-lg bg-white p-3" aria-live="polite">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[#51495A]">Subiendo video…</span>
                    <span className="tabular-nums text-violet-700">{progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <label className="mt-3 grid gap-1.5 text-[11px] font-semibold text-[#5C5854]">
              Enlace del video
              <span className="relative">
                <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#99939C]" aria-hidden="true" />
                <input
                  name="videoUrl"
                  type="url"
                  placeholder="https://youtu.be/..."
                  aria-label="Enlace del video"
                  className="h-10 w-full rounded-xl border border-[#E6E2EC] bg-white pl-9 pr-3 text-sm font-normal text-[#1E1E24] outline-none transition placeholder:text-[#AAA5AE] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
                />
              </span>
            </label>
          )}
        </div>
        <label className="grid gap-1.5 text-[11px] font-semibold text-[#5C5854]">
          Apuntes de la lección <span className="font-normal text-[#96909A]">· opcional</span>
          <textarea
            name="content"
            maxLength={20000}
            rows={2}
            placeholder="Agrega notas, pasos o recursos para acompañar el video…"
            aria-label="Contenido de texto opcional"
            className="resize-y rounded-xl border border-[#E6E2EC] bg-white px-3 py-2.5 text-sm font-normal leading-6 text-[#1E1E24] outline-none transition placeholder:text-[#AAA5AE] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EDF4] pt-3">
          <p className="text-[10px] text-[#96909A]">Puedes añadir materiales después de guardar.</p>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#211A32] px-4 text-xs font-semibold text-white shadow-lg shadow-violet-950/10 transition hover:-translate-y-0.5 hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
            {uploading ? "Subiendo video…" : pending ? "Guardando…" : "Guardar lección"}
          </button>
        </div>
      </div>
    </form>
  );
}
