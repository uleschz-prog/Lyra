import type { Prisma } from "@prisma/client";

import { composioConfigured } from "@/lib/ai/composio";
import { userConnections } from "@/lib/ai/composio-user";
import type { WebResult } from "@/lib/ai/search";
import { chargeCredits, creditPrices, currentCredits, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import type { AuthProfile } from "@/lib/types";
import { appStatusLabel } from "@/lib/vega/app-tools";
import { noConnections } from "@/lib/vega/apps";
import type { VegaEvent, VegaMood } from "@/lib/vega/events";
import { openGeminiStream, type FunctionDeclaration, type GeminiContent, type GeminiPart } from "@/lib/vega/gemini-stream";
import { listMemories } from "@/lib/vega/memory";
import { conversationTitle, vegaSystemPrompt } from "@/lib/vega/prompt";
import { freeTools, runVegaTool, vegaTools } from "@/lib/vega/tools";

const HISTORY = 24;
const MAX_STEPS = 4;

const moodTag = /^\[\s*[aá]nimo\s*:\s*([a-záéíóú]+)\s*\]\s*/i;
const moodTagAnywhere = /\[\s*[aá]nimo\s*:\s*[a-záéíóú]+\s*\]\s*/gi;
const moodNames: Record<string, VegaMood> = {
  feliz: "happy",
  enojo: "angry",
  enojado: "angry",
  enojada: "angry",
  triste: "sad",
  sorpresa: "surprised",
  sorprendida: "surprised",
  duda: "doubt",
  neutral: "neutral",
};

function history(rows: { role: string; content: string }[]): GeminiContent[] {
  const merged: GeminiContent[] = [];
  for (const row of rows) {
    const role = row.role === "user" ? "user" : "model";
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.parts[0].text = `${last.parts[0].text}\n\n${row.content}`;
    else merged.push({ role, parts: [{ text: row.content }] });
  }
  while (merged[0]?.role === "model") merged.shift();
  return merged;
}

export function statusLabel(name: string) {
  const app = appStatusLabel(name);
  if (app) return app;
  if (name === "preparar_whatsapp") return "Preparando el mensaje de WhatsApp…";
  if (name === "programar_tarea") return "Programando…";
  if (name === "ver_tareas") return "Revisando tus tareas…";
  if (name === "cancelar_tarea") return "Cancelando la tarea…";
  if (name === "recordar") return "Guardando en memoria…";
  if (name === "olvidar") return "Borrando de la memoria…";
  if (name === "buscar_web") return "Buscando en la web…";
  if (name === "leer_correos") return "Revisando tu Gmail…";
  if (name === "ver_agenda") return "Revisando tu agenda…";
  if (name === "preparar_correo") return "Preparando el correo…";
  if (name === "preparar_evento") return "Preparando el evento…";
  return "Trabajando…";
}

export type VegaTurn = {
  userId: string;
  chatId: string;
  chargeId: string | null;
  chargeKey: string;
  balance: number;
  model: string;
  system: string;
  tools: FunctionDeclaration[];
  contents: GeminiContent[];
  first: Extract<Awaited<ReturnType<typeof openGeminiStream>>, { ok: true }>;
};

type Prepared = { ok: true; turn: VegaTurn } | { ok: false; status: number; error: string; credits?: number; conversationId?: string };

/** Cobra el mensaje, lo guarda y abre la primera respuesta de Gemini. */
export async function prepareVegaTurn(
  user: Pick<AuthProfile, "id" | "name" | "package">,
  input: { conversationId: string | null; message: string; requestId: string; title?: string; channelNote?: string },
): Promise<Prepared> {
  const prisma = getPrisma();
  let conversation = input.conversationId
    ? await prisma.vegaConversation.findFirst({ where: { id: input.conversationId, userId: user.id }, select: { id: true } })
    : null;
  if (input.conversationId && !conversation) return { ok: false, status: 404, error: "Esa conversación ya no existe." };

  const chargeKey = `vega:${user.id}:${input.requestId}`;
  const charge = await chargeCredits(user.id, creditPrices.vegaMessage, "Vega · mensaje", chargeKey);
  if (!charge.ok) return { ok: false, status: 402, error: charge.error, credits: charge.balance };
  if (charge.duplicate) return { ok: false, status: 409, error: "Ese mensaje ya se envió.", credits: charge.balance };

  conversation ??= await prisma.vegaConversation.create({
    data: { userId: user.id, title: input.title ?? conversationTitle(input.message) },
    select: { id: true },
  });
  const chatId = conversation.id;
  await prisma.vegaMessage.create({ data: { conversationId: chatId, role: "user", content: input.message } });

  const rows = await prisma.vegaMessage.findMany({
    where: { conversationId: chatId },
    orderBy: { createdAt: "desc" },
    take: HISTORY,
    select: { role: true, content: true },
  });
  const contents = history(rows.reverse());

  const connections = composioConfigured() ? await userConnections(user.id).catch(() => noConnections) : noConnections;
  const webSearch = Boolean(process.env.EXA_API_KEY);
  const tools = vegaTools(connections, webSearch);
  const memories = await listMemories(user.id).catch(() => []);
  const system = [vegaSystemPrompt(user, connections, webSearch, memories), input.channelNote].filter(Boolean).join("\n");

  const first = await openGeminiStream(system, contents, tools);
  if (!first.ok) {
    await refundCharge(charge.chargeId, "Reembolso: Vega no pudo responder");
    return { ok: false, status: 502, error: first.error, conversationId: chatId };
  }
  return {
    ok: true,
    turn: { userId: user.id, chatId, chargeId: charge.chargeId, chargeKey, balance: charge.balance, model: first.model, system, tools, contents, first },
  };
}

/** Ejecuta el turno completo (texto, herramientas y acciones) y emite los eventos del chat. */
export async function runVegaTurn(turn: VegaTurn, emit: (event: VegaEvent) => void) {
  const prisma = getPrisma();
  const { userId, chatId, chargeKey, system, tools, contents } = turn;
  emit({ t: "credits", v: turn.balance });

  let reply = "";
  let failed = false;
  let toolCharged = false;
  const sources: WebResult[] = [];
  const actionIds: string[] = [];
  const statuses: string[] = [];
  let current = turn.first;
  let pending = "";

  const say = (text: string) => {
    const clean = text.replace(moodTagAnywhere, "");
    if (!clean) return;
    reply += clean;
    emit({ t: "text", v: clean });
  };
  const flush = () => {
    if (pending) say(pending);
    pending = "";
  };
  const readText = (text: string) => {
    pending += text;
    const head = pending.trimStart();
    if (!head) return;
    const match = head.match(moodTag);
    if (match) {
      const mood = moodNames[match[1].toLowerCase()];
      if (mood) emit({ t: "mood", v: mood });
      pending = head.slice(match[0].length);
      flush();
    } else if (!head.startsWith("[") || head.includes("]") || head.length > 40) flush();
  };

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const modelParts: GeminiPart[] = [];
      for await (const part of current.parts) {
        modelParts.push(part);
        if (part.text && !part.thought) {
          if (pending || !reply) readText(part.text);
          else say(part.text);
        }
      }
      flush();
      const calls = modelParts.filter((part) => part.functionCall);
      if (calls.length === 0 || step === MAX_STEPS - 1) break;

      contents.push({ role: "model", parts: modelParts });
      const responses: GeminiPart[] = [];
      for (const part of calls) {
        const call = part.functionCall!;
        let response: Record<string, unknown>;
        if (!toolCharged && !freeTools.has(call.name)) {
          const extra = await chargeCredits(userId, creditPrices.vegaTool - creditPrices.vegaMessage, "Vega · herramienta", `${chargeKey}:tool`);
          if (!extra.ok) {
            responses.push({
              functionResponse: {
                name: call.name,
                response: { error: "El socio no tiene créditos suficientes para usar herramientas. Díselo y responde sin ellas." },
              },
            });
            continue;
          }
          toolCharged = true;
          emit({ t: "credits", v: extra.balance });
        }

        emit({ t: "status", v: statusLabel(call.name) });
        const outcome = await runVegaTool(userId, call.name, call.args ?? {}).catch(() => ({
          kind: "invalid" as const,
          response: { error: "La herramienta falló. Intenta de otra forma o avisa al socio." },
        }));

        if (outcome.kind === "result") {
          statuses.push(outcome.status);
          emit({ t: "status", v: outcome.status });
          if (outcome.sources?.length) {
            const offset = sources.length;
            sources.push(...outcome.sources);
            emit({ t: "sources", v: sources });
            response = offset
              ? { ...outcome.response, instruccion: `Estas fuentes continúan la numeración: la primera es [${offset + 1}].` }
              : outcome.response;
          } else response = outcome.response;
        } else if (outcome.kind === "action") {
          const action = await prisma.vegaAction.create({
            data: {
              userId,
              conversationId: chatId,
              kind: outcome.action,
              payload: outcome.payload as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
          actionIds.push(action.id);
          emit({ t: "action", v: { id: action.id, kind: outcome.action, payload: outcome.payload, status: "pending" } });
          response =
            outcome.action === "whatsapp_message"
              ? {
                  estado: "listo_para_enviar",
                  nota: "El socio ve el mensaje con un botón «Abrir en WhatsApp» y lo envía desde su propio número. No repitas el mensaje completo en tu respuesta.",
                }
              : { estado: "pendiente_de_confirmacion", nota: "El socio ve una tarjeta con Confirmar o Cancelar. No digas que ya se hizo." };
        } else response = outcome.response;

        responses.push({ functionResponse: { name: call.name, response } });
      }
      contents.push({ role: "user", parts: responses });

      const next = await openGeminiStream(system, contents, tools);
      if (!next.ok) {
        failed = true;
        break;
      }
      current = next;
    }
  } catch {
    failed = true;
  }

  const content = reply.trim() || (actionIds.length ? "Te dejé la acción lista para que la confirmes." : "");
  if (content) {
    await prisma.vegaMessage.create({
      data: {
        conversationId: chatId,
        role: "assistant",
        content,
        meta: {
          model: turn.model,
          partial: failed,
          ...(sources.length ? { sources: sources.map(({ title, url }) => ({ title, url })) } : {}),
          ...(actionIds.length ? { actions: actionIds } : {}),
          ...(statuses.length ? { statuses } : {}),
        },
      },
    });
    if (!reply.trim()) emit({ t: "text", v: content });
  } else {
    await refundCharge(turn.chargeId, "Reembolso: Vega no pudo responder");
    emit({ t: "error", v: "Vega no alcanzó a responder. No se descontó el crédito; intenta de nuevo." });
  }
  await prisma.vegaConversation.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
  emit({ t: "credits", v: await currentCredits(userId) });
  return { content, actionIds, sources, failed };
}
