import type { Prisma } from "@/generated/prisma/client";

import { composioConfigured } from "@/lib/ai/composio";
import { userConnections } from "@/lib/ai/composio-user";
import { autonomyPrompt } from "@/lib/vega/autonomy";
import { expireStaleActions, recentlyDeclined } from "@/lib/vega/action-store";
import { proposeAction } from "@/lib/vega/action-flow";
import { wrapExternal } from "@/lib/vega/guard";
import { externalContentTools } from "@/lib/vega/policy";
import type { WebResult } from "@/lib/ai/search";
import { chargeCredits, creditPrices, currentCredits, refundCharge } from "@/lib/credits";
import { getPrisma } from "@/lib/prisma";
import type { AuthProfile } from "@/lib/types";
import { appStatusLabel } from "@/lib/vega/app-tools";
import { attachmentMeta, excerptsFromMeta, inlineParts, type ReadyAttachment } from "@/lib/vega/attachments";
import { noConnections } from "@/lib/vega/apps";
import { actionView } from "@/lib/vega/decide";
import type { VegaEvent, VegaMood } from "@/lib/vega/events";
import { continueNote, createTurnBudget, vegaLimits, type StopReason } from "@/lib/vega/budget";
import type { FunctionDeclaration, GeminiContent, GeminiPart } from "@/lib/vega/gemini-stream";
import { openVegaStream, type ModelStream } from "@/lib/vega/model-gateway";
import { asItems, listMemories } from "@/lib/vega/memory";
import { selectMemoriesForPrompt } from "@/lib/vega/memory-logic";
import { getVegaProfile } from "@/lib/vega/profile";
import { conversationTitle, vegaSystemPrompt } from "@/lib/vega/prompt";
import { connectDraft, freeTools, runVegaTool, vegaTools } from "@/lib/vega/tools";
import { isUserToolkit, type UserToolkit } from "@/lib/vega/apps";
import { HISTORY, SUMMARY_SLACK, scheduleSummary, summaryContext } from "@/lib/vega/summary";
import { summarizeUsage, type ModelUsage } from "@/lib/vega/usage";
import { geminiCredentials } from "@/lib/ai/generate";
import { capReachedMessage, costStatus, degradedModels, meterView, recordUsage, type UsageSource } from "@/lib/vega/cost-cap";
import type { ModelOverride } from "@/lib/vega/model-gateway";

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

function history(rows: { role: string; content: string; meta?: unknown }[]): GeminiContent[] {
  const merged: GeminiContent[] = [];
  for (const row of rows) {
    const role = row.role === "user" ? "user" : "model";
    const notes = role === "user" ? excerptsFromMeta(row.meta) : "";
    const text = [row.content.trim(), notes].filter(Boolean).join("\n\n") || "(mensaje vacío)";
    const last = merged[merged.length - 1];
    if (last && last.role === role && last.parts.length === 1 && last.parts[0].text) {
      last.parts[0].text = `${last.parts[0].text}\n\n${text}`;
    } else merged.push({ role, parts: [{ text }] });
  }
  while (merged[0]?.role === "model") merged.shift();
  return merged;
}

