"use client";

import Link from "next/link";
import { useState } from "react";
import { getAddress, isAddress } from "viem";

import { pickMetaMask, readInjectedEthereum, walletErrorMessage } from "@/lib/protocol/metamask";

export function LinkWallet({ saved }: { saved: string | null }) {
  const [address, setAddress] = useState(saved);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [missing, setMissing] = useState(false);

  async function connect() {
    setError("");
    setMissing(false);
    const provider = pickMetaMask([], readInjectedEthereum());
    if (!provider) {
      setMissing(true);
      return;
    }
    setPending(true);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts[0];
      if (!account || !isAddress(account)) {
        setError("MetaMask no entregó una dirección.");
        setPending(false);
        return;
      }
      const response = await fetch("/api/wallet/polygon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: getAddress(account) }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; address?: string } | null;
      if (!response.ok || !payload?.address) {
        setPending(false);
        setError(payload?.error ?? "No se pudo guardar la wallet.");
        return;
      }
      setAddress(payload.address);
      setPending(false);
    } catch (caught) {
      setPending(false);
      setError(walletErrorMessage(caught));
    }
  }

  return (
    <div className="mt-6">
      <p className="text-center text-sm leading-6 text-[#5C5854]">
        Vincula la MetaMask con la que vas a pagar. Si todavía no tienes una, el tutorial te lleva paso a paso.
      </p>
      {address ? (
        <p className="mt-4 break-all rounded-md border border-[#C4B5FD] bg-[#F5F3FF] px-3 py-3 text-center font-mono text-xs text-[#5B21B6]">
          {address}
        </p>
      ) : null}
      {missing ? (
        <p className="mt-4 text-center text-sm text-[#9A3B2F]">
          Este navegador no tiene MetaMask. Ábrelo en el teléfono o en Chrome con la extensión instalada.
        </p>
      ) : null}
      {error ? <p className="mt-4 text-center text-sm text-[#9A3B2F]">{error}</p> : null}
      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={() => void connect()}
          disabled={pending}
          className="h-12 w-full rounded-md bg-[#312F2F] text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Esperando a MetaMask…" : address ? "Cambiar MetaMask" : "Vincular MetaMask"}
        </button>
        <Link
          href="/vincular/tutorial"
          className="flex h-12 w-full items-center justify-center rounded-md border border-[#D9D5CE] text-sm font-medium text-[#1E1E24]"
        >
          No tengo MetaMask
        </Link>
        {address ? (
          <Link
            href="/pago"
            className="flex h-12 w-full items-center justify-center rounded-md bg-[#7C3AED] text-sm font-medium text-white"
          >
            Continuar al pago
          </Link>
        ) : null}
      </div>
    </div>
  );
}
