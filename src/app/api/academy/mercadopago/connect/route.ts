import { NextResponse } from "next/server";

import { encryptAcademyCredential, hashAcademyOAuthState } from "@/lib/academy/credentials";
import { createAcademyOAuthAuthorization } from "@/lib/academy/mercadopago";
import { getCurrentUser } from "@/lib/auth/profile";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para conectar Mercado Pago." }, { status: 401 });

  try {
    const oauth = createAcademyOAuthAuthorization();
    const prisma = getPrisma();
    await prisma.academyOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.academyOAuthState.create({
      data: {
        userId: user.id,
        stateHash: hashAcademyOAuthState(oauth.state),
        codeVerifierEncrypted: encryptAcademyCredential(oauth.verifier),
        expiresAt: new Date(Date.now() + 8 * 60_000),
      },
    });
    return NextResponse.redirect(oauth.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar la conexión.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