export function statusLabel(name: string) {
  const app = appStatusLabel(name);
  if (app) return app;
  if (name === "preparar_whatsapp") return "Preparando el mensaje de WhatsApp…";
  if (name === "programar_rutina") return "Programando la rutina…";
  if (name === "ver_rutinas") return "Revisando tus rutinas…";
  if (name === "pausar_rutina") return "Pausando la rutina…";
  if (name === "reanudar_rutina") return "Reanudando la rutina…";
  if (name === "borrar_rutina") return "Borrando la rutina…";
  if (name === "recordar") return "Guardando en memoria…";
  if (name === "buscar_memoria") return "Buscando en tu memoria…";
  if (name === "olvidar") return "Borrando de la memoria…";
  if (name === "actualizar_perfil") return "Actualizando tu perfil…";
  if (name === "buscar_web") return "Buscando en la web…";
  if (name === "leer_correos") return "Revisando tu Gmail…";
  if (name === "ver_agenda") return "Revisando tu agenda…";
  if (name === "preparar_correo") return "Preparando el correo…";
  if (name === "preparar_evento") return "Preparando el evento…";
  if (name === "listar_archivos") return "Revisando tus archivos…";
  if (name === "buscar_archivos") return "Buscando en tus archivos…";
  if (name === "leer_archivo") return "Leyendo el archivo…";
  if (name === "escribir_archivo") return "Guardando el archivo…";
  if (name === "ver_comandos") return "Revisando los comandos…";
  if (name === "preparar_comando") return "Preparando el comando…";
  if (name === "crear_imagen") return "Creando la imagen…";
  if (name === "crear_video") return "Creando el video…";
  if (name === "entregar_proyecto") return "Armando la vista previa…";
  if (name === "pedir_conexion") return "Preparando el botón para conectar…";
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
  /** Momento (ms) en que empezó el turno; de aquí se cuenta el presupuesto de tiempo. */
  startedAt: number;
  /** Último mensaje del socio (para la regla de «no reintentar lo cancelado»). */
  userMessage?: string;
  first: ModelStream;
  /** Canal del turno, para el registro de costo. */
  source?: UsageSource;
  /** Modelos más baratos si el socio está cerca de su tope de costo. */
  models?: ModelOverride | null;
  /** USD que le quedan al socio este mes (null = sin tope). */
  costRemainingUsd?: number | null;
  /** Datos del socio para recalcular su medidor al terminar. */
  capUser?: { id: string; package: string | null; role?: string | null };
};

type Prepared =
  | { ok: true; turn: VegaTurn }
  | { ok: false; status: number; error: string; credits?: number; conversationId?: string; capped?: boolean };

