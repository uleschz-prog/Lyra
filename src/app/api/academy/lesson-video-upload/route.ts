import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

const maxVideoBytes = 120_000_000;
const videoTypes = new Map([
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);
type UploadPayload = { userId: string; courseId: string; moduleId: string };

function parseClientPayload(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "courseId" in parsed &&
      typeof parsed.courseId === "string" &&
      "moduleId" in parsed &&
      typeof parsed.moduleId === "string"
    ) {
      return { courseId: parsed.courseId, moduleId: parsed.moduleId };
    }
  } catch {
    return null;
  }
  return null;
}

function parseTokenPayload(value: string | null | undefined): UploadPayload | null {
  const parsed = parseClientPayload(value);
  if (!parsed) return null;
  try {
    const token: unknown = JSON.parse(value ?? "");
    if (token && typeof token === "object" && "userId" in token && typeof token.userId === "string") {
      return { ...parsed, userId: token.userId };
    }
  } catch {
    return null;
  }
  return null;
}

async function ownsModule(userId: string, courseId: string, moduleId: string) {
  return Boolean(
    await getPrisma().courseModule.findFirst({
      where: { id: moduleId, courseId, course: { creatorId: userId } },
      select: { id: true },
    }),
  );
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "El almacenamiento de videos no está configurado." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Solicitud de carga inválida." }, { status: 400 });
  const isCallback = body.type === "blob.upload-completed";
  const user = isCallback ? null : await getCurrentUser();
  if (!isCallback && !user) return NextResponse.json({ error: "Inicia sesión para subir un video." }, { status: 401 });

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        if (!user || !payload || !pathname.startsWith(`lyra-academy-videos/${payload.courseId}/`)) {
          throw new Error("No autorizado para subir este video.");
        }
        const extension = pathname.slice(pathname.lastIndexOf("."));
        if (!videoTypes.has(extension) || !/^[a-f\d-]{36}\.(mp4|webm)$/i.test(pathname.split("/").at(-1) ?? "")) {
          throw new Error("El archivo debe ser un video MP4 o WebM.");
        }
        if (!(await ownsModule(user.id, payload.courseId, payload.moduleId))) {
          throw new Error("El módulo no pertenece a uno de tus cursos.");
        }
        return {
          allowedContentTypes: [...videoTypes.values()],
          addRandomSuffix: false,
          maximumSizeInBytes: maxVideoBytes,
          tokenPayload: JSON.stringify({ ...payload, userId: user.id } satisfies UploadPayload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseTokenPayload(tokenPayload);
        const expectedType = videoTypes.get(blob.pathname.slice(blob.pathname.lastIndexOf(".")));
        if (
          !payload ||
          !blob.pathname.startsWith(`lyra-academy-videos/${payload.courseId}/`) ||
          !expectedType ||
          blob.contentType !== expectedType ||
          !(await ownsModule(payload.userId, payload.courseId, payload.moduleId))
        ) {
          throw new Error("No se pudo validar el video cargado.");
        }
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo preparar la carga del video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
