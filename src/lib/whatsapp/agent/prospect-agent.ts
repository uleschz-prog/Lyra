import { openGeminiStream, type FunctionDeclaration, type GeminiContent, type GeminiPart } from "@/lib/vega/gemini-stream";

export const leadStages = ["nuevo", "interesado", "calificado", "cita", "cliente", "perdido"] as const;
export type LeadStage = (typeof leadStages)[number];

export type AgentEffect =
  | { type: "lead"; stage?: LeadStage; intent?: string; note?: string }
  | { type: "handoff"; reason: string }
  | { type: "followup"; delay: "1h" | "24h" | "3d"; reason: string }
  | { type: "close"; reason: string };

export type AgentContext = {
  ownerName: string;
  instructions: string;
  contactName: string;
  campaign: string | null;
  stage: string;
  notes: string | null;
  history: { direction: string; senderType: string; text: string }[];
  mode: "reply" | "followup";
  followupStep?: number;
};

export type AgentGenerate = typeof openGeminiStream;

const tools: FunctionDeclaration[] = [
  {
    name: "actualizar_prospecto",
    description: "Guarda lo que aprendiste del prospecto: etapa de venta, intención y una nota breve (qué busca, presupuesto, horario).",
    parameters: {
      type: "object",
      properties: {
        etapa: { type: "string", enum: [...leadStages] },
        intencion: { type: "string", description: "Qué quiere, en pocas palabras." },
        nota: { type: "string", description: "Dato útil para el socio, máximo 200 caracteres." },
      },
    },
  },
  {
    name: "pedir_humano",
    description: "Pasa la conversación al socio cuando el prospecto pide hablar con una persona, quiere cerrar una compra, hay una queja o no tienes la respuesta en las instrucciones.",
    parameters: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
  },
  {
    name: "programar_seguimiento",
    description: "Agenda un mensaje de seguimiento si el prospecto pidió que le escribas después.",
    parameters: {
      type: "object",
      properties: { cuando: { type: "string", enum: ["1h", "24h", "3d"] }, motivo: { type: "string" } },
      required: ["cuando"],
    },
  },
  {
    name: "cerrar_conversacion",
    description: "Cierra la conversación cuando el prospecto ya compró, ya agendó con el socio o dejó claro que no le interesa.",
    parameters: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
  },
];

function systemPrompt(context: AgentContext) {
  return [
    `Eres el asistente de ventas de ${context.ownerName} en su WhatsApp Business, creado con LYRA. Atiendes a prospectos que escribieron al número del socio.`,
    context.instructions
      ? `Instrucciones del negocio (tu única fuente de datos sobre productos, precios y horarios):\n${context.instructions}`
      : "El socio todavía no escribió instrucciones del negocio. Saluda, pregunta qué busca la persona y pasa la conversación al socio con pedir_humano.",
    `Prospecto: ${context.contactName}. Etapa actual: ${context.stage}.${context.campaign ? ` Llegó por la campaña «${context.campaign}».` : ""}${context.notes ? ` Notas: ${context.notes}` : ""}`,
    "Escribe en español, en texto plano sin markdown, con mensajes cortos (máximo 90 palabras) y una sola pregunta o siguiente paso al final.",
    "Usa solo datos de las instrucciones. Si te preguntan algo que no está ahí, dilo con honestidad y usa pedir_humano.",
    "Nunca pidas contraseñas, datos de tarjeta ni códigos de verificación. No prometas ingresos ni resultados garantizados.",
    "Usa actualizar_prospecto cuando aprendas algo nuevo del prospecto. Si la persona pide que no le escriban, despídete en una frase.",
    context.mode === "followup"
      ? `Este es el seguimiento número ${context.followupStep ?? 1} porque el prospecto no ha respondido. Escribe un mensaje breve, amable y sin presión que retome la conversación; recuérdale que puede escribir /stop para no recibir más mensajes. No uses herramientas.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function contents(context: AgentContext): GeminiContent[] {
  const merged: GeminiContent[] = [];
  for (const item of context.history) {
    const role = item.direction === "inbound" ? "user" : "model";
    const text = item.text || "(mensaje sin texto)";
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.parts[0].text = `${last.parts[0].text}\n${text}`;
    else merged.push({ role, parts: [{ text }] });
  }
  while (merged[0]?.role === "model") merged.shift();
  if (context.mode === "followup" || !merged.length || merged[merged.length - 1].role === "model") {
    merged.push({ role: "user", parts: [{ text: "(Genera el siguiente mensaje para el prospecto.)" }] });
  }
  return merged;
}

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function effectFromCall(name: string, args: Record<string, unknown>): AgentEffect | null {
  if (name === "actualizar_prospecto") {
    const stage = leadStages.find((item) => item === args.etapa);
    const intent = clip(args.intencion, 120);
    const note = clip(args.nota, 200);
    if (!stage && !intent && !note) return null;
    return { type: "lead", ...(stage ? { stage } : {}), ...(intent ? { intent } : {}), ...(note ? { note } : {}) };
  }
  if (name === "pedir_humano") return { type: "handoff", reason: clip(args.motivo, 200) || "El prospecto necesita al socio." };
  if (name === "programar_seguimiento") {
    const delay = args.cuando === "1h" || args.cuando === "3d" ? args.cuando : "24h";
    return { type: "followup", delay, reason: clip(args.motivo, 200) };
  }
  if (name === "cerrar_conversacion") return { type: "close", reason: clip(args.motivo, 200) || "Conversación cerrada." };
  return null;
}

/** Quita el formato que WhatsApp mostraría como símbolos en texto plano. */
export function plainText(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Genera la respuesta del agente. Las herramientas solo producen efectos; el backend decide qué aplicar. */
export async function runProspectAgent(context: AgentContext, generate: AgentGenerate = openGeminiStream) {
  const system = systemPrompt(context);
  const conversation = contents(context);
  const toolset = context.mode === "reply" ? tools : [];
  const effects: AgentEffect[] = [];
  let reply = "";

  for (let step = 0; step < 3; step += 1) {
    const opened = await generate(system, conversation, toolset);
    if (!opened.ok) return { ok: false as const, error: opened.error, effects };
    const parts: GeminiPart[] = [];
    for await (const part of opened.parts) {
      parts.push(part);
      if (part.text && !part.thought) reply += part.text;
    }
    const calls = parts.filter((part) => part.functionCall);
    if (!calls.length) break;
    conversation.push({ role: "model", parts });
    conversation.push({
      role: "user",
      parts: calls.map((part) => {
        const effect = effectFromCall(part.functionCall!.name, part.functionCall!.args ?? {});
        if (effect) effects.push(effect);
        return { functionResponse: { name: part.functionCall!.name, response: { ok: Boolean(effect) } } };
      }),
    });
  }

  const text = plainText(reply);
  if (!text) return { ok: false as const, error: "El agente no generó respuesta.", effects };
  return { ok: true as const, text, effects };
}
