import { NextResponse } from "next/server";

import { AuthError, registerMember } from "@/lib/auth/register-member";
import { clientIp } from "@/lib/auth/rate-limit";
import { authLimitResponse, noteAuthAttempt } from "@/lib/auth/rate-limit-server";
import { createSession } from "@/lib/auth/session";
import { requestOrigin, signupCheckout } from "@/lib/payments/signup";

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    username?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
    packageId?: unknown;
    ref?: unknown;
    idea?: unknown;
    kind?: unknown;
    code?: unknown;
  } | null;

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return NextResponse.json({ error: "Falta SESSION_SECRET en el servidor." }, { status: 503 });
  }

  const text = (value: unknown) => (typeof value === "string" ? value : "");

  // Todos los intentos cuentan (también los que fallan por validación o por correo repetido),
  // así nadie puede probar correos en masa para saber cuáles tienen cuenta.
  const subject = { ip: clientIp(request), id: text(body?.email).trim().toLowerCase() };
  const limited = await authLimitResponse("register", subject);
  if (limited) return limited;
  await noteAuthAttempt("register", subject);

  try {
    const user = await registerMember({
      name: text(body?.name),
      email: text(body?.email),
      username: text(body?.username),
      password: text(body?.password),
      confirmPassword: text(body?.confirmPassword),
      packageId: text(body?.packageId),
      ref: text(body?.ref),
      code: text(body?.code),
    });
    await createSession(user.id);
    return NextResponse.json({ ok: true, next: "/pago", checkout: user.pending ? await signupCheckout(user.id, requestOrigin(request)) : null });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.includes("SESSION_SECRET")) {
      return NextResponse.json({ error: "Falta SESSION_SECRET en el servidor." }, { status: 503 });
    }
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }
}
