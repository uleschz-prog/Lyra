/**
 * Preview y producción pueden compartir DATABASE_URL. Un `prisma db push`
 * desde un preview escribiría el esquema de producción. Vercel fija
 * VERCEL_ENV y no se puede suplantar desde el proyecto: solo el despliegue
 * de producción sincroniza, y solo si la URL es Postgres.
 */
export function shouldSyncSchema({ vercelEnv, databaseUrl }) {
  return vercelEnv === "production" && typeof databaseUrl === "string" && databaseUrl.startsWith("postgres");
}
