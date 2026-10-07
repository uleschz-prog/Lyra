import { describe, expect, it } from "vitest";
import type { EIP1193Provider } from "viem";

import { pickMetaMask, type FlaggedProvider, type WalletAnnouncement } from "@/lib/protocol/metamask";

function provider(flags: Partial<FlaggedProvider> = {}): FlaggedProvider {
  return { request: async () => null, on() {}, removeListener() {}, ...flags } as FlaggedProvider;
}

describe("pickMetaMask", () => {
  it("prefiere el anuncio EIP-6963 de MetaMask", () => {
    const metamask = provider({ isMetaMask: true });
    const other = provider();
    const announced: WalletAnnouncement[] = [
      { name: "Otra", rdns: "io.other", provider: other },
      { name: "MetaMask", rdns: "io.metamask", provider: metamask },
    ];
    expect(pickMetaMask(announced, provider())).toBe(metamask);
  });

  it("elige MetaMask entre varias billeteras inyectadas", () => {
    const brave = provider({ isMetaMask: true, isBraveWallet: true });
    const metamask = provider({ isMetaMask: true });
    const ethereum = provider({ providers: [brave, metamask] });
    expect(pickMetaMask([], ethereum)).toBe(metamask);
  });

  it("usa la billetera inyectada si es la única", () => {
    const ethereum = provider({ isMetaMask: true });
    expect(pickMetaMask([], ethereum)).toBe(ethereum);
  });

  it("no inventa una billetera", () => {
    expect(pickMetaMask([], null)).toBeNull();
  });
});
