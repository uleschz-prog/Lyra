import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { paletteFor, scenesFromScript, secondsFor, sizeFor, wrapLine, type StudioFormat } from "@/lib/studio/video-plan";

const fonts = [
  "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
];

function plain(text: string) {
  return text.replace(/[%\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk: Buffer) => {
      error = `${error}${chunk.toString()}`.slice(-1200);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(error || `ffmpeg terminó con código ${code}`));
    });
  });
}

export async function renderStudioVideo(input: {
  title: string;
  script: string;
  format?: string;
  styleId?: string;
  duration?: string;
  captions?: boolean;
}) {
  const { width, height } = sizeFor(input.format ?? "9:16");
  const seconds = secondsFor(input.duration ?? "15 s");
  const palette = paletteFor(input.styleId ?? "vlog");
  const scenes = scenesFromScript(input.script);
  const font = fonts.find((file) => existsSync(file)) ?? fonts[0];
  const dir = await mkdtemp(join(tmpdir(), "lyra-video-"));
  const output = join(dir, "pieza.mp4");
  const showCaptions = input.captions !== false;

  try {
    const titlePath = join(dir, "title.txt");
    await writeFile(titlePath, plain(input.title || "LYRA"));
    const filters = [
      `drawtext=fontfile=${font}:textfile=${titlePath}:fontsize=${width > height ? 42 : 48}:fontcolor=0x${palette.ink}:x=(w-text_w)/2:y=h*0.16`,
    ];

    if (showCaptions) {
      for (const [index, scene] of scenes.entries()) {
        const start = (seconds / scenes.length) * index;
        const end = (seconds / scenes.length) * (index + 1);
        const lines = wrapLine(plain(scene.line), width > height ? 42 : 28);
        for (const [lineIndex, line] of lines.entries()) {
          const file = join(dir, `s${index}-${lineIndex}.txt`);
          await writeFile(file, line);
          const y = `h*0.42+${lineIndex * (width > height ? 46 : 52)}`;
          filters.push(
            `drawtext=fontfile=${font}:textfile=${file}:fontsize=${width > height ? 32 : 36}:fontcolor=0x${palette.ink}:x=(w-text_w)/2:y=${y}:enable=between(t\\,${start.toFixed(2)}\\,${end.toFixed(2)})`,
          );
        }
      }
    }

    await run([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x${palette.background}:s=${width}x${height}:d=${seconds}:r=24`,
      "-vf",
      filters.join(","),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "32",
      "-movflags",
      "+faststart",
      output,
    ]);

    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function isStudioFormat(value: string): value is StudioFormat {
  return value === "9:16" || value === "1:1" || value === "16:9";
}
