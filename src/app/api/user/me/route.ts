import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }
  return NextResponse.json(user);
}
