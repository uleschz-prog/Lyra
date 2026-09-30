import { getPrisma } from "@/lib/prisma";

export type UsdtPurpose = "signup" | "rebuy" | "credits" | "upgrade";

export const USDT_TRC20_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isValidUsdtTrc20(value: string) {
  return USDT_TRC20_RE.test(value.trim());
}

const COMPANY_WALLET_KEY = "company_usdt_trc20";

export async function getCompanyUsdtWallet(): Promise<string | null> {
  const prisma = getPrisma();
  const row = await prisma.appSetting.findUnique({
    where: { key: COMPANY_WALLET_KEY },
    select: { value: true },
  });
  const value = row?.value?.trim() ?? "";
  return isValidUsdtTrc20(value) ? value : null;
}

export function companyUsdtWallet(): string {
  return process.env.COMPANY_USDT_TRC20?.trim() ?? "";
}

export async function setCompanyUsdtWallet(address: string) {
  const value = address.trim();
  if (value && !isValidUsdtTrc20(value)) return null;
  const prisma = getPrisma();
  await prisma.appSetting.upsert({
    where: { key: COMPANY_WALLET_KEY },
    create: { key: COMPANY_WALLET_KEY, value: value || "" },
    update: { value: value || "" },
  });
  return value || null;
}

export async function usdtTrxHashUsed(trxHash: string) {
  const prisma = getPrisma();
  const existing = await prisma.usdtOrder.findUnique({
    where: { trxHash },
    select: { id: true },
  });
  return Boolean(existing);
}

export function normalizeUsdtAddress(value: string) {
  return value.trim();
}

/// Contrato oficial de USDT en la red Tron (TRC20).
export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export function trongridReady() {
  return (process.env.TRONGRID_API_KEY?.trim() ?? "").length > 0;
}