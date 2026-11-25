import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { advanceImageGeneration, getImageForUser } from "@/lib/vega/images/runner";
import { getPrisma } from "@/lib/prisma";

// Una llamada genera la imagen (≤ 50 s del proveedor): cabe en Vercel Hobby (60 s).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

async function owned(context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401, headers: noStore }) };
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return { error: NextResponse.json({ error: "No encontrado." }, { status: 404, headers: noStore }) };
  const image = await getImageForUser(getPrisma(), user.id, id);
  if (!image) return { error: NextResponse.json({ error: "No encontrado." }, { status: 404, headers: noStore }) };
  return { id, image };
}

/** Estado de la imagen (sin generarla). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const found = await owned(context);
  if ("error" in found) return found.error;
  return NextResponse.json({ image: found.image }, { headers: noStore });
}

/** Genera la imagen si sigue pendiente (la tarjeta del chat lo llama mientras siga en curso). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const found = await owned(context);
  if ("error" in found) return found.error;
  if (found.image.status === "done" || found.image.status === "failed") return NextResponse.json({ image: found.image }, { headers: noStore });
  const image = await advanceImageGeneration(found.id, { db: getPrisma() });
  return NextResponse.json({ image: image ?? found.image }, { headers: noStore });
}
