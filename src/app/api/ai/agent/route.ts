import { NextResponse } from "next/server";

import { aiJson, chargeAiCall, idempotencyKeyFrom, requireAiUser } from "@/lib/ai/guard";
import { whatsappDisabledMessage, whatsappSendPolicy } from "@/lib/ai/whatsapp-policy";
import { simulateAgentReply } from "@/lib/agent-reply";
import { sendWhatsappText } from "@/lib/ai/composio";
import { constellationAgents } from "@/config/constellation";
import { readCreditBalance } from "@/lib/credits/ledger";
import type { ChannelId } from "@/lib/types";

export const maxDuration = 60;

const channels = new Set<ChannelId>([
  "whatsapp",
  "email",
  "telegram",
  "instagram",
  "facebook",
  "linkedin",
  "messenger",
  "sms",
  "web",
  "calendar",
]);

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export async function POST(request: Request) {
  const session = await requireAiUser();
  if (!session.user) return session.response;
  const user = session.user;

  if (user.package === "NONE" || user.package === "STARTED") {
    return NextResponse.json({ error: "Los agentes autónomos se activan con Pro." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    agentId?: unknown;
    note?: unknown;
    channel?: unknown;
    destination?: unknown;
    idempotencyKey?: unknown;
  } | null;

  const agent = constellationAgents.find((item) => item.id === body?.agentId);
  if (!agent) return NextResponse.json({ error: "Ese agente no está en el estudio." }, { status: 400 });

  const channel = body?.channel;
  if (typeof channel !== "string" || !channels.has(channel as ChannelId) || !agent.channels.includes(channel as ChannelId)) {
    return NextResponse.json({ error: "Ese canal no está disponible para este agente." }, { status: 400 });
  }

  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (!note) return NextResponse.json({ error: "Escribe el contexto para el agente." }, { status: 400 });

  const destination = typeof body?.destination === "string" ? body.destination.trim().slice(0, 80) : "";
  const channelId = channel as ChannelId;
  const reply = simulateAgentReply(agent, note, channelId, destination || undefined);
  const key = idempotencyKeyFrom(request, body?.idempotencyKey);
  const phone = digits(destination);
  const sendWhatsapp = channelId === "whatsapp" && phone.length >= 8 && phone.length <= 15;

  if (channelId === "whatsapp" && !sendWhatsapp) {
    const balance = await readCreditBalance(user.id);
    return aiJson(
      {
        reply: `${reply}\n\nVincula el número de WhatsApp para enviarlo.`,
        charged: 0,
        sent: false,
      },
      200,
      balance,
    );
  }

  if (sendWhatsapp && !whatsappSendPolicy(user.role, process.env.LYRA_WHATSAPP_ENABLED).allowed) {
    const balance = await readCreditBalance(user.id);
    return aiJson({ reply: `${reply}\n\n${whatsappDisabledMessage}`, charged: 0, sent: false }, 200, balance);
  }

  const charged = await chargeAiCall({
    userId: user.id,
    cost: agent.creditCost,
    reason: "ai.agent",
    description: `${agent.name}: ${note}`,
    idempotencyKey: key,
    metadata: { agentId: agent.id, channel: channelId, vegaReady: true },
    execute: async () => {
      if (!sendWhatsapp) return { sent: false as const };
      const result = await sendWhatsappText(phone, reply);
      if (!result.sent) {
        throw new Error(result.error || "WhatsApp no aceptó el envío.");
      }
      return { sent: true as const };
    },
  });

  if (!charged.ok) {
    return aiJson(
      {
        error: charged.error,
        sent: false,
        ...(charged.status === 502 ? { reply } : {}),
      },
      charged.status,
      charged.balance,
    );
  }

  const content = charged.value.sent ? `${reply}\n\nEnviado por WhatsApp a ${destination}.` : reply;
  return aiJson(
    {
      reply: content,
      charged: charged.charged,
      sent: charged.value.sent,
      transaction: charged.transaction,
    },
    200,
    charged.balance,
  );
}
