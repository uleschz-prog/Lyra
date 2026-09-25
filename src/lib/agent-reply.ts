import { channels } from "@/config/constellation";
import type { ChannelId, DemoAgent } from "@/lib/types";

const channelLabel = Object.fromEntries(channels.map((channel) => [channel.id, channel.label])) as Record<
  ChannelId,
  string
>;

function craft(agent: DemoAgent, topic: string) {
  const pieces: Record<string, string> = {
    recepcion: `Sí, puedo ayudarte con «${topic}». Te propongo mañana a las 16:30. ¿La confirmo a tu nombre?`,
    prospector: `«${topic}» pide un primer mensaje concreto, no un discurso. El gancho cabe en dos líneas y el siguiente paso es una revisión de 15 minutos.`,
    copywriter: `Gancho: ${topic}. Cuerpo: LYRA ordena la conversación para que la red deje de improvisar. Llamado: abre el estudio y despacha esta pieza.`,
    closer: `La duda dentro de «${topic}» es el siguiente compromiso. Reconoce eso, resume el beneficio operativo y ofrece una sola decisión.`,
    mentor: `Práctica de «${topic}». Días 1-2: estudia y anota una frase. Días 3-5: úsala con un contacto real. Días 6-7: revisa qué avanzó.`,
    comunidad: `Aviso para el grupo sobre «${topic}». Bienvenida breve, una regla clara y la pregunta que mantiene la conversación abierta.`,
    embajador: `Nota para un perfil que ya trabaja «${topic}». Contexto, el valor de la constelación y una invitación de 15 minutos.`,
    soporte: `Para «${topic}»: entra al backoffice, revisa créditos en la billetera y, si el acceso falla, cierra sesión y vuelve a entrar con tu usuario.`,
    recordatorio: `Recordatorio de «${topic}». Fecha, motivo y una línea para confirmar o reagendar.`,
    senales: `Señal: «${topic}». Ángulo para LYRA: convertirla en una pieza útil para la red, sin prometer resultados.`,
  };

  return pieces[agent.id] ?? `${agent.promptTemplate} Tema: ${topic}.`;
}

function shape(channel: ChannelId, agent: DemoAgent, body: string, destination: string) {
  const label = channelLabel[channel];

  if (channel === "whatsapp") {
    return [`WhatsApp · ${destination}`, body, `${agent.star} · ${agent.name}`].join("\n\n");
  }

  if (channel === "email") {
    return [`Asunto: ${agent.name} · ${agent.star}`, "", body, "", destination, `${agent.star} · LYRA`].join("\n");
  }

  if (channel === "telegram") {
    return [`Telegram · ${destination}`, `1. ${body}`, "2. Responde a este mensaje para avanzar.", `${agent.star}`].join("\n\n");
  }

  if (channel === "instagram") {
    return [`DM de Instagram · ${destination}`, body, "Historia: una frase y el enlace al siguiente paso.", agent.star].join("\n\n");
  }

  if (channel === "facebook") {
    return [`Facebook · ${destination}`, body, "Comentario fijado: el siguiente paso queda en la primera línea.", agent.star].join("\n\n");
  }

  if (channel === "linkedin") {
    return [`LinkedIn · ${destination}`, body, "Cierre: una conversación de 15 minutos, sin discurso de ingresos.", `${agent.name} · ${agent.star}`].join("\n\n");
  }

  if (channel === "sms") {
    return `SMS · ${destination}\n${agent.name}: ${body}`.slice(0, 220);
  }

  if (channel === "calendar") {
    return [`Calendario · ${destination}`, "Propuesta: mañana 16:30, 20 minutos.", body, `Confirmación a nombre del contacto. ${agent.star}`].join("\n\n");
  }

  if (channel === "messenger") {
    return [`Messenger · ${destination}`, body, agent.star].join("\n\n");
  }

  return [`Sitio web · ${label} · ${destination}`, body, `${agent.star} · widget de la constelación`].join("\n\n");
}

export function simulateAgentReply(agent: DemoAgent, input: string, channel: ChannelId, handle?: string) {
  const topic = input.trim().replace(/\s+/g, " ");
  const destination = handle
    ? `Listo para ${channelLabel[channel]} · ${handle}`
    : `Borrador de ${channelLabel[channel]}. Vincula el destino para poder enviarlo.`;

  return shape(channel, agent, craft(agent, topic), destination);
}
