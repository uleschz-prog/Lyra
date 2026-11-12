import { receiveHiggsfieldWebhook } from "@/lib/ai/higgsfield-generation";

export const maxDuration = 60;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const generationId = url.searchParams.get("generationId") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!generationId || !token) return new Response("Not found", { status: 404 });

  try {
    const accepted = await receiveHiggsfieldWebhook(generationId, token);
    return accepted ? new Response("ok") : new Response("retry", { status: 503 });
  } catch {
    return new Response("retry", { status: 503 });
  }
}
