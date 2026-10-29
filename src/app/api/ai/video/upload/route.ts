import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { requireMember } from "@/lib/auth/api";
import { getPrisma } from "@/lib/prisma";
import { finalizeVideoGeneration } from "@/lib/studio/video-generations";

type UploadPayload = { userId: string; generationId: string };

function parseClientPayload(value: string | null | undefined): { generationId: string } | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && "generationId" in parsed && typeof parsed.generationId === "string") {
      return { generationId: parsed.generationId };
    }
  } catch {
    // Invalid client payloads are rejected before issuing an upload token.
  }
  return null;
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "El almacenamiento de videos no está configurado." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Solicitud de carga inválida." }, { status: 400 });
  const isCallback = body.type === "blob.upload-completed";
  const guard = isCallback ? null : await requireMember();
  if (guard && !guard.ok) return guard.response;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!guard?.ok) throw new Error("No autorizado.");
        const payload = parseClientPayload(clientPayload);
        if (
          !payload ||
          !["webm", "mp4"].some((extension) => pathname === `lyra-videos/${payload.generationId}.${extension}`)
        ) {
          throw new Error("Carga no válida.");
        }
        const generation = await getPrisma().videoGeneration.findFirst({
          where: { id: payload.generationId, userId: guard.user.id, status: "assembling" },
          select: { id: true },
        });
        if (!generation) throw new Error("La generación ya no está disponible.");
        return {
          allowedContentTypes: ["video/webm", "video/mp4"],
          addRandomSuffix: true,
          maximumSizeInBytes: 120_000_000,
          tokenPayload: JSON.stringify({ userId: guard.user.id, generationId: payload.generationId } satisfies UploadPayload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: UploadPayload | null = null;
        try {
          const parsed: unknown = JSON.parse(tokenPayload ?? "");
          if (
            parsed &&
            typeof parsed === "object" &&
            "userId" in parsed &&
            typeof parsed.userId === "string" &&
            "generationId" in parsed &&
            typeof parsed.generationId === "string"
          ) {
            payload = { userId: parsed.userId, generationId: parsed.generationId };
          }
        } catch {
          throw new Error("Token de carga inválido.");
        }
        if (!payload) throw new Error("Token de carga inválido.");
        const result = await finalizeVideoGeneration(payload.userId, payload.generationId, blob.url);
        if (!result.ok) throw new Error(result.error);
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo preparar la carga del video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
