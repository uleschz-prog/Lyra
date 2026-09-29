import type { AuthProfile } from "@/lib/types";

export const vegaPlans = ["FOUNDER", "CORPORATE", "VEGA_PARTNER"] as const;

export function canUseVega(user: Pick<AuthProfile, "role" | "package"> | null) {
  if (!user) return false;
  return user.role === "ADMIN" || (vegaPlans as readonly string[]).includes(user.package);
}
