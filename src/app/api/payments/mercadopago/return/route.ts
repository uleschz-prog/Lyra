import { NextResponse } from "next/server";

import { fulfillMercadoPago } from "@/lib/payments/fulfill";
import { requestOrigin } from "@/lib/payments/signup";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("payment_id") ?? url.searchParams.get("collection_id") ?? "";
  const target = new URL("/dashboard/wallet", requestOrigin(request));

  if (!id || id === "null") {
    target.searchParams.set("pago", "cancelado");
    return NextResponse.redirect(target);
  }

  const result = await fulfillMercadoPago(id).catch(() => null);
  if (result?.ok) {
    target.searchParams.set("pago", "ok");
    target.searchParams.set("tipo", result.purpose);
  } else {
    target.searchParams.set("pago", result?.status === "pending" || result?.status === "in_process" ? "pendiente" : "error");
  }
  return NextResponse.redirect(target);
}
