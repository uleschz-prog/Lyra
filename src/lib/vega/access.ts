import { hasActiveMembership } from "@/config/compensation-plan";
import type { AuthProfile } from "@/lib/types";

export function canUseVega(user: Pick<AuthProfile, "role" | "package"> | null) {
  if (!user) return false;
  return user.role === "ADMIN" || hasActiveMembership(user.package);
}
