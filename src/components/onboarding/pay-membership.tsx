"use client";

import { useState } from "react";
import { createWalletClient, custom, erc20Abi, getAddress, zeroAddress, type EIP1193Provider } from "viem";
import { polygon } from "viem/chains";

import { startCheckout } from "@/app/dashboard/wallet/actions";
import { signupPlans, type SignupPlanId } from "@/config/compensation-plan";
import { membershipPackageId, polygonUsdcAddress } from "@/config/membership";
import { lyraMembershipAbi } from "@/lib/payments/membership-abi";
import { pickMetaMask, readInjectedEthereum, walletErrorMessage } from "@/lib/protocol/metamask";

const polygonRpc = "https://polygon-bor-rpc.publicnode.com";

export function PayMembership({
  wallet,
  sponsor,
  membership,
}: {
  wallet: string;
  sponsor: string | null;
  membership: string;
}) {
  const [packageId, setPackageId] = useState<SignupPlanId>("PRO");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"mp" | "usdc" | null>(null);

  const plan = signupPlans.find((item) => item.id === packageId) ?? signupPlans[1];

  async function choosePlan() {
    const response = await fetch("/api/payments/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? "No se pudo guardar el paquete.");
    }
  }

  async function payMercadoPago() {
    setError("");
    setPending("mp");
    try {
      await choosePlan();
      const result = await startCheckout("signup");
      if (!result.ok) {
        setPending(null);
        setError(result.error);
        return;
      }
      window.location.href = result.url;
    } catch (caught) {
      setPending(null);
      setError(caught instanceof Error ? caught.message : "No se pudo abrir Mercado Pago.");
    }
  }

  async function payUsdc() {
    setError("");
    if (!membership) {
      setError("El cobro en USDC se activa cuando el contrato esté publicado en Polygon. Mientras, puedes pagar con Mercado Pago.");
      return;
    }
    const provider = pickMetaMask([], readInjectedEthereum());
    if (!provider) {
      setError("Abre esta página en el navegador donde instalaste MetaMask.");
      return;
    }
    setPending("usdc");
    try {
      await choosePlan();
      await ensurePolygon(provider);
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = getAddress(accounts[0] ?? wallet);
      const client = createWalletClient({ account, chain: polygon, transport: custom(provider) });
      const membershipAddress = getAddress(membership);
      const usdc = getAddress(polygonUsdcAddress);
      const price = BigInt(plan.price) * BigInt(1_000_000);
      const publicRead = await import("viem").then(({ createPublicClient, http }) =>
        createPublicClient({ chain: polygon, transport: http(polygonRpc) }),
      );
      const allowance = await publicRead.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, membershipAddress],
      });
      if (allowance < price) {
        const approval = await client.writeContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [membershipAddress, price],
          account,
          chain: polygon,
        });
        await publicRead.waitForTransactionReceipt({ hash: approval });
      }
      const sponsorAddress = sponsor ? getAddress(sponsor) : zeroAddress;
      const hash = await client.writeContract({
        address: membershipAddress,
        abi: lyraMembershipAbi,
        functionName: "buy",
        args: [membershipPackageId(packageId), sponsorAddress],
        account,
        chain: polygon,
      });
      const response = await fetch("/api/payments/usdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setPending(null);
        setError(payload?.error ?? "Polygon confirmó el pago, pero LYRA no pudo activar la cuenta.");
        return;
      }
      window.location.href = "/dashboard";
    } catch (caught) {
      setPending(null);
      setError(walletErrorMessage(caught));
    }
  }

  return (
    <div className="mt-6">
      <p className="text-center text-sm leading-6 text-[#5C5854]">
        Inicio $29, Negocio $99 y Pro $249. Los tres abren los mismos servicios. Cambia hasta qué nivel de Órbita cobras y cuántos créditos entran.
      </p>
      <div className="mt-5 space-y-3">
        {signupPlans.map((item) => {
          const selected = item.id === packageId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPackageId(item.id)}
              className={`w-full rounded-md border px-4 py-4 text-left ${selected ? "border-[#7C3AED] bg-[#F5F3FF]" : "border-[#D9D5CE] bg-white"}`}
            >
              <span className="flex items-end justify-between gap-3">
                <span>
                  <span className="block text-sm font-medium text-[#1E1E24]">{item.label}</span>
                  <span className="mt-1 block text-xs text-[#8A8680]">{item.subtitle}</span>
                </span>
                <span className="text-sm text-[#252525]">${item.price}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs leading-5 text-[#8A8680]">
        Con cripto se paga en USDC sobre Polygon: vale un dólar, la red cobra centavos y el contrato activa la cuenta sin revisión manual. Órbita sale en ese mismo pago. El 10% de las ventas se reparte al cerrar el mes entre los Pro que renovaron $99.
      </p>
      {error ? <p className="mt-3 text-sm text-[#9A3B2F]">{error}</p> : null}
      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={() => void payMercadoPago()}
          disabled={pending !== null}
          className="h-12 w-full rounded-md bg-[#009EE3] text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending === "mp" ? "Abriendo Mercado Pago…" : `Pagar $${plan.price} con Mercado Pago`}
        </button>
        <button
          type="button"
          onClick={() => void payUsdc()}
          disabled={pending !== null}
          className="h-12 w-full rounded-md bg-[#312F2F] text-sm font-medium text-white disabled:opacity-60"
        >
          {pending === "usdc" ? "Confirmando en MetaMask…" : `Pagar $${plan.price} USDC`}
        </button>
      </div>
    </div>
  );
}

async function ensurePolygon(provider: EIP1193Provider) {
  const chainId = "0x89";
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: "Polygon",
          nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
          rpcUrls: [polygonRpc],
          blockExplorerUrls: ["https://polygonscan.com"],
        },
      ],
    });
  }
}
