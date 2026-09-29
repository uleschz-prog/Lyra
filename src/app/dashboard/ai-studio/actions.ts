"use server";

import { constellationAgents } from "@/config/constellation";
import { simulateAgentReply } from "@/lib/agent-reply";
import { composioConfigured, sendWhatsappText } from "@/lib/ai/composio";
import { userConnections } from "@/lib/ai/composio-user";
import { getCurrentUser } from "@/lib/auth/profile";
import { withCharge } from "@/lib/credits";
import type { ChannelId } from "@/lib/types";
import { noConnections } from "@/lib/vega/apps";
import { sendBusinessWhatsapp } from "@/lib/vega/whatsapp-business";

export type StudioRun =
  | { ok: true; content: string; credits: number; sent: boolean }
  | { ok: false; error: string; credits?: number; connectUrl?: string | null };

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export async function runStudioAgent(input: {
  agentId: string;
  note: string;
  channel: ChannelId;
  destination?: string;
}): Promise<StudioRun> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  if (user.role !== "ADMIN" && (user.package === "NONE" || user.package === "STARTED")) {
    return { ok: false, error: "Los agentes autónomos se activan con Pro." };
  }

  const agent = constellationAgents.find((item) => item.id === input.agentId);
  if (!agent || !agent.channels.includes(input.channel)) return { ok: false, error: "Ese agente no está disponible." };
  const note = input.note.trim().slice(0, 2000);
  if (!note) return { ok: false, error: "Escribe la instrucción para el agente." };

  const destination = input.destination?.trim().slice(0, 120) || undefined;
  const reply = simulateAgentReply(agent, note, input.channel, destination);
  const whatsapp = input.channel === "whatsapp" && destination;
  let connectUrl: string | null = null;

  if (whatsapp) {
    const to = digits(destination);
    if (to.length < 8 || to.length > 15) {
      return { ok: false, error: "El destino de WhatsApp debe incluir el código de país." };
    }
  }

  const result = await withCharge(
    { userId: user.id, amount: agent.creditCost, description: `${agent.name}: ${note.slice(0, 80)}` },
    async () => {
      if (!whatsapp) return { ok: true as const, value: false };
      if (composioConfigured() && (await userConnections(user.id).catch(() => noConnections)).whatsapp) {
        const own = await sendBusinessWhatsapp(user.id, digits(destination), { text: reply });
        return own.ok ? { ok: true as const, value: true } : { ok: false as const, error: `Tu WhatsApp Business no envió el mensaje: ${own.error}` };
      }
      const sent = await sendWhatsappText(digits(destination), reply);
      if (sent.sent) return { ok: true as const, value: true };
      if (user.role === "ADMIN" && "connectUrl" in sent) connectUrl = sent.connectUrl ?? null;
      return {
        ok: false as const,
        error:
          user.role === "ADMIN"
            ? sent.error
            : "WhatsApp de LYRA no está disponible en este momento. No se descontaron créditos.",
      };
    },
  );

  if (!result.ok) return { ok: false, error: result.error, credits: result.balance, connectUrl };

  const content = result.value
    ? `${reply}\n\nEnviado por WhatsApp a ${destination}.`
    : input.channel === "whatsapp"
      ? `${reply}\n\nVincula el número de WhatsApp para enviarlo.`
      : reply;
  return { ok: true, content, credits: result.balance, sent: result.value };
}
