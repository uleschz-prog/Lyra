export type StudioFormat = "9:16" | "1:1" | "16:9";

export type StudioPalette = { background: string; ink: string };

const palettes: Record<string, StudioPalette> = {
  cine: { background: "1E1B4B", ink: "FFFFFF" },
  producto: { background: "FDE68A", ink: "1E1E24" },
  vlog: { background: "0E7490", ink: "FFFFFF" },
  neon: { background: "4C1D95", ink: "FFFFFF" },
  natural: { background: "047857", ink: "FFFFFF" },
  retro: { background: "9A3412", ink: "FFFFFF" },
};

export function paletteFor(styleId: string): StudioPalette {
  return palettes[styleId] ?? palettes.vlog;
}

export function sizeFor(format: string): { width: number; height: number } {
  if (format === "16:9") return { width: 1280, height: 720 };
  if (format === "1:1") return { width: 720, height: 720 };
  return { width: 720, height: 1280 };
}

export function secondsFor(duration: string) {
  if (duration.startsWith("60")) return 12;
  if (duration.startsWith("30")) return 9;
  return 6;
}

export function scenesFromScript(script: string) {
  const parts = script
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  const scenes = parts.length > 0 ? parts : [script.trim()];
  return scenes.map((line, index) => ({ index: index + 1, line }));
}

export function wrapLine(text: string, width: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}
