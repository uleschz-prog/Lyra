import { getPrisma } from "@/lib/prisma";
import { fulfillAcademyPayment } from "@/lib/academy/fulfill";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as
    | { type?: string; action?: string; data?: { id?: string | number } }
    | null;
  const type = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const paymentId = String(body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (type !== "payment" || !paymentId) return new Response("ok");

  const externalReference = url.searchParams.get("external_reference");
  const transaction = externalReference
    ? await getPrisma().academyTransaction.findUnique({ where: { externalReference }, select: { externalReference: true } })
    : await getPrisma().academyTransaction.findUnique({
        where: { gatewayPaymentId: paymentId },
        select: { externalReference: true },
      });
  if (!transaction) return new Response("ok");

  try {
    const result = await fulfillAcademyPayment(transaction.externalReference, paymentId);
    if (!result.ok && result.error === "No pudimos consultar el pago.") {
      return new Response("retry", { status: 500 });
    }
    return new Response("ok");
  } catch {
    return new Response("retry", { status: 500 });
  }
}
