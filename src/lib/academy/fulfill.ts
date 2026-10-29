import { getAcademyMercadoPagoPayment, getAcademySellerToken } from "@/lib/academy/mercadopago";
import { getPrisma } from "@/lib/prisma";

const paymentStatuses: Record<string, "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REFUNDED"> = {
  pending: "PENDING",
  in_process: "PENDING",
  in_mediation: "PENDING",
  authorized: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  charged_back: "REFUNDED",
};

function cents(value: number | string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export async function fulfillAcademyPayment(externalReference: string, paymentId: string) {
  if (!/^lyra_academy_[\da-f]{32}$/i.test(externalReference)) {
    return { ok: false as const, error: "Referencia de pago inválida." };
  }
  const prisma = getPrisma();
  const transaction = await prisma.academyTransaction.findUnique({
    where: { externalReference },
    include: { creatorAccount: true },
  });
  if (!transaction) return { ok: false as const, error: "La compra no existe." };

  const accessToken = await getAcademySellerToken(transaction.creatorAccount);
  const payment = await getAcademyMercadoPagoPayment(paymentId, accessToken);
  if (!payment) return { ok: false as const, error: "No pudimos consultar el pago." };
  if (
    String(payment.id) !== paymentId ||
    payment.external_reference !== transaction.externalReference ||
    String(payment.collector_id) !== transaction.creatorAccount.sellerId ||
    payment.currency_id !== transaction.currency ||
    cents(payment.transaction_amount) !== cents(transaction.totalAmount.toString())
  ) {
    return { ok: false as const, error: "El pago no coincide con la compra registrada." };
  }

  const mappedStatus = paymentStatuses[payment.status];
  if (!mappedStatus) return { ok: false as const, error: `Estado de pago no reconocido: ${payment.status}.` };
  const refunded = cents(payment.transaction_amount_refunded ?? 0);
  const totalCents = cents(transaction.totalAmount.toString());
  const fullyRefunded =
    mappedStatus === "REFUNDED" ||
    (refunded !== null && totalCents !== null && refunded >= totalCents);
  const status = fullyRefunded ? "REFUNDED" : mappedStatus;

  await prisma.$transaction(async (tx) => {
    const current = await tx.academyTransaction.findUnique({
      where: { id: transaction.id },
      select: { gatewayPaymentId: true },
    });
    if (current?.gatewayPaymentId && current.gatewayPaymentId !== paymentId) {
      throw new Error("La referencia ya está asociada a otro pago de Mercado Pago.");
    }

    await tx.academyTransaction.update({
      where: { id: transaction.id },
      data: {
        gatewayPaymentId: paymentId,
        paymentGatewayStatus: status,
        gatewayStatusDetail: payment.status_detail ?? null,
        paidAt: status === "APPROVED" ? (transaction.paidAt ?? new Date()) : undefined,
        refundedAt: fullyRefunded ? new Date() : undefined,
      },
    });

    if (status === "APPROVED") {
      await tx.courseEnrollment.upsert({
        where: { courseId_studentId: { courseId: transaction.courseId, studentId: transaction.buyerId } },
        create: {
          courseId: transaction.courseId,
          studentId: transaction.buyerId,
          purchaseTransactionId: transaction.id,
          status: "ACTIVE",
        },
        update: {
          purchaseTransactionId: transaction.id,
          status: "ACTIVE",
          enrolledAt: new Date(),
          expiresAt: null,
        },
      });
    } else if (fullyRefunded) {
      const anotherPaidTransaction = await tx.academyTransaction.findFirst({
        where: {
          id: { not: transaction.id },
          courseId: transaction.courseId,
          buyerId: transaction.buyerId,
          paymentGatewayStatus: "APPROVED",
        },
        orderBy: { paidAt: "desc" },
        select: { id: true },
      });
      if (anotherPaidTransaction) {
        await tx.courseEnrollment.updateMany({
          where: {
            courseId: transaction.courseId,
            studentId: transaction.buyerId,
            purchaseTransactionId: transaction.id,
          },
          data: { purchaseTransactionId: anotherPaidTransaction.id, status: "ACTIVE" },
        });
      } else {
        await tx.courseEnrollment.updateMany({
          where: {
            courseId: transaction.courseId,
            studentId: transaction.buyerId,
            purchaseTransactionId: transaction.id,
          },
          data: { status: "CANCELLED" },
        });
      }
    }
  });

  return { ok: true as const, status };
}
