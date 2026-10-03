"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Crown, Sparkles, Zap } from "lucide-react";

import { startUpgradeCheckout, startUpgradeUsdt, reportUsdtPayment } from "@/app/dashboard/wallet/actions";
import { signupPlans, type SignupPlanId } from "@/config/compensation-plan";
import { upgradeDifferenceUsd } from "@/lib/payments/upgrade";

type Purpose = "usdt" | "mercadopago";
type Feedback = { tone: "ok" | "error"; text: string } | null;

const usd = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Meta visual por paquete: color, halo y gancho comercial. */
const meta: Record<SignupPlanId, { accent: string; ring: string; glow: string; tag: string }> = {
  STARTED: {
    accent: "text-sky-600 dark:text-sky-300",
    ring: "border-sky-200 dark:border-sky-400/30",
    glow: "from-sky-400/20",
    tag: "Inicio",
  },
  PRO: {
    accent: "text-[#7C3AED] dark:text-[#A78BFA]",
    ring: "border-[#C4B5FD] dark:border-[#7C3AED]/40",
    glow: "from-[#7C3AED]/25",
    tag: "Más popular",
  },
  FOUNDER: {
    accent: "text-amber-600 dark:text-amber-300",
    ring: "border-amber-200 dark:border-amber-400/30",
    glow: "from-amber-400/25",
    tag: "Liderazgo",
  },
  CORPORATE: {
    accent: "text-rose-600 dark:text-rose-300",
    ring: "border-rose-200 dark:border-rose-400/30",
    glow: "from-rose-400/25",
    tag: "Equipo",
  },
};

