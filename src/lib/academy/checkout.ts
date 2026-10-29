import { randomUUID } from "node:crypto";

import {
  academyMarketplaceEnabled,
  createAcademyMarketplacePreference,
  getAcademySellerToken,
} from "@/lib/academy/mercadopago";
import { getPrisma } from "@/lib/prisma";

export function calculateAcademySplit(amount: string | number) {
  const raw = String(amount);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) throw new Error("El precio debe tener hasta dos decimales.");
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) throw new Error("El precio del curso excede el límite permitido.");
  if (cents <= 0) throw new Error("El precio del curso debe ser mayor a cero.");
  const lyraCents = Math.floor((cents * 7 + 50) / 100);
  const creatorCents = cents - lyraCents;
  return {
    totalAmount: (cents / 100).toFixed(2),
    lyraFee7Percent: (lyraCents / 100).toFixed(2),
    creatorPayout93Percent: (creatorCents / 100).toFixed(2),
    totalNumber: cents / 100,
    feeNumber: lyraCents / 100,
  };
}

export type AcademyCheckoutResult =
  | { ok: true; url: string; free: false }
  | { ok: true; url: null; free: true }
  | { ok: false; status: number; error: string };

export async function beginAcademyCheckout(studentId: string, courseId: string): Promise<AcademyCheckoutResult> {
  const prisma = getPrisma();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      creatorId: true,
      title: true,
      price: true,
      currency: true,
      pricingType: true,
      status: true,
    },
  });
  if (!course || course.status !== "PUBLISHED") {
    return { ok: false, status: 404, error: "El curso no está disponible." };
  }
  if (course.creatorId === studentId) {
    return { ok: false, status: 409, error: "No puedes inscribirte en tu propio curso." };
  }

  const existing = await prisma.courseEnrollment.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
    select: { status: true, expiresAt: true },
  });
  if (
    existing?.status === "ACTIVE" &&
    (!existing.expiresAt || existing.expiresAt.getTime() > Date.now())
  ) {
    return { ok: false, status: 409, error: "Ya tienes acceso a este curso." };
  }

  const coursePrice = Number(course.price);
  if (!Number.isFinite(coursePrice) || coursePrice < 0) {
    return { ok: false, status: 409, error: "El precio del curso no está configurado correctamente." };
  }

  if (course.pricingType === "MONTHLY") {
    return {
      ok: false,
      status: 409,
      error: "Los pagos mensuales están deshabilitados hasta confirmar el split recurrente de Mercado Pago.",
    };
  }

  if (course.pricingType === "FREE") {
    if (coursePrice !== 0) {
      return { ok: false, status: 409, error: "El curso gratuito tiene un precio configurado; contacta al creador." };
    }
    await prisma.courseEnrollment.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      create: { courseId, studentId, status: "ACTIVE" },
      update: { status: "ACTIVE", enrolledAt: new Date(), expiresAt: null, purchaseTransactionId: null },
    });
    return { ok: true, url: null, free: true };
  }

  if (course.pricingType !== "ONE_TIME" || !course.creatorId) {
    return { ok: false, status: 409, error: "El curso todavía no está habilitado para pagos." };
  }
  if (coursePrice <= 0) {
    return { ok: false, status: 409, error: "El precio del curso de pago no está configurado correctamente." };
  }
  if (!academyMarketplaceEnabled()) {
    return { ok: false, status: 503, error: "El Marketplace de Academia aún no está habilitado." };
  }

  const account = await prisma.creatorAccount.findUnique({ where: { userId: course.creatorId } });
  if (!account || account.status !== "connected") {
    return { ok: false, status: 409, error: "El creador todavía no conectó su cuenta de Mercado Pago." };
  }
  if (course.currency !== "MXN" || account.siteId !== "MLM") {
    return { ok: false, status: 409, error: "Por ahora los cursos se cobran en MXN." };
  }

  const split = calculateAcademySplit(course.price.toString());
  const recentCheckout = await prisma.academyTransaction.findFirst({
    where: {
      courseId,
      buyerId: studentId,
      paymentGatewayStatus: { in: ["CREATED", "PENDING"] },
      checkoutUrl: { not: null },
      createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    select: { checkoutUrl: true },
  });
  if (recentCheckout?.checkoutUrl) return { ok: true, url: recentCheckout.checkoutUrl, free: false };

  const externalReference = `lyra_academy_${randomUUID().replaceAll("-", "")}`;
  const transaction = await prisma.academyTransaction.create({
    data: {
      courseId,
      buyerId: studentId,
      creatorId: course.creatorId,
      creatorAccountId: account.id,
      externalReference,
      totalAmount: split.totalAmount,
      lyraFee7Percent: split.lyraFee7Percent,
      creatorPayout93Percent: split.creatorPayout93Percent,
      currency: course.currency,
    },
    select: { id: true },
  });

  try {
    const accessToken = await getAcademySellerToken(account);
    const preference = await createAcademyMarketplacePreference({
      accessToken,
      sellerId: account.sellerId,
      externalReference,
      courseId: course.id,
      courseTitle: course.title,
      buyerId: studentId,
      creatorId: course.creatorId,
      price: split.totalNumber,
      fee: split.feeNumber,
      currency: course.currency,
    });
    if (!preference.id || !preference.init_point) {
      throw new Error("Mercado Pago no devolvió el enlace de pago.");
    }
    await prisma.academyTransaction.update({
      where: { id: transaction.id },
      data: {
        gatewayPreferenceId: preference.id,
        checkoutUrl: preference.init_point,
      },
    });
    return { ok: true, url: preference.init_point, free: false };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : "Error desconocido de Mercado Pago.";
    await prisma.academyTransaction.update({
      where: { id: transaction.id },
      data: { paymentGatewayStatus: "REJECTED", gatewayStatusDetail: detail },
    });
    return { ok: false, status: 502, error: "Mercado Pago no pudo crear el pago. Verifica la conexión del creador e inténtalo de nuevo." };
  }
}
