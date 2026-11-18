"use client";

import type { VegaMood } from "@/lib/vega/events";
import { AgentMascot } from "@/components/vega/agent-mascot";
import { mascotOf } from "@/lib/vega/mascot";
import { cn } from "@/lib/utils";

/** Avatar de un agente: su mascota (Vega para el principal; forma y color propios para los demás). */
export function AgentAvatar({
  agent,
  className,
  mood,
  thinking,
  ring = false,
}: {
  agent: { id?: string; avatar: string; isDefault: boolean; name: string } | undefined;
  className?: string;
  mood?: VegaMood;
  thinking?: boolean;
  ring?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full",
        ring && "bg-[#EDE9FE]/70 dark:bg-white/8",
        className,
      )}
      aria-hidden
    >
      <AgentMascot mascot={mascotOf(agent)} seed={agent?.id ?? agent?.name} mood={mood} thinking={thinking} className={ring ? "size-[82%]" : "size-full"} />
    </span>
  );
}
