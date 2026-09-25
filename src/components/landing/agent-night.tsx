"use client";

import { useEffect, useRef, useState } from "react";

type Bubble = {
  side: "in" | "out";
  time: string;
  text: string;
  link?: { title: string; detail: string; url: string };
  deposit?: { title: string; amount: number };
};

const thread: Bubble[] = [
  { side: "in", time: "02:14", text: "Hola, ¿me apartas mañana a las 10?" },
  {
    side: "out",
    time: "02:14",
    text: "Claro. Te dejé las 10:30. Aquí está tu liga de pago:",
    link: { title: "Cita · mañana 10:30", detail: "$490", url: "pay.lyra.app/c/1040" },
  },
  { side: "in", time: "02:16", text: "Listo, ya pagué", deposit: { title: "Cita · 10:30", amount: 490 } },
  { side: "out", time: "02:16", text: "Pago recibido. Tu cita quedó confirmada." },
  { side: "in", time: "02:41", text: "¿Y el plan de 3 sesiones?" },
  {
    side: "out",
    time: "02:41",
    text: "Son $980. Te mando la liga:",
    link: { title: "Plan de 3 sesiones", detail: "$980", url: "pay.lyra.app/c/3ses" },
  },
  { side: "in", time: "02:43", text: "Pagado, gracias", deposit: { title: "Plan de 3 sesiones", amount: 980 } },
  { side: "out", time: "02:43", text: "Listo. Nos vemos en la primera sesión." },
];

export function AgentNight() {
  const [step, setStep] = useState(1);
  const chatRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) {
      setStep(thread.length);
      return;
    }
    const timer = window.setInterval(() => {
      setStep((current) => (current >= thread.length ? 1 : current + 1));
    }, 1700);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    if (activityRef.current) activityRef.current.scrollTop = 0;
  }, [step]);

  const visible = thread.slice(0, step);
  const clock = visible.at(-1)?.time ?? "02:14";
  const done = step >= thread.length;
  const deposits = visible.flatMap((item) => (item.deposit ? [item.deposit] : []));
  const balance = 8480 + deposits.reduce((sum, item) => sum + item.amount, 0);

  return (
    <figure className="mt-10 [--pair:min(1,(100vw-4.5rem)/660px)] lg:[--pair:1]">
      <div className="relative mx-auto w-full max-lg:h-[calc(var(--pair)*480px)] lg:h-auto">
      <div className="absolute top-0 left-1/2 flex w-[660px] origin-top gap-3 max-lg:[transform:translateX(-50%)_scale(var(--pair))] lg:static lg:w-auto lg:translate-x-0 lg:scale-100 lg:justify-center lg:gap-6">
      <div className="w-[320px] shrink-0 overflow-hidden rounded-[1.75rem] border border-[#1F2C34] bg-[#0B141A] shadow-[0_20px_50px_rgba(30,30,36,0.12)]">
        <div className="flex items-center justify-between px-5 pt-3 text-[11px] text-white/80">
          <span>{clock}</span>
          <span>LTE</span>
        </div>
        <div className="flex items-center gap-3 bg-[#1F2C34] px-3 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#00A884] text-sm font-semibold text-white">L</span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white">Lyra</span>
            <span className="block text-[11px] text-white/60">{done ? "en línea" : "en línea · tú duermes"}</span>
          </span>
        </div>
        <div
          ref={chatRef}
          className="h-[340px] space-y-1.5 overflow-y-auto px-3 py-3"
          style={{
            backgroundColor: "#0B141A",
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.03) 0 1px, transparent 1px), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.025) 0 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          <p className="mx-auto w-fit rounded-md bg-[#182229] px-2 py-1 text-[11px] text-[#8696A0]">Hoy</p>
          {visible.map((item, index) => (
            <div key={`${item.time}-${index}`} className={item.side === "out" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  item.side === "out"
                    ? "max-w-[85%] rounded-lg rounded-tr-none bg-[#005C4B] px-2.5 py-1.5 text-[13px] leading-5 text-[#E9EDEF]"
                    : "max-w-[85%] rounded-lg rounded-tl-none bg-[#202C33] px-2.5 py-1.5 text-[13px] leading-5 text-[#E9EDEF]"
                }
              >
                <p>{item.text}</p>
                {item.link ? (
                  <span className="mt-1.5 block overflow-hidden rounded-md bg-[#0B141A]/50">
                    <span className="block border-l-4 border-[#53BDEB] px-2 py-1.5">
                      <span className="block text-[12px] font-medium text-[#53BDEB]">{item.link.title}</span>
                      <span className="block text-[12px] text-[#E9EDEF]">{item.link.detail}</span>
                      <span className="mt-0.5 block text-[11px] text-[#53BDEB] underline underline-offset-2">{item.link.url}</span>
                    </span>
                  </span>
                ) : null}
                <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#8696A0]">
                  {item.time}
                  {item.side === "out" ? <span className="text-[#53BDEB]">✓✓</span> : null}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-[320px] shrink-0 overflow-hidden rounded-[1.75rem] border border-[#D6E4F0] bg-white shadow-[0_20px_50px_rgba(30,30,36,0.12)]">
        <div className="flex items-center justify-between bg-[#009EE3] px-5 pt-3 pb-2 text-[11px] text-white">
          <span>{clock}</span>
          <span>LTE</span>
        </div>
        <div className="bg-[#009EE3] px-4 pt-2 pb-5 text-white">
          <p className="text-sm font-semibold tracking-tight">mercado pago</p>
          <p className="mt-4 text-xs text-white/80">Dinero disponible</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">${balance.toLocaleString("en-US")}</p>
        </div>
        <div ref={activityRef} className="h-[292px] overflow-y-auto bg-[#F5F7F8] px-4 py-4">
          <p className="text-xs font-medium text-[#333]">Actividad</p>
          <ul className="mt-3 space-y-2">
            {[...deposits].reverse().map((item) => (
              <li key={item.title} className="flex items-center justify-between rounded-xl bg-white px-3 py-3">
                <span>
                  <span className="block text-sm text-[#333]">Transferencia recibida</span>
                  <span className="block text-xs text-[#737373]">{item.title}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-[#00A650]">+${item.amount.toLocaleString("en-US")}</span>
              </li>
            ))}
            {deposits.length === 0 ? (
              <li className="rounded-xl bg-white px-3 py-3 text-sm text-[#737373]">Esperando la transferencia…</li>
            ) : null}
          </ul>
        </div>
      </div>
      </div>
      </div>
      <figcaption className="mt-4 text-center text-sm text-[#5C5854]">
        {done ? "Despertaste con 2 pagos · $1,470" : "Simulación · el superagente cobra mientras duermes"}
      </figcaption>
    </figure>
  );
}
