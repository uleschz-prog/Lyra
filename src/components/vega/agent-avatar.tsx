"use client";

import type { VegaMood } from "@/lib/vega/events";
import { VegaMark } from "@/components/vega/vega-mark";
import { cn } from "@/lib/utils";

/** Avatar de un agente: el rostro de Vega para el agente principal; emoji en el degradado de LYRA para los demás. */
export function AgentAvatar({
  agent,
  className,
  mood,
  thinking,
  ring = false,
}: {
  agent: { avatar: string; isDefault: boolean; name: string } | undefined;
  className?: string;
  mood?: VegaMood;
  thinking?: boolean;
  ring?: boolean;
}) {
  const usesMark = !agent || (agent.isDefault && (!agent.avatar || agent.avatar === "✦"));
  return (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full bg-[conic-gradient(from_210deg,#7C3AED,#06B6D4,#10B981,#7C3AED)] p-[2px]",
        ring && "shadow-[0_0_0_3px_rgba(124,58,237,0.18)]",
        className,
      )}
      aria-hidden
    >
      <span className="grid size-full place-items-center rounded-full bg-[#14121C] text-[1.05em] leading-none text-white">
        {usesMark ? <VegaMark className="size-[78%]" mood={mood ?? "neutral"} thinking={thinking} /> : agent.avatar}
      </span>
    </span>
  );
}
