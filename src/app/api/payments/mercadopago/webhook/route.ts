import { fulfillMercadoPago } from "@/lib/payments/fulfill";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as { type?: string; action?: string; data?: { id?: string | number } } | null;
  const type = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = String(body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");

  if (type !== "payment" || !id) return new Response("ok");
  try {
    await fulfillMercadoPago(id);
    return new Response("ok");
  } catch {
    return new Response("retry", { status: 500 });
  }
}
