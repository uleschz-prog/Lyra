import type { SignupPlanId } from "@/config/compensation-plan";

/** USDC nativo de Polygon. El precio no se mueve y la red cobra centavos. */
export const polygonUsdcAddress = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

export const polygonChainId = 137;

export const membershipPackages = {
  STARTED: 1,
  PRO: 2,
  FOUNDER: 3,
} as const;

export function membershipPackageId(plan: SignupPlanId) {
  if (plan === "STARTED") return 1;
  if (plan === "FOUNDER") return 3;
  return 2;
}

export function membershipAddress() {
  const value = process.env.NEXT_PUBLIC_LYRA_MEMBERSHIP_ADDRESS?.trim() ?? "";
  return value;
}
