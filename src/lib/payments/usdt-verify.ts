import { createHash } from "node:crypto";

/** Contrato oficial de USDT en la red Tron (TRC20). */
export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

type Trc20Transfer = {
  transaction_id: string;
  token_info?: { symbol?: string; address?: string; decimals?: number };
  from?: string;
  to?: string;
  value?: string; // cantidad en unidades mínimas del token
};

function trongridKey() {
  return process.env.TRONGRID_API_KEY?.trim() ?? "";
}

export function trongridReady() {
  return trongridKey().length > 0;
}

function tronHost() {
  return "https://api.trongrid.io";
}

/** Convertir una dirección hex (41 + 20 bytes, con o sin 0x) a base58check formato Tron (T...). */
function hexToBase58Address(hex: string): string {
  const clean = hex.replace(/^0x/, "");
  if (!/^(41[0-9a-fA-F]{40})$/.test(clean)) return clean;
  const bytes = Buffer.from(clean, "hex");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  // Checksum: 4 bytes del doble sha256.
  const checksum = createHash("sha256").update(createHash("sha256").update(bytes).digest()).digest().subarray(0, 4);
  const full = Buffer.concat([bytes, checksum]);
  let leadingZeros = 0;
  while (leadingZeros < full.length && full[leadingZeros] === 0) leadingZeros++;
  let num = BigInt("0x" + full.toString("hex"));
  let out = "";
  const fiftyEight = BigInt(58);
  while (num > BigInt(0)) {
    out = alphabet[Number(num % fiftyEight)] + out;
    num /= fiftyEight;
  }
  return alphabet[0].repeat(leadingZeros) + out || alphabet[0];
}

const ERC20_TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type EventLog = { address?: string; topics?: string[]; data?: string };
type EventsResponse = { data?: { log?: EventLog[] }[] };

/**
 * Consulta TronGrid por los eventos de una transacción y devuelve la transferencia
 * USDT (TRC20) si existe. `null` si no hay TronGrid o no se halló el evento.
 */
async function fetchUsdtTransfer(txid: string): Promise<Trc20Transfer | null> {
  const key = trongridKey();
  if (!key) return null;
  const url = `${tronHost()}/v1/transactions/${encodeURIComponent(txid)}/events`;
  const response = await fetch(url, {
    headers: { "TRON-PRO-API-KEY": key },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as EventsResponse | null;
  const logs = body?.data?.[0]?.log;
  if (!logs) return null;
  for (const event of logs) {
    if ((event.address ?? "").toLowerCase() !== USDT_TRC20_CONTRACT.toLowerCase()) continue;
    if (event.topics?.[0] !== ERC20_TRANSFER_TOPIC) continue;
    const from = hexToBase58Address(event.topics?.[1] ?? "");
    const to = hexToBase58Address(event.topics?.[2] ?? "");
    const zero = BigInt(0);
    const value = event.data ? BigInt(`0x${event.data}`) : zero;
    return {
      transaction_id: txid,
      token_info: { symbol: "USDT", address: USDT_TRC20_CONTRACT, decimals: 6 },
      from,
      to,
      value: value.toString(),
    };
  }
  return null;
}

/**
 * Verifica en TronGrid que un TXID corresponda a una transferencia USDT (TRC20)
 * hacia la wallet de LYRA por al menos el monto esperado.
 *
 * - null si TronGrid no está configurado (la aprobación queda manual).
 * - { ok: true, from, to, amountUsd } si todo cuadra.
 * - { ok: false, error } si el hash no se halla, el destino no es LYRA o el monto es insuficiente.
 */
export async function verifyUsdtTransfer(input: {
  txid: string;
  companyWallet: string;
  expectedUsd: number;
}): Promise<{ ok: true; from: string; to: string; amountUsd: number } | { ok: false; error: string } | null> {
  if (!trongridReady() || !input.txid.trim()) return null;
  const transfer = await fetchUsdtTransfer(input.txid.trim());
  if (!transfer) {
    return { ok: false, error: "No se encontró una transferencia USDT TRC20 con ese TXID en TronGrid. Verifica el hash en TronScan." };
  }
  if (!transfer.to) return { ok: false, error: "La transacción no tiene destinatario." };
  if (transfer.to.toLowerCase() !== input.companyWallet.toLowerCase()) {
    return { ok: false, error: `El pago no llegó a la wallet de LYRA. Destino: ${transfer.to}` };
  }
  const decimals = transfer.token_info?.decimals ?? 6;
  const amount = Number(BigInt(transfer.value ?? "0")) / 10 ** decimals;
  if (amount < input.expectedUsd - 0.01) {
    return {
      ok: false,
      error: `El monto recibido (${amount.toFixed(2)} USDT) es menor al esperado (${input.expectedUsd.toFixed(2)} USDT).`,
    };
  }
  return { ok: true, from: transfer.from ?? "", to: transfer.to, amountUsd: Math.round(amount * 100) / 100 };
}

export function tronscanUrl(txid: string) {
  return `https://tronscan.org/#/transaction/${encodeURIComponent(txid)}`;
}