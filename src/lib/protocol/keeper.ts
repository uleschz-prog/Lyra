export type KeeperSkipReason =
  | "sin_ejecutor"
  | "es_owner"
  | "cooldown"
  | "sin_saldo"
  | "precio";

export type KeeperDecision = { action: "execute" } | { action: "skip"; reason: KeeperSkipReason };

export type KeeperSnapshot = {
  hasExecutor: boolean;
  executorIsOwner: boolean;
  canExec: boolean;
  usdcBalance: bigint;
  lastExecutionTime: bigint;
  executionCooldown: bigint;
  now: bigint;
};

/** La llave del keeper solo paga gas. 32 bytes en hex, con prefijo 0x. */
export function isKeeperKey(value: string | undefined): boolean {
  if (!value) return false;
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return authorization === `Bearer ${secret}`;
}

/**
 * Decide si este tick llama a executeStrategy.
 * `canExec` es el checker on-chain (cooldown, saldo y precio fresco).
 * Si el checker es falso, el motivo sale del resto de la foto para no gastar gas.
 */
export function decideKeeper(snapshot: KeeperSnapshot): KeeperDecision {
  if (!snapshot.hasExecutor) return { action: "skip", reason: "sin_ejecutor" };
  if (snapshot.executorIsOwner) return { action: "skip", reason: "es_owner" };
  if (snapshot.canExec) return { action: "execute" };
  if (snapshot.now < snapshot.lastExecutionTime + snapshot.executionCooldown) {
    return { action: "skip", reason: "cooldown" };
  }
  if (snapshot.usdcBalance <= BigInt(0)) return { action: "skip", reason: "sin_saldo" };
  return { action: "skip", reason: "precio" };
}

/** Errores esperados del contrato no deben reintentar el cron. Falta de POL sí. */
export function keeperCallError(error: unknown): {
  status: 200 | 502;
  body: { ok: boolean; skipped?: KeeperSkipReason; error?: string };
} {
  const message = error instanceof Error ? error.message : "";
  if (/Cooldown active/i.test(message)) {
    return { status: 200, body: { ok: true, skipped: "cooldown" } };
  }
  if (/No funds to operate/i.test(message)) {
    return { status: 200, body: { ok: true, skipped: "sin_saldo" } };
  }
  if (/bad price|stale price/i.test(message)) {
    return { status: 200, body: { ok: true, skipped: "precio" } };
  }
  if (/insufficient funds/i.test(message)) {
    return {
      status: 502,
      body: { ok: false, error: "La billetera ejecutora no tiene POL para el gas." },
    };
  }
  return { status: 502, body: { ok: false, error: "La transacción no se envió." } };
}
