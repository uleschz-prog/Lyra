import { NextResponse } from "next/server";

import { AuthError, registerMember } from "@/lib/auth/register-member";
import { clearOauthProfile, readOauthProfile } from "@/lib/auth/oauth";
import { createSession } from "@/lib/auth/session";
import { requestOrigin, signupCheckout } from "@/lib/payments/signup";
import { getPrisma } from "@/lib/prisma";
import { ensureProject } from "@/lib/projects";

function usernameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "lyra";
  let slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 3) slug = `${slug}lyra`;
  return slug.slice(0, 24);
}

export async function POST(request: Request) {
  const profile = await readOauthProfile();
  if (!profile) {
    return NextResponse.json({ error: "La sesión con el proveedor expiró. Vuelve a entrar." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { packageId?: unknown; idea?: unknown; kind?: unknown } | null;
  const packageId = typeof body?.packageId === "string" ? body.packageId : "";
  const idea = (typeof body?.idea === "string" ? body.idea : "") || profile.idea;
  const kind = (typeof body?.kind === "string" ? body.kind : "") || profile.kind;

  if (process.env.DATABASE_URL) {
    const existing = await getPrisma().user.findUnique({
      where: { email: profile.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      await ensureProject(getPrisma(), existing.id, idea, kind);
      await createSession(existing.id);
      await clearOauthProfile();
      return NextResponse.json({ ok: true });
    }
  }

  const password = crypto.randomUUID() + crypto.randomUUID();
  let username = usernameFromEmail(profile.email);

  try {
    const user = await registerMember({
      name: profile.name.slice(0, 80),
      email: profile.email,
      username,
      password,
      confirmPassword: password,
      packageId,
      ref: profile.ref,
      idea,
      kind,
    });
    await createSession(user.id);
    await clearOauthProfile();
    const checkout = user.pending ? await signupCheckout(user.id, requestOrigin(request)) : null;
    return NextResponse.json({ ok: true, checkout });
  } catch (error) {
    if (error instanceof AuthError && error.message.includes("usuario")) {
      username = `${username.slice(0, 18)}-${crypto.randomUUID().slice(0, 4)}`;
      try {
        const user = await registerMember({
          name: profile.name.slice(0, 80),
          email: profile.email,
          username,
          password,
          confirmPassword: password,
          packageId,
          ref: profile.ref,
          idea,
          kind,
        });
        await createSession(user.id);
        await clearOauthProfile();
        const checkout = user.pending ? await signupCheckout(user.id, requestOrigin(request)) : null;
        return NextResponse.json({ ok: true, checkout });
      } catch (retry) {
        if (retry instanceof AuthError) {
          return NextResponse.json({ error: retry.message }, { status: retry.status });
        }
      }
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }
}
