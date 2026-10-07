import { paletteFor, scenesFromScript, secondsFor, sizeFor, wrapLine } from "@/lib/studio/video-plan";

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function openRecorder(stream: MediaStream, mime: string) {
  try {
    return new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 700_000 });
  } catch {
    return new MediaRecorder(stream, { mimeType: mime });
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("No se pudo leer el video."));
    reader.readAsDataURL(blob);
  });
}

export async function recordStudioClip(input: {
  title: string;
  script: string;
  format: string;
  styleId: string;
  duration: string;
  imageUrl?: string | null;
  captions?: boolean;
}) {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Este navegador no puede grabar el video.");
  }
  const { width, height } = sizeFor(input.format);
  const seconds = secondsFor(input.duration);
  const scenes = scenesFromScript(input.script);
  const palette = paletteFor(input.styleId);
  const showCaptions = input.captions !== false;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el lienzo.");
  const photo = input.imageUrl ? await loadImage(input.imageUrl) : null;
  const stream = canvas.captureStream(24);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
  const recorder = openRecorder(stream, mime);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  const draw = (elapsed: number) => {
    context.fillStyle = `#${palette.background}`;
    context.fillRect(0, 0, width, height);
    if (photo) {
      const scale = Math.max(width / photo.width, height / photo.height);
      const w = photo.width * scale;
      const h = photo.height * scale;
      context.globalAlpha = 0.35;
      context.drawImage(photo, (width - w) / 2, (height - h) / 2, w, h);
      context.globalAlpha = 1;
      context.fillStyle = `#${palette.background}99`;
      context.fillRect(0, 0, width, height);
    }
    context.fillStyle = `#${palette.ink}`;
    context.font = `600 ${width > height ? 42 : 48}px sans-serif`;
    context.textAlign = "center";
    context.fillText(input.title || "LYRA", width / 2, height * 0.22, width - 80);
    const scene = scenes[Math.min(scenes.length - 1, Math.floor((elapsed / seconds) * scenes.length))] ?? scenes[0];
    if (showCaptions) {
      const lines = wrapLine(scene?.line ?? "", width > height ? 42 : 28);
      context.font = `${width > height ? 28 : 32}px sans-serif`;
      lines.forEach((line, index) => {
        context.fillText(line, width / 2, height * 0.46 + index * (width > height ? 40 : 46), width - 80);
      });
    }
  };

  recorder.start();
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      draw(elapsed);
      if (elapsed < seconds) requestAnimationFrame(tick);
      else resolve();
    };
    tick();
  });
  recorder.stop();
  const blob = await stopped;
  const url = await blobToDataUrl(blob);
  if (!url.startsWith("data:video/")) throw new Error("No se pudo crear el video.");
  return { url, scenes };
}
