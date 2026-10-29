import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { videoQuotaAllowance } from "@/lib/studio/video-quota-shared";

export { videoQuotaAllowance, videoQuotaDurationOptions, videoQuotaReservationSeconds } from "@/lib/studio/video-quota-shared";

export async function grantVideoQuota(
  tx: Prisma.TransactionClient,
  userId: string,
  packageId: string,
  now = new Date(),
) {
  const seconds = videoQuotaAllowance(packageId);
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const cycleId = randomUUID();
  await tx.user.update({
    where: { id: userId },
    data: {
      videoQuotaSeconds: seconds,
      videoQuotaExpiresAt: expiresAt,
      videoQuotaCycleId: cycleId,
    },
  });
  return { seconds, expiresAt, cycleId };
}

export async function getVideoQuotaBalance(userId: string, now = new Date()) {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { package: true, videoQuotaSeconds: true, videoQuotaExpiresAt: true },
  });
  if (!user || !user.videoQuotaExpiresAt || user.videoQuotaExpiresAt <= now) {
    return { remainingSeconds: 0, allowanceSeconds: videoQuotaAllowance(user?.package), expiresAt: null };
  }
  return {
    remainingSeconds: user.videoQuotaSeconds,
    allowanceSeconds: videoQuotaAllowance(user.package),
    expiresAt: user.videoQuotaExpiresAt.toISOString(),
  };
}
