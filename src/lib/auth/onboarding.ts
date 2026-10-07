export function onboardingPath(user: { role: string; package: string; polygonWallet?: string | null }) {
  if (user.role === "ADMIN") return null;
  if (user.package !== "NONE") return null;
  return "/pago";
}
