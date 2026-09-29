const API = "https://api.mercadopago.com";

export type MpPurpose = "rebuy" | "credits" | "signup";

export type MpQuote = {
  usd: number;
  currency: string;
  net: number;
  fee: number;
  total: number;
};

function token() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "";
}

export function mercadoPagoReady() {
  return token().length > 0;
}

const currency = () => process.env.MP_CURRENCY?.trim().toUpperCase() || "MXN";
const numberEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};
const cents = (value: number) => Math.round(value * 100) / 100;

async function usdRate() {
  if (currency() === "USD") return 1;
  const fixed = numberEnv("MP_USD_RATE", 0);
  if (fixed > 0) return fixed;
  const response = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 43200 } }).catch(() => null);
  const data = (await response?.json().catch(() => null)) as { rates?: Record<string, number> } | null;
  const rate = data?.rates?.[currency()];
  return typeof rate === "number" && rate > 0 ? rate : null;
}

export async function mercadoPagoQuote(usd: number): Promise<MpQuote | null> {
  const rate = await usdRate();
  if (!rate) return null;
  const feeRate = numberEnv("MP_FEE_RATE", 0.0349);
  const feeFixed = numberEnv("MP_FEE_FIXED", 4);
  const tax = numberEnv("MP_FEE_TAX", 0.16);
  const net = cents(usd * rate);
  const total = Math.ceil(((net + feeFixed * (1 + tax)) / (1 - feeRate * (1 + tax))) * 100) / 100;
  return { usd, currency: currency(), net, fee: cents(total - net), total };
}

async function mp<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json" },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
}

export async function createMercadoPagoCheckout(input: {
  purpose: MpPurpose;
  userId: string;
  email: string;
  title: string;
  usd: number;
  origin: string;
  packageId?: string;
}) {
  const quote = await mercadoPagoQuote(input.usd);
  if (!quote) return null;
  const secure = input.origin.startsWith("https://");
  const back = `${input.origin}/api/payments/mercadopago/return`;
  const preference = await mp<{ init_point?: string }>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [
        {
          id: `lyra-${input.purpose}`,
          title: input.title,
          quantity: 1,
          unit_price: quote.total,
          currency_id: quote.currency,
        },
      ],
      payer: { email: input.email },
      external_reference: `lyra:${input.purpose}:${input.userId}:${Date.now()}`,
      metadata: {
        lyra_purpose: input.purpose,
        lyra_user: input.userId,
        lyra_usd: input.usd,
        lyra_total: quote.total,
        lyra_package: input.packageId ?? "",
      },
      statement_descriptor: "LYRA",
      back_urls: { success: back, pending: back, failure: back },
      ...(secure
        ? { auto_return: "approved", notification_url: `${input.origin}/api/payments/mercadopago/webhook` }
        : {}),
    }),
  });
  return preference?.init_point ? { url: preference.init_point, quote } : null;
}

export type MpPayment = {
  id: number;
  status: string;
  transaction_amount: number;
  currency_id: string;
  metadata?: {
    lyra_purpose?: string;
    lyra_user?: string;
    lyra_usd?: number | string;
    lyra_total?: number | string;
    lyra_package?: string;
  };
};

export function getMercadoPagoPayment(id: string) {
  if (!/^\d{1,20}$/.test(id)) return Promise.resolve(null);
  return mp<MpPayment>(`/v1/payments/${id}`);
}
