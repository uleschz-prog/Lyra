/**
 * Preview y producción comparten DATABASE_URL. `prisma db push` desde un
 * preview escribiría el esquema de producción. Vercel fija VERCEL_ENV y no
 * se puede suplantar: solo el despliegue de producción sincroniza.
 */
export function shouldSyncSchema({ vercelEnv, databaseUrl }) {
  return vercelEnv === "production" && typeof databaseUrl === "string" && databaseUrl.startsWith("postgres");
}
