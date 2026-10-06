/**
 * Polygon Amoy (chainId 80002).
 * La USDC por defecto es la nativa de Circle, no un USDC.e puenteado.
 * Fuente: https://developers.circle.com/stablecoins/usdc-contract-addresses
 * Explorer del token: https://amoy.polygonscan.com/token/0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
 */
export const AMOY_CHAIN_ID = 80002;

export const AMOY_EXPLORER_URL = "https://amoy.polygonscan.com";

export const AMOY_DEFAULT_RPC_URL = "https://rpc-amoy.polygon.technology";

export const AMOY_USDC_ADDRESS = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

export function resolveAmoyUsdcAddress(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.AMOY_USDC_ADDRESS?.trim();
  return fromEnv ? fromEnv : AMOY_USDC_ADDRESS;
}
