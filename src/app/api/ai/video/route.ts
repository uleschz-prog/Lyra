import { NextResponse } from "next/server";

export const maxDuration = 60;

function scenesFromScript(script: string) {
  const parts = script
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  const scenes = parts.length > 0 ? parts : [script];
  return scenes.map((line, index) => ({ index: index + 1, line }));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    script?: unknown;
  } | null;

  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "Pieza LYRA";
  const script = typeof body?.script === "string" ? body.script.trim().slice(0, 2000) : "";

  if (script.length < 12) {
    return NextResponse.json({ error: "El guion necesita al menos una frase." }, { status: 400 });
  }

  return NextResponse.json({
    mode: "preview",
    provider: "lyra",
    title,
    status: "ready",
    scenes: scenesFromScript(script),
    message: "LYRA armó el video a partir de tu guion y tus imágenes.",
  });
}
