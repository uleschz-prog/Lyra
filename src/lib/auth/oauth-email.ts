/** El proveedor tiene que afirmar que el correo es suyo. Un booleano o el string "true" de Apple cuentan. */
export function isProviderEmailVerified(value: unknown) {
  return value === true || value === "true";
}

type GithubEmail = { email?: unknown; primary?: unknown; verified?: unknown };

export function pickGithubEmail(list: unknown) {
  if (!Array.isArray(list)) return null;
  const verified = list.filter((item): item is GithubEmail & { email: string } => {
    if (!item || typeof item !== "object") return false;
    const email = item as GithubEmail;
    return typeof email.email === "string" && email.email.includes("@") && email.verified === true;
  });
  const chosen = verified.find((item) => item.primary === true) ?? verified[0];
  if (!chosen) return null;
  return chosen.email.trim().toLowerCase();
}
