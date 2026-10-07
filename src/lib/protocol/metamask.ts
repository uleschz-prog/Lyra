import type { EIP1193Provider } from "viem";

export type FlaggedProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  isBraveWallet?: boolean;
  providers?: FlaggedProvider[];
};

export type WalletAnnouncement = {
  name: string;
  rdns: string;
  provider: EIP1193Provider;
};

const METAMASK_RDNS = "io.metamask";

export function pickMetaMask(
  announced: WalletAnnouncement[],
  ethereum: FlaggedProvider | null | undefined,
): EIP1193Provider | null {
  const fromAnnounce = announced.find(
    (item) => item.rdns === METAMASK_RDNS || /metamask/i.test(item.name),
  );
  if (fromAnnounce) return fromAnnounce.provider;

  const list = ethereum?.providers?.length ? ethereum.providers : ethereum ? [ethereum] : [];
  const metamask = list.find((item) => item.isMetaMask && !item.isBraveWallet);
  if (metamask) return metamask;

  const flagged = list.find((item) => item.isMetaMask);
  if (flagged) return flagged;

  if (ethereum) return ethereum;
  return announced[0]?.provider ?? null;
}

export function readInjectedEthereum(): FlaggedProvider | null {
  if (typeof window === "undefined") return null;
  const ethereum = (window as Window & { ethereum?: FlaggedProvider }).ethereum;
  return ethereum ?? null;
}

export function walletErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
  if (code === 4001) return "Cerraste MetaMask antes de conectar.";
  if (code === -32002) return "MetaMask ya tiene una solicitud abierta. Revísala en la extensión.";
  if (error instanceof Error && error.message) return error.message;
  return "MetaMask no completó la conexión.";
}
