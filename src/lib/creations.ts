import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export type CreationArea = "notebook" | "studio";
export type CreationKind = "audio" | "video" | "pdf" | "image";

export type CreationRecord = {
  id: string;
  area: CreationArea;
  kind: CreationKind;
  title: string;
  body: string;
  media: string | null;
  createdAt: string;
};

function isArea(value: string): value is CreationArea {
  return value === "notebook" || value === "studio";
}

function isKind(value: string): value is CreationKind {
  return value === "audio" || value === "video" || value === "pdf" || value === "image";
}

export async function listCreations(area: CreationArea): Promise<CreationRecord[]> {
  const user = await getCurrentUser();
  if (!user || !process.env.DATABASE_URL) return [];

  const rows = await getPrisma().creationPiece.findMany({
    where: { userId: user.id, area },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return rows.flatMap((row) => {
    if (!isArea(row.area) || !isKind(row.kind)) return [];
    return [
      {
        id: row.id,
        area: row.area,
        kind: row.kind,
        title: row.title,
        body: row.body,
        media: row.media,
        createdAt: row.createdAt.toISOString(),
      },
    ];
  });
}

export async function saveCreation(input: {
  area: CreationArea;
  kind: CreationKind;
  title: string;
  body: string;
  media?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user || !process.env.DATABASE_URL) return null;

  const row = await getPrisma().creationPiece.create({
    data: {
      userId: user.id,
      area: input.area,
      kind: input.kind,
      title: input.title.trim().slice(0, 120) || "Pieza",
      body: input.body.slice(0, 20000),
      media: input.media ? input.media.slice(0, 2_000_000) : null,
    },
    select: { id: true, createdAt: true },
  });

  return { id: row.id, createdAt: row.createdAt.toISOString() };
}

export async function removeCreation(id: string) {
  const user = await getCurrentUser();
  if (!user || !process.env.DATABASE_URL) return false;
  const result = await getPrisma().creationPiece.deleteMany({ where: { id, userId: user.id } });
  return result.count > 0;
}
