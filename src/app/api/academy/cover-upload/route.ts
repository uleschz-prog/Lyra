import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { lyraOfficialCourseIds } from "@/lib/academy/constants";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

const maxCoverBytes = 5 * 1024 * 1024;
type CoverPayload = { userId: string; courseId: string };

function parseClientPayload(value: string | null | undefined): { courseId: string } | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "courseId" in parsed &&
      typeof parsed.courseId === "string" &&
      parsed.courseId.length > 0 &&
      parsed.courseId.length <= 128
    ) {
      return { courseId: parsed.courseId };
    }
  } catch {
    return null;
  }
  return null;
}

function parseTokenPayload(value: string | null | undefined): CoverPayload | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "userId" in parsed &&
      typeof parsed.userId === "string" &&
      "courseId" in parsed &&
      typeof parsed.courseId === "string"
    ) {
      return { userId: parsed.userId, courseId: parsed.courseId };
    }
  } catch {
    return null;
  }
  return null;
}

async function canManageCourse(userId: string, courseId: string) {
  const [user, course] = await Promise.all([
    getPrisma().user.findUnique({ where: { id: userId }, select: { role: true } }),
    getPrisma().course.findUnique({ where: { id: courseId }, select: { id: true, creatorId: true } }),
  ]);
  if (!user || !course) return false;
  if (course.creatorId === userId) return true;
  return (
    user.role === "ADMIN" &&
    course.creatorId === null &&
    lyraOfficialCourseIds.includes(course.id as (typeof lyraOfficialCourseIds)[number])
  );
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "El almacenamiento de portadas no está configurado." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Solicitud de carga inválida." }, { status: 400 });
  const isCallback = body.type === "blob.upload-completed";
  const user = isCallback ? null : await getCurrentUser();
  if (!isCallback && !user) return NextResponse.json({ error: "Inicia sesión para cambiar la portada." }, { status: 401 });

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!user) throw new Error("No autorizado.");
        const payload = parseClientPayload(clientPayload);
        const expectedPrefix = payload ? `lyra-academy-covers/${payload.courseId}-` : "";
        if (!payload || !pathname.startsWith(expectedPrefix) || !pathname.endsWith(".webp")) {
          throw new Error("Archivo de portada no válido.");
        }
        if (!(await canManageCourse(user.id, payload.courseId))) throw new Error("No tienes permiso para editar este curso.");
        return {
          allowedContentTypes: ["image/webp"],
          addRandomSuffix: false,
          maximumSizeInBytes: maxCoverBytes,
          tokenPayload: JSON.stringify({ userId: user.id, courseId: payload.courseId } satisfies CoverPayload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseTokenPayload(tokenPayload);
        if (
          !payload ||
          blob.contentType !== "image/webp" ||
          !blob.pathname.startsWith(`lyra-academy-covers/${payload.courseId}-`) ||
          !blob.pathname.endsWith(".webp") ||
          !(await canManageCourse(payload.userId, payload.courseId))
        ) {
          throw new Error("No se pudo validar la portada cargada.");
        }
        await getPrisma().course.update({
          where: { id: payload.courseId },
          data: { coverImageUrl: blob.url },
        });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar la portada.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
