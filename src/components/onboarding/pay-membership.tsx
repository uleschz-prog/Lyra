"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { reportUsdtPayment, startCheckout, startUsdtOrder } from "@/app/dashboard/wallet/actions";
import { signupPlans, type SignupPlanId } from "@/config/compensation-plan";

const methods = [
  { id: "mp", title: "Tarjeta", detail: "Mercado Pago" },
  { id: "usdt", title: "USDT TRC20", detail: "Transferencia" },
  { id: "promo", title: "Código promocional", detail: "Activa al momento" },
] as const;

type Method = (typeof methods)[number]["id"];

export function PayMembership() {
  const router = useRouter();
  const [packageId, setPackageId] = useState<SignupPlanId>("PRO");
  const [method, setMethod] = useState<Method | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Method | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [txid, setTxid] = useState("");
  const [copied, setCopied] = useState(false);
  const [usdtReported, setUsdtReported] = useState(false);
  const [usdtOrder, setUsdtOrder] = useState<{ orderId: string; companyWallet: string; amountUsd: number } | null>(null);

  const plan = signupPlans.find((item) => item.id === packageId) ?? signupPlans[1];

  function selectPackage(next: SignupPlanId) {
    setPackageId(next);
    setUsdtOrder(null);
    setTxid("");
    setUsdtReported(false);
    setError("");
  }

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

  async function prepareUsdt() {
    setError("");
    setPending("usdt");
    try {
      await choosePlan();
      const result = await startUsdtOrder("signup");
      setPending(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUsdtOrder({ orderId: result.orderId, companyWallet: result.companyWallet, amountUsd: result.amountUsd });
    } catch (caught) {
      setPending(null);
      setError(caught instanceof Error ? caught.message : "No se pudo preparar el pago en USDT.");
    }
  }

  async function confirmUsdt() {
    if (!usdtOrder) return;
    setError("");
    setPending("usdt");
    const result = await reportUsdtPayment(usdtOrder.orderId, txid);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUsdtReported(true);
  }

  async function payPromo() {
    const code = promoCode.trim();
    if (code.length < 4) {
      setError("Escribe el código promocional.");
      return;
    }
    setError("");
    setPending("promo");
    try {
      const response = await fetch("/api/payments/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, code }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setPending(null);
        setError(payload?.error ?? "No se pudo aplicar el código.");
        return;
      }
      router.push("/dashboard");
    } catch {
      setPending(null);
      setError("No se pudo aplicar el código.");
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
              onClick={() => selectPackage(item.id)}
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

      <p className="mt-6 text-sm font-medium text-[#1E1E24]">Método de pago</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {methods.map((item) => {
          const selected = method === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMethod(item.id);
                setError("");
              }}
              className={`rounded-md border px-3 py-3 text-left ${selected ? "border-[#7C3AED] bg-[#F5F3FF]" : "border-[#D9D5CE] bg-white"}`}
            >
              <span className="block text-sm font-medium text-[#1E1E24]">{item.title}</span>
              <span className="mt-1 block text-xs text-[#8A8680]">{item.detail}</span>
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-sm text-[#9A3B2F]">{error}</p> : null}

      {method === "mp" ? (
        <button
          type="button"
          onClick={() => void payMercadoPago()}
          disabled={pending !== null}
          className="mt-5 h-12 w-full rounded-md bg-[#009EE3] text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending === "mp" ? "Abriendo Mercado Pago…" : `Pagar $${plan.price} con tarjeta`}
        </button>
      ) : null}

      {method === "usdt" ? (
        <div className="mt-5">
          {usdtReported ? (
            <p className="rounded-md border border-[#C4B5FD] bg-[#F5F3FF] px-4 py-3 text-sm leading-6 text-[#1E1E24]">
              Pago reportado. LYRA validará la transferencia y activará tu cuenta.
            </p>
          ) : usdtOrder ? (
            <div className="space-y-3">
              <p className="text-sm leading-6 text-[#5C5854]">
                Envía exactamente <strong>${usdtOrder.amountUsd}</strong> en USDT por la red TRC20 a esta dirección y pega el TXID.
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(usdtOrder.companyWallet);
                  setCopied(true);
                }}
                className="w-full break-all rounded-md border border-[#C4B5FD] bg-[#F5F3FF] px-3 py-3 text-left font-mono text-xs text-[#5B21B6]"
              >
                {usdtOrder.companyWallet}
                <span className="mt-1 block font-sans text-[11px]">{copied ? "Dirección copiada" : "Toca para copiar"}</span>
              </button>
              <label className="block text-sm font-medium text-[#1E1E24]">
                TXID
                <input
                  value={txid}
                  onChange={(event) => setTxid(event.target.value)}
                  placeholder="Hash de la transferencia"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 h-12 w-full rounded-md border border-[#D9D5CE] px-3 font-mono text-sm font-normal text-[#0F0F0F] outline-none placeholder:font-sans focus:border-[#312F2F]"
                />
              </label>
              <button
                type="button"
                onClick={() => void confirmUsdt()}
                disabled={pending !== null || txid.trim().length < 8}
                className="h-12 w-full rounded-md bg-[#312F2F] text-sm font-medium text-white disabled:opacity-60"
              >
                {pending === "usdt" ? "Enviando…" : "Ya transferí"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void prepareUsdt()}
              disabled={pending !== null}
              className="h-12 w-full rounded-md bg-[#312F2F] text-sm font-medium text-white disabled:opacity-60"
            >
              {pending === "usdt" ? "Preparando…" : `Pagar $${plan.price} en USDT TRC20`}
            </button>
          )}
        </div>
      ) : null}

      {method === "promo" ? (
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-[#1E1E24]">
            Código promocional
            <input
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
              placeholder="LYRA-…"
              autoComplete="off"
              className="mt-2 h-12 w-full rounded-md border border-[#D9D5CE] px-3 text-sm font-normal uppercase tracking-wide text-[#0F0F0F] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-[#B0B0B0] focus:border-[#312F2F]"
            />
          </label>
          <button
            type="button"
            onClick={() => void payPromo()}
            disabled={pending !== null || promoCode.trim().length < 4}
            className="h-12 w-full rounded-md bg-[#7C3AED] text-sm font-medium text-white disabled:opacity-60"
          >
            {pending === "promo" ? "Activando…" : `Activar ${plan.label} con el código`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
