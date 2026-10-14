export function authorizeCron(header: string | null, secret: string | undefined): boolean {
  return Boolean(secret) && header === `Bearer ${secret}`;
}