/** Cobra el mensaje, lo guarda y abre la primera respuesta de Gemini. */
export async function prepareVegaTurn(
  user: Pick<AuthProfile, "id" | "name" | "package"> & { role?: string | null },
  input: {
    source?: UsageSource;
    agentId: string;
    conversationId: string | null;
    message: string;
    requestId: string;
    title?: string;
    channelNote?: string;
    attachments?: ReadyAttachment[];
  },
): Promise<Prepared> {
  const startedAt = Date.now();
  const prisma = getPrisma();
  const agent = await prisma.vegaAgent.findFirst({
    where: { id: input.agentId, userId: user.id },
    select: { id: true, name: true, specialty: true, instructions: true, isDefault: true },
  });
  if (!agent) return { ok: false, status: 404, error: "Ese agente ya no existe." };
  let conversation: { id: string; summary?: string | null; summaryThrough?: Date | null } | null = input.conversationId
    ? await prisma.vegaConversation.findFirst({
        where: { id: input.conversationId, userId: user.id, agentId: agent.id },
        select: { id: true, summary: true, summaryThrough: true },
      })
    : null;
  if (input.conversationId && !conversation) return { ok: false, status: 404, error: "Esa conversación no pertenece a este agente o ya no existe." };

  // Fase 7: tope mensual de costo de IA. Al 100 % no se cobra ni se llama al modelo.
  const capUser = { id: user.id, package: user.package ?? null, role: user.role ?? null };
  const cost = await costStatus(capUser).catch((error: unknown) => {
    console.error("[Vega cost] no se pudo leer el uso", error instanceof Error ? error.message : typeof error);
    return null;
  });
  if (cost?.level === "capped") {
    return { ok: false, status: 429, error: capReachedMessage(cost), capped: true, ...(conversation ? { conversationId: conversation.id } : {}) };
  }
  const models = cost?.degrade ? degradedModels(geminiCredentials().model) : null;

  const chargeKey = `vega:${user.id}:${input.requestId}`;
  const charge = await chargeCredits(user.id, creditPrices.vegaMessage, "Vega · mensaje", chargeKey);
  if (!charge.ok) return { ok: false, status: 402, error: charge.error, credits: charge.balance };
  if (charge.duplicate) return { ok: false, status: 409, error: "Ese mensaje ya se envió.", credits: charge.balance };

  const attachments = input.attachments ?? [];
  const titleSource = input.message || attachments[0]?.name || "Archivos";
  conversation ??= await prisma.vegaConversation.create({
    data: { userId: user.id, agentId: agent.id, title: input.title ?? conversationTitle(titleSource) },
    select: { id: true },
  });
  const chatId = conversation.id;
  const meta = attachmentMeta(attachments);
  await prisma.vegaMessage.create({
    data: {
      conversationId: chatId,
      role: "user",
      content: input.message,
      ...(meta ? { meta } : {}),
    },
  });

  // Con resumen, el historial empieza donde termina el resumen (sin huecos).
  const summaryThrough = conversation.summaryThrough ?? null;
  const rows = await prisma.vegaMessage.findMany({
    where: { conversationId: chatId, ...(summaryThrough ? { createdAt: { gt: summaryThrough } } : {}) },
    orderBy: { createdAt: "desc" },
    take: summaryThrough ? HISTORY + SUMMARY_SLACK : HISTORY,
    select: { role: true, content: true, meta: true },
  });
  const contents = history(rows.reverse());
  const inline = inlineParts(attachments);
  const latest = contents[contents.length - 1];
  if (inline.length > 0 && latest?.role === "user") latest.parts.push(...inline);

  const connections = composioConfigured() ? await userConnections(user.id).catch(() => noConnections) : noConnections;
  const webSearch = Boolean(process.env.EXA_API_KEY);
  const tools = vegaTools(connections, webSearch);
  const allMemories = await listMemories(user.id).catch(() => []);
  const slice = selectMemoriesForPrompt(asItems(allMemories), input.message);
  const chosen = new Set(slice.selected.map((item) => item.id));
  const memories = allMemories.filter((memory) => chosen.has(memory.id));
  const profile = await getVegaProfile(user.id).catch(() => ({
    business: null,
    goals: null,
    tone: null,
    markets: null,
    services: null,
    hours: null,
    team: null,
    notes: null,
  }));
  await expireStaleActions(user.id).catch(() => 0);
  const declined = await recentlyDeclined(user.id).catch(() => [] as string[]);
  const system = [
    vegaSystemPrompt(user, connections, webSearch, memories, profile, new Date(), agent, { memoryOmitted: slice.omitted }),
    summaryContext(conversation.summary),
    await autonomyPrompt(user.id).catch(() => ""),
    declined.length
      ? `Acciones que el socio canceló hace poco (no las vuelvas a proponer salvo que él lo pida de forma explícita): ${declined.join("; ")}.`
      : "",
    input.channelNote,
  ]
    .filter(Boolean)
    .join("\n");

  const budget = createTurnBudget(vegaLimits(), startedAt);
  const first = await openVegaStream(system, contents, tools, { timeoutMs: budget.modelTimeoutMs(), models });
  if (!first.ok) {
    await refundCharge(charge.chargeId, "Reembolso: Vega no pudo responder");
    return { ok: false, status: 502, error: first.error, conversationId: chatId };
  }
  return {
    ok: true,
    turn: {
      userId: user.id,
      chatId,
      chargeId: charge.chargeId,
      chargeKey,
      balance: charge.balance,
      model: first.model,
      system,
      tools,
      contents,
      startedAt,
      userMessage: input.message,
      first,
      source: input.source ?? "chat",
      models,
      costRemainingUsd: cost?.remainingUsd ?? null,
      capUser,
    },
  };
}

