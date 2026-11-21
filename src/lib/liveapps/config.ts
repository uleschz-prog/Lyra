// Datos en vivo para apps generadas por Vega: constantes de negocio y límites. Ule decide los valores;
// todo vive aquí, con nombres claros, para cambiarlos sin buscar en el código.

/**
 * Interruptor de código. false: solo administradores de LYRA pueden activar datos en vivo.
 * true: cualquier socio que use Vega. (No depende de variables de entorno.)
 */
export const LIVE_APPS_ENABLED = false;

/** Créditos por construir una app con datos en vivo (la app local cuesta builderPrice("app")). */
export const LIVE_APP_BUILD_PRICE = 20;

/** Cuota mensual por app con datos en vivo. 0 = desactivada (decisión pendiente de Ule). */
export const LIVE_APP_MONTHLY_FEE = 0;

export const liveAppLimits = {
  /** Registros activos por app. */
  maxRecords: 100_000,
  /** Tamaño de un registro (JSON). */
  maxRecordBytes: 16_000,
  maxCollections: 20,
  maxFields: 24,
  /** Renglones en un campo de lista (p. ej. platillos de una comanda). */
  maxItems: 60,
  maxMembers: 60,
  maxBranches: 12,
  maxRoles: 8,
  /** Operaciones por escritura atómica. */
  maxBatchOps: 80,
  /** Cambios por respuesta de sincronización. */
  maxChanges: 500,
  /** Escrituras por app por día (CDMX). */
  writesPerDay: 50_000,
  /** Peticiones por sesión por minuto (la sincronización usa ~20). */
  requestsPerMinute: 240,
  /** Duración de una sesión (un turno largo). */
  sessionHours: 14,
  /** Colecciones «recientes» (comandas, movimientos): al entrar solo se bajan las de estas horas. */
  recentHours: 48,
  pinLength: 6,
  /** Tamaño máximo del cuerpo de una petición. */
  maxBodyBytes: 256_000,
} as const;

/** Intentos fallidos de PIN (cuentan en AuthAttempt, solo hashes). */
export const pinAttemptLimits = {
  perIp: { max: 10, windowMs: 10 * 60_000 },
  perApp: { max: 120, windowMs: 60 * 60_000 },
} as const;

export function liveAppsAvailable(user: { role?: string | null } | null | undefined) {
  return LIVE_APPS_ENABLED || user?.role === "ADMIN";
}

/** Día en Ciudad de México (YYYY-MM-DD) para los contadores de uso. */
export function usageDay(now: Date) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}
