import { aiJson, chargeAiCall, idempotencyKeyFrom, requireAiUser } from "@/lib/ai/guard";
import { aiPricing } from "@/config/ai-pricing";

export const maxDuration = 60;

function scenesFromScript(script: string) {
  const parts = script
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  const scenes = parts.length > 0 ? parts : [script];
  return scenes.map((line, index) => ({ index: index + 1, line }));
}

export async function POST(request: Request) {
  const session = await requireAiUser();
  if (!session.user) return session.response;
  const user = session.user;

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    script?: unknown;
    idempotencyKey?: unknown;
  } | null;

  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "Pieza LYRA";
  const script = typeof body?.script === "string" ? body.script.trim().slice(0, 2000) : "";

  if (script.length < 12) {
    return aiJson({ error: "El guion necesita al menos una frase." }, 400, user.credits);
  }

  const paid = await chargeAiCall({
    userId: user.id,
    cost: aiPricing.video,
    reason: "ai.video",
    description: `Video · ${title}`,
    idempotencyKey: idempotencyKeyFrom(request, body?.idempotencyKey),
    metadata: { route: "video" },
    execute: async () => ({
      mode: "preview" as const,
      provider: "lyra" as const,
      title,
      status: "ready" as const,
      scenes: scenesFromScript(script),
      message: "LYRA armó el video a partir de tu guion y tus imágenes.",
    }),
  });

  if (!paid.ok) return aiJson({ error: paid.error }, paid.status, paid.balance);
  return aiJson({ ...paid.value, charged: paid.charged }, 200, paid.balance);
}
