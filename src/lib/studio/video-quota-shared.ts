const quotaSecondsByPackage: Record<string, number> = {
  STARTED: 40,
  FREE: 40,
  VEGA: 40,
  VEGA_PARTNER: 40,
  PRO: 140,
  POLARIS: 140,
  FOUNDER: 360,
  LYRA_MASTER: 360,
  CORPORATE: 360,
};

export const videoQuotaBaselineUsdPerSecond = 0.05;
export const wanPrimeQuotaMultiplier = 1.36;
export const videoQuotaCycleDays = 30;

export function videoQuotaAllowance(packageId: string | null | undefined) {
  return packageId ? quotaSecondsByPackage[packageId] ?? 0 : 0;
}

export function videoQuotaReservationSeconds(durationSeconds: number, model: string) {
  return Math.ceil(durationSeconds * (model === "wan-3.0-prime" ? wanPrimeQuotaMultiplier : 1));
}

export function videoQuotaDurationOptions(quotaSeconds: number, model: string) {
  const options = [10, 15, 20, 30, 45, 60, 90, 120, 150, 180];
  return options.filter((seconds) => videoQuotaReservationSeconds(seconds, model) <= quotaSeconds);
}
