/**
 * Límites de un turno de Vega: cuántas llamadas al modelo y cuánto tiempo.
 * La ruta del chat tiene maxDuration = 60 s; el presupuesto deja margen para
 * guardar el mensaje, reembolsar y (en WhatsApp) enviar la respuesta.
 */

export type VegaLimits = {
  /** Llamadas al modelo por turno (cada una puede pedir herramientas). */
  maxSteps: number;
  /** Tiempo total del turno, contado desde que se prepara. */
  timeBudgetMs: number;
  /** Tiempo mínimo que debe quedar para abrir otra llamada al modelo. */
  minStepMs: number;
};

export const defaultVegaLimits: VegaLimits = { maxSteps: 12, timeBudgetMs: 45_000, minStepMs: 8_000 };

function readInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function vegaLimits(env: Record<string, string | undefined> = process.env): VegaLimits {
  return {
    maxSteps: readInt(env.VEGA_MAX_STEPS, defaultVegaLimits.maxSteps, 1, 30),
    // Nunca más de 55 s mientras la ruta tenga maxDuration = 60.
    timeBudgetMs: readInt(env.VEGA_TIME_BUDGET_MS, defaultVegaLimits.timeBudgetMs, 10_000, 55_000),
    minStepMs: defaultVegaLimits.minStepMs,
  };
}

export type StopReason = "steps" | "time";

export type TurnBudget = ReturnType<typeof createTurnBudget>;

export function createTurnBudget(limits: VegaLimits, startedAt: number, now: () => number = Date.now) {
  const deadline = startedAt + limits.timeBudgetMs;
  return {
    limits,
    deadline,
    remainingMs: () => Math.max(0, deadline - now()),
    elapsedMs: () => now() - startedAt,
    /** ¿Se puede abrir la llamada número `callIndex` (0 = la primera)? */
    canCallModel(callIndex: number): { ok: true } | { ok: false; reason: StopReason } {
      if (callIndex >= limits.maxSteps) return { ok: false, reason: "steps" };
      if (deadline - now() < limits.minStepMs) return { ok: false, reason: "time" };
      return { ok: true };
    },
    /** Tiempo máximo para una llamada al modelo: lo que quede del presupuesto. */
    modelTimeoutMs: () => Math.max(1_000, deadline - now()),
  };
}

export function continueNote(reason: StopReason) {
  return reason === "time"
    ? "(Se me acabó el tiempo de este turno. Escribe «continúa» y sigo donde me quedé.)"
    : "(Llegué al límite de pasos de este turno. Escribe «continúa» y sigo donde me quedé.)";
}