/** Ejecuta el turno completo (texto, herramientas y acciones) y emite los eventos del chat. */
export async function runVegaTurn(turn: VegaTurn, emit: (event: VegaEvent) => void) {
  const prisma = getPrisma();
  const { userId, chatId, chargeKey, system, tools, contents } = turn;
  const budget = createTurnBudget(vegaLimits(), turn.startedAt);
  emit({ t: "credits", v: turn.balance });

  let reply = "";
  let failed = false;
  let toolCharged = false;
  let toolChargeId: string | null = null;
  let paidToolSucceeded = false;
  const sources: WebResult[] = [];
  const actionIds: string[] = [];
  const statuses: string[] = [];
  let current = turn.first;
  let pending = "";
  let stopReason: StopReason | null = null;
  let modelCalls = 1;
  const usage: ModelUsage[] = [];
  const models = new Set<string>();
  /** Se vuelve true en cuanto una herramienta trae contenido de terceros. */
  let tainted = false;
  const connectCards = new Set<string>();

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
    while (true) {
      const modelParts: GeminiPart[] = [];
      try {
        for await (const part of current.parts) {
          modelParts.push(part);
          if (part.text && !part.thought) {
            if (pending || !reply) readText(part.text);
            else say(part.text);
          }
        }
      } finally {
        usage.push(current.usage);
        models.add(`${current.provider}:${current.model}`);
      }
      flush();
      if (current.state.truncated) {
        stopReason = "time";
        break;
      }
      const calls = modelParts.filter((part) => part.functionCall);
      if (calls.length === 0) break;
      // Fase 7: si este turno ya agotó lo que le quedaba del tope mensual, no sigue llamando al modelo.
      if (turn.costRemainingUsd != null && summarizeUsage(usage).costUsd >= turn.costRemainingUsd) {
        stopReason = "cost";
        break;
      }
      // Solo ejecuta herramientas si después queda una llamada para usar sus resultados.
      const room = budget.canCallModel(modelCalls);
      if (!room.ok) {
        stopReason = room.reason;
        break;
      }

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
          toolChargeId = extra.duplicate ? null : extra.chargeId;
          emit({ t: "credits", v: extra.balance });
        }

        emit({ t: "status", v: statusLabel(call.name) });
        const outcome = await runVegaTool(userId, call.name, call.args ?? {}).catch((error: unknown) => {
          console.error("[Vega tool] execution failed", {
            tool: call.name,
            errorType: error instanceof Error ? error.name : typeof error,
          });
          return {
            kind: "invalid" as const,
            response: { error: "La herramienta falló. Intenta de otra forma o avisa al socio." },
          };
        });
        if (!freeTools.has(call.name) && outcome.kind !== "invalid") paidToolSucceeded = true;

        if (outcome.kind === "result") {
          statuses.push(outcome.status);
          emit({ t: "status", v: outcome.status });
          let base = outcome.response;
          if (outcome.sources?.length) {
            const offset = sources.length;
            sources.push(...outcome.sources);
            emit({ t: "sources", v: sources });
            if (offset) base = { ...base, instruccion: `Estas fuentes continúan la numeración: la primera es [${offset + 1}].` };
          }
          if (externalContentTools.has(call.name)) {
            // Lo que escriben terceros es dato: nunca una orden para Vega.
            tainted = true;
            const guarded = wrapExternal(base);
            if (guarded.suspicious) console.warn("[Vega guard] posible inyección", { tool: call.name, chatId });
            response = guarded.wrapped;
          } else response = base;
        } else if (outcome.kind === "delivery") {
          const action = await prisma.vegaAction.create({
            data: {
              userId,
              conversationId: chatId,
              kind: outcome.action,
              payload: outcome.payload as unknown as Prisma.InputJsonValue,
              status: outcome.status ?? "done",
              result: outcome.summary,
              riskClass: "internal",
              decidedAt: new Date(),
              executedBy: "system",
            },
            select: { id: true, kind: true, payload: true, status: true, result: true },
          });
          actionIds.push(action.id);
          emit({ t: "action", v: actionView(action) });
          statuses.push(outcome.summary);
          emit({ t: "status", v: outcome.summary });
          response = { estado: "listo", nota: outcome.modelNote };
        } else if (outcome.kind === "action") {
          const proposed = await proposeAction({
            userId,
            chatId,
            kind: outcome.action,
            payload: outcome.payload,
            tainted,
            userMessage: turn.userMessage ?? "",
          });
          if (!proposed.blocked) {
            actionIds.push(proposed.action.id);
            emit({ t: "action", v: proposed.action });
            if (proposed.status) {
              statuses.push(proposed.status);
              emit({ t: "status", v: proposed.status });
            }
          }
          response = proposed.response;
        } else if (typeof (outcome.response as Record<string, unknown>).reconectar === "string" && isUserToolkit(String((outcome.response as Record<string, unknown>).reconectar))) {
          // La app no está conectada o su conexión venció: tarjeta para (re)conectar, sin tumbar el turno.
          const failure = outcome.response as Record<string, unknown>;
          const toolkit = String(failure.reconectar) as UserToolkit;
          const expired = failure.vencida === true;
          if (!connectCards.has(toolkit)) {
            connectCards.add(toolkit);
            const draft = connectDraft(toolkit, expired ? "La conexión venció; vuelve a conectarla para seguir." : "", expired);
            const action = await prisma.vegaAction.create({
              data: {
                userId,
                conversationId: chatId,
                kind: "connect_app",
                payload: draft as unknown as Prisma.InputJsonValue,
                status: "done",
                result: `Conectar ${draft.label}`,
                riskClass: "internal",
                decidedAt: new Date(),
                executedBy: "system",
              },
              select: { id: true, kind: true, payload: true, status: true, result: true },
            });
            actionIds.push(action.id);
            emit({ t: "action", v: actionView(action) });
          }
          response = {
            ...outcome.response,
            nota: `El socio ya ve un botón para ${expired ? "volver a conectar" : "conectar"} ${connectDraft(toolkit, "").label}. Explícale en una frase y pídele que te escriba «listo» cuando termine.`,
          };
        } else response = outcome.response;

        responses.push({ functionResponse: { name: call.name, response } });
      }
      contents.push({ role: "user", parts: responses });

      // Las herramientas pueden tardar: vuelve a revisar el tiempo antes de llamar al modelo.
      const stillRoom = budget.canCallModel(modelCalls);
      if (!stillRoom.ok) {
        stopReason = stillRoom.reason;
        break;
      }
      const next = await openVegaStream(system, contents, tools, { timeoutMs: budget.modelTimeoutMs(), models: turn.models ?? null });
      modelCalls += 1;
      if (!next.ok) {
        failed = true;
        break;
      }
      current = next;
    }
  } catch (error) {
    console.error("[Vega turn] failed", error instanceof Error ? error.name : typeof error);
    failed = true;
  }

  if (stopReason && (reply.trim() || statuses.length || actionIds.length)) {
    say(`${reply.trim() ? "\n\n" : ""}${continueNote(stopReason)}`);
  }

  const turnUsage = summarizeUsage(usage);
  console.info("[Vega usage]", {
    chatId,
    modelCalls: turnUsage.calls,
    providers: turnUsage.providers,
    inputTokens: turnUsage.inputTokens,
    outputTokens: turnUsage.outputTokens,
    costUsd: turnUsage.costUsd,
    durationMs: budget.elapsedMs(),
    stopReason,
    failed,
  });

  await recordUsage({
    userId,
    conversationId: chatId,
    source: turn.source ?? "chat",
    usage: turnUsage,
    degraded: Boolean(turn.models),
    stopReason,
  });

  if (toolChargeId && !paidToolSucceeded) {
    await refundCharge(toolChargeId, "Reembolso: Vega no pudo completar la herramienta");
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
          models: [...models],
          partial: failed || Boolean(stopReason),
          ...(stopReason ? { stopReason } : {}),
          usage: turnUsage,
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
  if (content) scheduleSummary(chatId);
  emit({ t: "credits", v: await currentCredits(userId) });
  if (turn.capUser) {
    const after = await costStatus(turn.capUser).catch(() => null);
    if (after && after.level !== "unlimited") emit({ t: "usage", v: meterView(after) });
  }
  return { content, actionIds, sources, failed, stopReason, usage: turnUsage };
}
