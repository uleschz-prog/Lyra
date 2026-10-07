import { createPublicClient, http } from "viem";
import { polygon, polygonAmoy } from "viem/chains";

/**
 * Redes del protocolo. El dashboard lee Polygon Amoy.
 * Mainnet queda declarada para cuando exista un adapter de IProfitSwapRouter;
 * la UI no cambia de red sola.
 *
 * La app no monta RainbowKit en el layout: LYRA ya entra con sesión propia
 * y el depósito usa la billetera inyectada vía viem, que es el cliente de wagmi.
 */
export const lyraChains = {
  amoy: polygonAmoy,
  mainnet: polygon,
} as const;

export function lyraPublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: lyraChains.amoy,
    transport: http(rpcUrl),
    pollingInterval: 1_000,
  });
}
