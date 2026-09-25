import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth/session";
import { isSuspended, suspensionMessage } from "@/lib/auth/suspension";
import { getPrisma } from "@/lib/prisma";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "La base de datos no está configurada." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    identifier?: unknown;
    password?: unknown;
  } | null;
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!identifier || !password) {
    return NextResponse.json({ error: "Escribe tu correo o usuario y la contraseña." }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }],
      },
      select: { id: true, password: true, suspendedUntil: true },
    });

    const matches = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !matches) {
      return NextResponse.json({ error: "Correo, usuario o contraseña incorrectos." }, { status: 401 });
    }
    if (user.suspendedUntil && isSuspended(user.suspendedUntil)) {
      return NextResponse.json({ error: suspensionMessage(user.suspendedUntil) }, { status: 403 });
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("SESSION_SECRET")) {
      return NextResponse.json({ error: "Falta SESSION_SECRET en el servidor." }, { status: 503 });
    }
    return NextResponse.json({ error: "No se pudo iniciar sesión." }, { status: 500 });
  }
}
