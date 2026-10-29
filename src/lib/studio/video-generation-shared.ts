import type { CreationRecord } from "@/lib/media-pieces";
import type { HiggsfieldVideoModel } from "@/lib/ai/higgsfield-video";
import { videoQuotaReservationSeconds } from "@/lib/studio/video-quota-shared";

export const videoDurationOptions = [10, 15, 20, 30, 45, 60, 90, 120, 150, 180] as const;
export type VideoDuration = (typeof videoDurationOptions)[number];
const allowedFormats = new Set(["16:9", "9:16", "1:1"]);
export const videoModelOptions: readonly { id: HiggsfieldVideoModel; name: string; multiplier: number }[] = [
  { id: "wan-3.0", name: "Wan 3.0", multiplier: 1 },
  { id: "wan-3.0-prime", name: "Wan 3.0 Prime", multiplier: 1.36 },
];
export type VideoModel = HiggsfieldVideoModel;

export type VideoGenerationState = {
  id: string;
  status: string;
  title: string;
  script: string;
  format: string;
  durationSeconds: number;
  model: HiggsfieldVideoModel | "x-ai/grok-imagine-video-1.5-lite";
  quotaReservedSeconds: number;
  quotaRemainingSeconds?: number;
  completedSegments: number;
  segmentCount: number;
  segmentUrls: string[];
  credits?: number;
  error?: string;
  piece?: CreationRecord;
};

export function videoQuotaCost(durationSeconds: number, model: string) {
  return videoQuotaReservationSeconds(durationSeconds, model);
}

export function videoSegmentCount(durationSeconds: number) {
  return Math.ceil(durationSeconds / 30);
}

export function videoSegmentPrompt(title: string, script: string, index: number, count: number, durationSeconds: number) {
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const start = Math.floor((index * sentences.length) / count);
  const end = Math.floor(((index + 1) * sentences.length) / count);
  const scene = sentences.slice(start, end).join(" ") || script.trim();
  return [
    `${title.trim() || "Video LYRA"}, segmento ${index + 1} de ${count}.`,
    `Crea un clip cinematográfico de ${durationSeconds} segundos en 480p que represente esta parte: ${scene}`,
    "Mantén el mismo producto, protagonista, entorno, paleta de color y estilo en todos los segmentos. Continúa la historia visualmente, con movimiento natural y transiciones limpias. Sin texto ni subtítulos en pantalla.",
    "Genera sonido ambiente realista y sincronizado con la escena; no incluyas música, voces ni diálogo.",
  ].join(" ");
}

export function isVideoDuration(value: unknown): value is VideoDuration {
  return typeof value === "number" && videoDurationOptions.includes(value as VideoDuration);
}

export function isVideoFormat(value: unknown): value is string {
  return typeof value === "string" && allowedFormats.has(value);
}