export function UpgradeWorkspace({
  currentPackage,
  credits,
}: {
  currentPackage: string | null;
  credits: number;
}) {
  const [selected, setSelected] = useState<SignupPlanId | null>(null);
  const [purpose, setPurpose] = useState<Purpose>("mercadopago");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [companyWallet, setCompanyWallet] = useState<string | null>(null);
  const [trxHash, setTrxHash] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);

  const currentRank = useMemo(
    () => signupPlans.findIndex((p) => p.id === currentPackage),
    [currentPackage],
  );

  const options = useMemo(
    () =>
      signupPlans
        .map((plan, index) => ({ plan, index }))
        .filter(({ index }) => index > currentRank)
        .map(({ plan }) => ({
          ...plan,
          difference: upgradeDifferenceUsd(currentPackage, plan.id) ?? plan.price,
        })),
    [currentRank, currentPackage],
  );

  // Selección por defecto: la opción más popular (PRO) o la primera disponible.
  const defaultSelection = options.find((o) => o.id === "PRO")?.id ?? options[0]?.id ?? null;
  const activeId = selected ?? defaultSelection;

  const chosen = options.find((o) => o.id === activeId) ?? null;

  async function beginUsdt() {
    if (!chosen) return;
    setPending(true);
    setFeedback(null);
    const data = await startUpgradeUsdt(chosen.id);
    setPending(false);
    if (!data.ok) {
      setFeedback({ tone: "error", text: data.error });
      return;
    }
    setOrderId(data.orderId);
    setCompanyWallet(data.companyWallet);
    setFeedback({
      tone: "ok",
      text: `Envía ${usd.format(data.amountUsd)} en USDT (TRC20) y reporta el TXID.`,
    });
  }

  async function confirmUsdt() {
    if (!orderId || !trxHash.trim()) return;
    setPending(true);
    setFeedback(null);
    const data = await reportUsdtPayment(orderId, trxHash.trim());
    setPending(false);
    if (!data.ok) {
      setFeedback({ tone: "error", text: data.error });
      return;
    }
    setFeedback({
      tone: "ok",
      text: "Reporte recibido. Tu mejora se activará en cuanto el equipo confirme la transferencia.",
    });
    setTrxHash("");
  }

  async function beginMercadoPago() {
    if (!chosen) return;
    setPending(true);
    setFeedback(null);
    const data = await startUpgradeCheckout(chosen.id);
    if (!data.ok) {
      setPending(false);
      setFeedback({ tone: "error", text: data.error });
      return;
    }
    window.location.assign(data.url);
  }

  if (!options.length) {
    return (
      <section className="rounded-3xl border border-[#E7E2DA] bg-white p-6 dark:border-white/10 dark:bg-[#17151F]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#2B2740]">
            <Crown className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-base font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">Estás en el nivel más alto</p>
            <p className="text-sm text-[#8A8680] dark:text-[#9B96AC]">
              Corporate es el techo de LYRA. Disfruta tus {credits.toLocaleString("es-MX")} créditos.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Carrusel horizontal de opciones */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {options.map((plan) => {
          const active = selected === plan.id;
          const m = meta[plan.id];
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => {
                setSelected(plan.id);
                setOrderId(null);
                setCompanyWallet(null);
                setFeedback(null);
              }}
              className={`relative min-w-[78%] shrink-0 snap-center overflow-hidden rounded-3xl border bg-white p-5 text-left transition-all sm:min-w-0 ${
                active
                  ? `${m.ring} shadow-[0_18px_45px_-20px_rgba(124,58,237,0.55)] -translate-y-0.5`
                  : "border-[#E7E2DA] dark:border-white/10"
              } dark:bg-[#17151F]`}
            >
              <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${m.glow} to-transparent blur-2xl`} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${m.accent} bg-black/5 dark:bg-white/10`}>
                    <Sparkles className="h-3 w-3" aria-hidden /> {m.tag}
                  </span>
                  {active ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[#7C3AED] text-white">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-lg font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">{plan.label}</p>
                <p className="mt-1 text-sm text-[#8A8680] dark:text-[#9B96AC]">{plan.subtitle}</p>

                <div className="mt-4 flex items-end gap-2">
                  <span className="text-3xl font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">{usd.format(plan.difference)}</span>
                  <span className="pb-1 text-xs text-[#8A8680] dark:text-[#9B96AC]">de diferencia</span>
                </div>
                <p className="mt-1 text-xs text-[#8A8680] dark:text-[#9B96AC]">
                  Paquete de {usd.format(plan.price)} · {plan.credits.toLocaleString("es-MX")} créditos
                </p>

                <ul className="mt-4 space-y-1.5">
                  {plan.points.slice(0, 3).map((point) => (
                    <li key={point} className="flex items-start gap-2 text-xs text-[#4B4741] dark:text-[#C9C4D8]">
                      <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${m.accent}`} aria-hidden />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          );
        })}
      </div>

      {/* Panel de pago del plan elegido */}
      {chosen ? (
        <section className="overflow-hidden rounded-3xl border border-[#E7E2DA] bg-white dark:border-white/10 dark:bg-[#17151F]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0ECE5] px-5 py-4 dark:border-white/10">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#EDE9FE] text-[#7C3AED] dark:bg-[#2B2740]">
                <Zap className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">Mejora a {chosen.label}</p>
                <p className="text-xs text-[#8A8680] dark:text-[#9B96AC]">
                  Pagas solo la diferencia: {usd.format(chosen.difference)}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-semibold text-[#7C3AED] dark:bg-[#2B2740]">
              <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Upgrade
            </span>
          </header>

          <div className="space-y-4 px-5 py-5">
            {/* Selector de método */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPurpose("mercadopago")}
                className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                  purpose === "mercadopago"
                    ? "border-[#7C3AED] bg-[#F5F1FE] text-[#5B21B6] dark:bg-[#2B2740] dark:text-[#DDD6FE]"
                    : "border-[#E7E2DA] text-[#4B4741] hover:border-[#C4B5FD] dark:border-white/10 dark:text-[#C9C4D8]"
                }`}
              >
                Mercado Pago
              </button>
              <button
                type="button"
                onClick={() => setPurpose("usdt")}
                className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                  purpose === "usdt"
                    ? "border-[#7C3AED] bg-[#F5F1FE] text-[#5B21B6] dark:bg-[#2B2740] dark:text-[#DDD6FE]"
                    : "border-[#E7E2DA] text-[#4B4741] hover:border-[#C4B5FD] dark:border-white/10 dark:text-[#C9C4D8]"
                }`}
              >
                USDT TRC20
              </button>
            </div>

            {purpose === "mercadopago" ? (
              <button
                type="button"
                disabled={pending}
                onClick={beginMercadoPago}
                className="w-full rounded-2xl bg-[#7C3AED] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#6D28D9] disabled:opacity-60"
              >
                {pending ? "Abriendo Mercado Pago…" : `Pagar ${usd.format(chosen.difference)} con Mercado Pago`}
              </button>
            ) : !companyWallet ? (
              <button
                type="button"
                disabled={pending}
                onClick={beginUsdt}
                className="w-full rounded-2xl bg-[#7C3AED] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#6D28D9] disabled:opacity-60"
              >
                {pending ? "Generando orden…" : `Pagar ${usd.format(chosen.difference)} con USDT`}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-[#E7E2DA] bg-[#FBFAF8] p-4 dark:border-white/10 dark:bg-[#1E1C28]">
                  <p className="text-xs text-[#8A8680] dark:text-[#9B96AC]">Envía exactamente {usd.format(chosen.difference)} en USDT (TRC20) a:</p>
                  <p className="mt-1 break-all font-mono text-sm text-[#1E1E24] dark:text-[#F2F0F7]">{companyWallet}</p>
                </div>
                <input
                  value={trxHash}
                  onChange={(e) => setTrxHash(e.target.value)}
                  placeholder="Pega aquí el TXID de tu transferencia"
                  className="w-full rounded-2xl border border-[#E7E2DA] bg-white px-4 py-3 text-sm text-[#1E1E24] outline-none focus:border-[#7C3AED] dark:border-white/10 dark:bg-[#12111A] dark:text-[#F2F0F7]"
                />
                <button
                  type="button"
                  disabled={pending || !trxHash.trim()}
                  onClick={confirmUsdt}
                  className="w-full rounded-2xl bg-[#1E1E24] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-[#EDE9FE] dark:text-[#2E1065]"
                >
                  {pending ? "Enviando…" : "Ya transferí, reportar TXID"}
                </button>
              </div>
            )}

            {feedback ? (
              <p
                className={`text-sm ${
                  feedback.tone === "ok" ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
                }`}
              >
                {feedback.text}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
