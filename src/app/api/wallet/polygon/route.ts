import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";

import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para vincular MetaMask." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { address?: unknown } | null;
  const raw = typeof body?.address === "string" ? body.address : "";
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "Esa dirección de MetaMask no es válida." }, { status: 400 });
  }
  const address = getAddress(raw);

  try {
    await getPrisma().user.update({ where: { id: user.id }, data: { polygonWallet: address } });
  } catch {
    return NextResponse.json({ error: "Esa MetaMask ya está vinculada a otra cuenta." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, address });
}
