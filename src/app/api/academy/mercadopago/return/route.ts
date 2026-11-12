import { NextResponse } from "next/server";

import { fulfillAcademyPayment } from "@/lib/academy/fulfill";
import { academyReturnUrl } from "@/lib/academy/mercadopago";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const externalReference = url.searchParams.get("external_reference") ?? "";
  const paymentId = url.searchParams.get("payment_id") ?? url.searchParams.get("collection_id") ?? "";
  let status = "error";

  if (externalReference && /^\d{1,20}$/.test(paymentId)) {
    const result = await fulfillAcademyPayment(externalReference, paymentId).catch(() => null);
    if (result?.ok) {
      status = result.status === "APPROVED" ? "ok" : result.status === "PENDING" ? "pendiente" : "error";
    } else {
      const transaction = await getPrisma().academyTransaction.findUnique({
        where: { externalReference },
        select: { paymentGatewayStatus: true },
      }).catch(() => null);
      if (transaction?.paymentGatewayStatus === "APPROVED") status = "ok";
      else if (transaction?.paymentGatewayStatus === "PENDING") status = "pendiente";
    }
  }

  return NextResponse.redirect(academyReturnUrl(status));
}
