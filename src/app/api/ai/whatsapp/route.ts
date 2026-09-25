import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/profile";
import { sendWhatsappText } from "@/lib/ai/composio";

export const maxDuration = 60;

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para enviar por WhatsApp." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    to?: unknown;
    text?: unknown;
  } | null;

  const to = typeof body?.to === "string" ? digits(body.to) : "";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";

  if (to.length < 8 || to.length > 15) {
    return NextResponse.json({ error: "El destino de WhatsApp debe incluir el código de país." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "Escribe el mensaje que quieres enviar." }, { status: 400 });
  }

  const result = await sendWhatsappText(to, text);
  if (!result.sent) {
    const status = result.mode === "preview" ? 503 : 502;
    return NextResponse.json(
      { ...result, error: result.error, connectUrl: "connectUrl" in result ? result.connectUrl : null },
      { status },
    );
  }

  return NextResponse.json(result);
}
