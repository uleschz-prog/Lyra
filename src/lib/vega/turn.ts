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
import { createMoodFilter, stripMoodTags } from "@/lib/vega/mood-tag";
import type { VegaEvent, VegaMood } from "@/lib/vega/events";
import { continueNote, createTurnBudget, vegaLimits, type StopReason, type VegaLimits } from "@/lib/vega/budget";
import { parsePersona, personaPrompt, type AgentScope } from "@/lib/vega/agent-scope";
import { chatGeneration, humanizeToolNames } from "@/lib/vega/answer-style";
import { backgroundJobTool, delegateDeclaration, delegateTool, startBackgroundJob, startDelegation } from "@/lib/vega/jobs-tool";
import type { FunctionDeclaration, GeminiContent, GeminiPart } from "@/lib/vega/gemini-stream";
import { openVegaStream, type ModelStream } from "@/lib/vega/model-gateway";
import { asItems, listMemories } from "@/lib/vega/memory";
import { selectMemoriesForPrompt } from "@/lib/vega/memory-logic";
import { getVegaProfile } from "@/lib/vega/profile";
import { conversationTitle, vegaSystemPrompt } from "@/lib/vega/prompt";
import { connectDraft, freeTools, runVegaTool, vegaTools, type ImageGenerationDraft } from "@/lib/vega/tools";
import { startImageFromDelivery, turnImageInputs, type TurnImageInput } from "@/lib/vega/images/delivery";
import { imageToolName } from "@/lib/vega/images/tool";
import { xStatusLabels } from "@/lib/vega/x/tools";
import { saveDeliveredProject } from "@/lib/projects/store";
import { briefGate, wantsLeaderboard } from "@/lib/vega/briefing";
import { builderEnabled, builderPrice } from "@/lib/builder/config";
import { liveAppsAvailable } from "@/lib/liveapps/config";
import { briefFromDelivery, buildCharge, startProjectBuild, startProjectEdit, type BuildView } from "@/lib/builder/runner";
import { isUserToolkit, type UserToolkit } from "@/lib/vega/apps";
import { HISTORY, SUMMARY_SLACK, scheduleSummary, summaryContext } from "@/lib/vega/summary";
import { summarizeUsage, type ModelUsage } from "@/lib/vega/usage";
import { geminiCredentials } from "@/lib/ai/generate";
import { chatTier, saturatedMessage, type ModelTier } from "@/lib/ai/models";
import { capReachedMessage, costStatus, degradedModels, meterView, recordUsage, type UsageSource } from "@/lib/vega/cost-cap";
import type { ModelOverride } from "@/lib/vega/model-gateway";

const moodTag = /^\[\s*[aá]nimo\s*:\s*([a-záéíóú]+)\s*\]\s*/i;
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
    const content = role === "model" ? stripMoodTags(row.content).trim() : row.content.trim();
    const text = [content, notes].filter(Boolean).join("\n\n") || "(mensaje vacío)";
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
  if (name === "generar_imagen") return "Preparando la imagen…";
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
  if (xStatusLabels[name]) return xStatusLabels[name];
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
  if (name === "entregar_proyecto") return "Armando la vista previa…";
  if (name === "abrir_proyecto") return "Abriendo el proyecto…";
  if (name === "editar_proyecto") return "Preparando los cambios…";
  if (name === "pedir_conexion") return "Preparando el botón para conectar…";
  if (name === backgroundJobTool) return "Preparando el trabajo en segundo plano…";
  if (name === delegateTool) return "Pasando la tarea a otro agente…";
  return "Trabajando…";
}

export type VegaTurn = {
  userId: string;
  chatId: string;
  /** Agente que responde este turno. */
  agentId?: string;
  /** Vega v2 · V3: memoria y rutinas de este agente (el perfil se comparte). */
  scope?: AgentScope;
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
  /** Nivel de modelo del primer paso (AI Gateway). Tras usar herramientas se sube a «fuerte». */
  tier?: ModelTier;
  /** true si el socio está cerca del tope: todo el turno usa el nivel «rápido». */
  degraded?: boolean;
  /** USD que le quedan al socio este mes (null = sin tope). */
  costRemainingUsd?: number | null;
  /** Datos del socio para recalcular su medidor al terminar. */
  capUser?: { id: string; package: string | null; role?: string | null };
  /** Límites de este turno (un paso de trabajo usa menos tiempo que el chat). */
  limits?: VegaLimits;
  /** false = no guarda la respuesta como mensaje (pasos intermedios de un trabajo). */
  persistReply?: boolean;
  /** Tarjetas de pasos anteriores que se agregan al mensaje final. */
  extraActionIds?: string[];
  /** Trabajo al que pertenece este turno (se guarda en el mensaje). */
  jobId?: string;
  /** Trabajos en segundo plano que este turno dejó en cola. */
  startedJobs?: string[];
  /** Imágenes adjuntas en este mensaje (referencias para generar_imagen). */
  imageInputs?: TurnImageInput[];
};

type Prepared =
  | { ok: true; turn: VegaTurn }
  | { ok: false; status: number; error: string; credits?: number; conversationId?: string; capped?: boolean };

/** Otros agentes del socio (para delegar). Si falla la consulta, simplemente no se ofrece delegar. */
async function listTeammates(userId: string, agentId: string) {
  try {
    return await getPrisma().vegaAgent.findMany({
      where: { userId, id: { not: agentId } },
      orderBy: { createdAt: "asc" },
      take: 12,
      select: { id: true, name: true, specialty: true },
    });
  } catch {
    return [];
  }
}

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
    /** El mensaje no se guarda en la conversación (pasos de un trabajo en segundo plano). */
    ephemeral?: boolean;
    /** Herramientas que no se ofrecen en este turno. */
    excludeTools?: string[];
    /** Tope de tiempo de este turno (ms); por defecto el del chat. */
    timeBudgetMs?: number;
  },
): Promise<Prepared> {
  const startedAt = Date.now();
  const prisma = getPrisma();
  const agent = await prisma.vegaAgent.findFirst({
    where: { id: input.agentId, userId: user.id },
    select: { id: true, name: true, specialty: true, instructions: true, isDefault: true, persona: true },
  });
  if (!agent) return { ok: false, status: 404, error: "Ese agente ya no existe." };
  const scope: AgentScope = { agentId: agent.id, isDefault: agent.isDefault };
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
  const degraded = Boolean(cost?.degrade);
  const tier: ModelTier = degraded ? "rapido" : chatTier({ message: input.message, attachments: input.attachments?.length ?? 0, source: input.source ?? "chat" });

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
  if (!input.ephemeral) {
    await prisma.vegaMessage.create({
      data: {
        conversationId: chatId,
        role: "user",
        content: input.message,
        ...(meta ? { meta } : {}),
      },
    });
  }

  // Con resumen, el historial empieza donde termina el resumen (sin huecos).
  const summaryThrough = conversation.summaryThrough ?? null;
  const rows = await prisma.vegaMessage.findMany({
    where: { conversationId: chatId, ...(summaryThrough ? { createdAt: { gt: summaryThrough } } : {}) },
    orderBy: { createdAt: "desc" },
    take: summaryThrough ? HISTORY + SUMMARY_SLACK : HISTORY,
    select: { role: true, content: true, meta: true },
  });
  const contents = history(input.ephemeral ? [...rows.reverse(), { role: "user", content: input.message }] : rows.reverse());
  const inline = inlineParts(attachments);
  const latest = contents[contents.length - 1];
  if (inline.length > 0 && latest?.role === "user") latest.parts.push(...inline);

  const connections = composioConfigured() ? await userConnections(user.id).catch(() => noConnections) : noConnections;
  const webSearch = Boolean(process.env.EXA_API_KEY);
  const excluded = new Set(input.excludeTools ?? []);
  // La imagen la genera la tarjeta del chat: WhatsApp, rutinas y trabajos no la ofrecen.
  if ((input.source ?? "chat") !== "chat") excluded.add(imageToolName);
  const teammates = excluded.has(delegateTool) ? [] : await listTeammates(user.id, agent.id);
  const tools = [...vegaTools(connections, webSearch), ...(teammates.length ? [delegateDeclaration(teammates)] : [])].filter((tool) => !excluded.has(tool.name));
  const allMemories = await listMemories(user.id, scope).catch(() => []);
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
    vegaSystemPrompt(user, connections, webSearch, memories, profile, new Date(), agent, { memoryOmitted: slice.omitted, liveApps: liveAppsAvailable(user) }),
    personaPrompt(parsePersona(agent.persona)),
    teammates.length
      ? `Otros agentes del socio (puedes pasarles tareas con ${delegateTool}): ${teammates.map((mate) => (mate.specialty ? `${mate.name} — ${mate.specialty}` : mate.name)).join("; ")}. Tu memoria y tus rutinas son solo tuyas; los datos de perfil del socio se comparten.`
      : "",
    summaryContext(conversation.summary),
    await autonomyPrompt(user.id).catch(() => ""),
    declined.length
      ? `Acciones que el socio canceló hace poco (no las vuelvas a proponer salvo que él lo pida de forma explícita): ${declined.join("; ")}.`
      : "",
    input.channelNote,
  ]
    .filter(Boolean)
    .join("\n");

  const base = vegaLimits();
  const limits = input.timeBudgetMs ? { ...base, timeBudgetMs: Math.max(10_000, Math.min(base.timeBudgetMs, input.timeBudgetMs)) } : base;
  const budget = createTurnBudget(limits, startedAt);
  const first = await openVegaStream(system, contents, tools, { timeoutMs: budget.modelTimeoutMs(), models, generation: chatGeneration, tier, label: `turno:${input.source ?? "chat"}` });
  if (!first.ok) {
    // `first.error` ya es un texto para el socio («Vega está saturada…»); el detalle quedó en los logs.
    await refundCharge(charge.chargeId, "Reembolso: Vega no pudo responder");
    return { ok: false, status: first.error === saturatedMessage ? 503 : 502, error: first.error, conversationId: chatId };
  }
  return {
    ok: true,
    turn: {
      userId: user.id,
      chatId,
      agentId: agent.id,
      scope,
      limits,
      startedJobs: [],
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
      tier,
      degraded,
      costRemainingUsd: cost?.remainingUsd ?? null,
      capUser,
      imageInputs: turnImageInputs(attachments),
    },
  };
}

/** Ejecuta el turno completo (texto, herramientas y acciones) y emite los eventos del chat. */
export async function runVegaTurn(turn: VegaTurn, emit: (event: VegaEvent) => void) {
  const prisma = getPrisma();
  const { userId, chatId, chargeKey, system, tools, contents } = turn;
  const budget = createTurnBudget(turn.limits ?? vegaLimits(), turn.startedAt);
  emit({ t: "credits", v: turn.balance });

  let reply = "";
  let failed = false;
  let saturated = false;
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

  /** Muestra (una vez por app y turno) la tarjeta para conectar o reconectar, y le dice al modelo qué ve el socio. */
  const withConnectCard = async (failure: Record<string, unknown>) => {
    const toolkit = String(failure.reconectar) as UserToolkit;
    const expired = failure.vencida === true;
    const missingScope = failure.permiso_extra === true;
    if (!connectCards.has(toolkit)) {
      connectCards.add(toolkit);
      const reason = missingScope
        ? `${connectDraft(toolkit, "").label} está conectado, pero sin el permiso para esta acción. Vuelve a conectarlo y acepta todos los permisos que ${toolkit.startsWith("google") || toolkit === "gmail" ? "pide Google" : "te pida"}.`
        : expired
          ? "La conexión venció; vuelve a conectarla para seguir."
          : "";
      const draft = connectDraft(toolkit, reason, expired || missingScope);
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
    const label = connectDraft(toolkit, "").label;
    return {
      ...failure,
      nota: missingScope
        ? `A la conexión de ${label} le falta un permiso para esto. El socio ya ve un botón para volver a conectar: explícale en una frase que debe aceptar todos los permisos y que te escriba «listo» para intentarlo de nuevo.`
        : `El socio ya ve un botón para ${expired ? "volver a conectar" : "conectar"} ${label}. Explícale en una frase y pídele que te escriba «listo» cuando termine.`,
    };
  };

  const moodFilter = createMoodFilter();
  const emitText = (clean: string) => {
    if (!clean) return;
    reply += clean;
    emit({ t: "text", v: clean });
  };
  const say = (text: string) => emitText(moodFilter.push(text));
  /** Fin de una respuesta del modelo: suelta lo que el filtro retenía (si no era etiqueta). */
  const endText = () => emitText(moodFilter.end());
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
        models.add(`${current.provider}:${current.usage.model || current.model}`);
      }
      flush();
      endText();
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
        // Briefing antes de crear: sin las respuestas clave del socio no se crea nada ni se cobra.
        // En una rutina el socio ya dejó la instrucción guardada: Vega decide y declara supuestos.
        const gate = briefGate(call.name, call.args ?? {}, turn.source === "routine" || turn.source === "job" ? "tú decide" : turn.userMessage);
        if (!gate.ok) {
          if (gate.response.estado === "needs_brief") emit({ t: "brief", v: gate.request });
          responses.push({ functionResponse: { name: call.name, response: gate.response } });
          continue;
        }
        // Vega v2: trabajo largo → se deja en cola y se responde de inmediato; lo avanzan pasos cortos.
        if (call.name === backgroundJobTool) {
          emit({ t: "status", v: statusLabel(call.name) });
          const started = await startBackgroundJob(prisma, { userId, chatId, agentId: turn.agentId ?? null, args: call.args ?? {} }).catch((error: unknown) => {
            console.error("[Vega job] no se pudo crear", { errorType: error instanceof Error ? error.name : typeof error });
            return { ok: false as const, error: "No se pudo dejar el trabajo en cola." };
          });
          if (started.ok) {
            (turn.startedJobs ??= []).push(started.jobId);
            actionIds.push(started.action.id);
            emit({ t: "action", v: started.action });
            statuses.push(`Trabajo en segundo plano: ${started.title}`);
          }
          responses.push({ functionResponse: { name: call.name, response: started.ok ? started.response : { error: started.error } } });
          continue;
        }
        // Vega v2 · V3: otro agente del socio hace la tarea en su propia conversación.
        if (call.name === delegateTool) {
          emit({ t: "status", v: statusLabel(call.name) });
          const started = turn.agentId
            ? await startDelegation(prisma, { userId, chatId, fromAgentId: turn.agentId, args: call.args ?? {} }).catch((error: unknown) => {
                console.error("[Vega delegate] no se pudo crear", { errorType: error instanceof Error ? error.name : typeof error });
                return { ok: false as const, error: "No se pudo pasar la tarea al otro agente." };
              })
            : { ok: false as const, error: "No se pudo pasar la tarea al otro agente." };
          if (started.ok) {
            (turn.startedJobs ??= []).push(started.jobId);
            actionIds.push(started.action.id);
            emit({ t: "action", v: started.action });
            statuses.push(`Delegado: ${started.title}`);
          }
          responses.push({ functionResponse: { name: call.name, response: started.ok ? started.response : { error: started.error } } });
          continue;
        }
        // PR C: sitios y apps los construye el generador v2; su precio por trabajo ya incluye la herramienta.
        const editCall = call.name === "editar_proyecto";
        // Entrega 4: la edición cobra su propio precio (2 créditos) en startProjectEdit.
        const builderCall = editCall || (call.name === "entregar_proyecto" && builderEnabled() && (call.args?.tipo === "sitio" || call.args?.tipo === "app" || call.args?.tipo === "juego"));
        // Imágenes: cobran su propio precio por imagen en startImageGeneration (se devuelve si falla).
        const imageCall = call.name === imageToolName;
        if (!toolCharged && !freeTools.has(call.name) && !builderCall && !imageCall) {
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
        const outcome = await runVegaTool(userId, call.name, call.args ?? {}, { scope: turn.scope ?? null }).catch((error: unknown) => {
          console.error("[Vega tool] execution failed", {
            tool: call.name,
            errorType: error instanceof Error ? error.name : typeof error,
          });
          return {
            kind: "invalid" as const,
            response: { error: "La herramienta falló. Intenta de otra forma o avisa al socio." },
          };
        });
        if (!freeTools.has(call.name) && !imageCall && outcome.kind !== "invalid") paidToolSucceeded = true;

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
          let action = await prisma.vegaAction.create({
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
          if (outcome.action === "image_generation") {
            const started = await startImageFromDelivery(
              { userId, chatId, actionId: action.id, draft: outcome.payload as ImageGenerationDraft, inputs: turn.imageInputs ?? [] },
              { db: prisma },
            ).catch((error: unknown) => {
              console.error("[Vega imágenes] no se pudo iniciar", { errorType: error instanceof Error ? error.name : typeof error });
              return { ok: false as const, message: "No se pudo preparar la imagen. Intenta de nuevo en unos minutos.", response: { estado: "no_se_pudo", error: "No se pudo preparar la imagen." } };
            });
            action = await prisma.vegaAction.update({
              where: { id: action.id },
              data: started.ok
                ? {
                    status: "running",
                    result: "Creando la imagen…",
                    payload: { ...(outcome.payload as object), image: { generationId: started.image.id, status: started.image.status } } as unknown as Prisma.InputJsonValue,
                  }
                : { status: "done", result: started.message, payload: { ...(outcome.payload as object), imageError: started.message } as unknown as Prisma.InputJsonValue },
              select: { id: true, kind: true, payload: true, status: true, result: true },
            });
            if (started.ok && !started.duplicate) emit({ t: "credits", v: await currentCredits(userId) });
            emit({ t: "action", v: actionView(action) });
            const summary = started.ok ? "Creando la imagen…" : "No se pudo crear la imagen";
            statuses.push(summary);
            emit({ t: "status", v: summary });
            responses.push({ functionResponse: { name: call.name, response: started.response } });
            continue;
          }
          let build: BuildView | null = null;
          let builderNote = "";
          let builtLive = false;
          let editError = "";
          if (outcome.action === "deliver_project" && editCall) {
            const draft = outcome.payload as { title?: string; edit?: { projectId: string; version: number | null; request: string } };
            const started = draft.edit
              ? await startProjectEdit(
                  {
                    user: turn.capUser ?? { id: userId, package: null },
                    conversationId: chatId,
                    actionId: action.id,
                    projectId: draft.edit.projectId,
                    versionNumber: draft.edit.version ?? undefined,
                    request: draft.edit.request,
                  },
                  { db: prisma },
                ).catch((error: unknown) => {
                  console.error("[Editor] no se pudo iniciar", { errorType: error instanceof Error ? error.name : typeof error });
                  return null;
                })
              : null;
            if (started?.ok) {
              build = started.build;
              action = await prisma.vegaAction.update({
                where: { id: action.id },
                data: {
                  status: "running",
                  result: `Aplicando cambios a ${draft.title ?? "tu proyecto"}`,
                  payload: { ...(outcome.payload as object), build: { buildId: build.id, status: build.status } } as unknown as Prisma.InputJsonValue,
                },
                select: { id: true, kind: true, payload: true, status: true, result: true },
              });
              if (!started.duplicate) emit({ t: "credits", v: await currentCredits(userId) });
            } else {
              editError = started?.message ?? "No se pudo iniciar la edición.";
              action = await prisma.vegaAction.update({
                where: { id: action.id },
                data: { status: "done", result: editError, payload: { ...(outcome.payload as object), editError } as unknown as Prisma.InputJsonValue },
                select: { id: true, kind: true, payload: true, status: true, result: true },
              });
            }
          } else if (outcome.action === "deliver_project" && builderCall) {
            const draft = outcome.payload as { kind?: string; title?: string; summary?: string };
            // Apps: datos en vivo. Juegos: ranking en línea (misma columna «live», sin migración).
            builtLive =
              draft.kind === "juego"
                ? wantsLeaderboard(call.args ?? {})
                : draft.kind === "app" && call.args?.datos_en_vivo === true && liveAppsAvailable(turn.capUser ?? null);
            const started = await startProjectBuild(
              {
                user: turn.capUser ?? { id: userId, package: null },
                conversationId: chatId,
                actionId: action.id,
                kind: String(draft.kind ?? ""),
                brief: briefFromDelivery(call.args ?? {}, draft),
                live: builtLive,
              },
              { db: prisma },
            ).catch((error: unknown) => {
              console.error("[Generador] no se pudo iniciar", { errorType: error instanceof Error ? error.name : typeof error });
              return null;
            });
            if (started?.ok) {
              build = started.build;
              action = await prisma.vegaAction.update({
                where: { id: action.id },
                data: {
                  status: "running",
                  result: `Construyendo ${draft.kind === "app" ? "la app" : draft.kind === "juego" ? "el juego" : "el sitio"}: ${draft.title ?? ""}`.trim(),
                  payload: { ...(outcome.payload as object), build: { buildId: build.id, status: build.status } } as unknown as Prisma.InputJsonValue,
                },
                select: { id: true, kind: true, payload: true, status: true, result: true },
              });
              if (!started.duplicate) emit({ t: "credits", v: await currentCredits(userId) });
            } else if (started) builderNote = started.message;
          }
          if (outcome.action === "deliver_project" && !build && !editCall) {
            // v1 (respaldo): sin generador, o si no se pudo iniciar. Se cobra como herramienta normal.
            if (builderCall && !toolCharged) {
              const extra = await chargeCredits(userId, creditPrices.vegaTool - creditPrices.vegaMessage, "Vega · herramienta", `${chargeKey}:tool`);
              if (extra.ok) {
                toolCharged = true;
                toolChargeId = extra.duplicate ? null : extra.chargeId;
                emit({ t: "credits", v: extra.balance });
              }
            }
            // Cada sitio, app o agente entregado queda en Proyectos (nueva versión si ya existía).
            await saveDeliveredProject(prisma, { userId, conversationId: chatId, actionId: action.id, payload: outcome.payload }).catch(
              (error: unknown) => console.error("[Proyectos] no se pudo guardar la entrega", { errorType: error instanceof Error ? error.name : typeof error }),
            );
          }
          emit({ t: "action", v: actionView(action) });
          const summary = editCall
            ? build
              ? "Aplicando los cambios…"
              : "No se pudo editar"
            : build
              ? `Construyendo ${build.kind === "app" ? "tu app" : build.kind === "juego" ? "tu juego" : "tu sitio"} premium…`
              : outcome.summary;
          statuses.push(summary);
          emit({ t: "status", v: summary });
          response = editCall
            ? build
              ? {
                  estado: "editando",
                  nota: `El socio ve una tarjeta con el avance de la edición; tarda uno o dos minutos y queda como versión nueva en Proyectos (la anterior no se toca y se puede restaurar). Se cobraron ${builderPrice("edit")} créditos (se devuelven si falla). Si el sitio está publicado, la versión publicada no cambia hasta que el socio elija la nueva en Publicar. No digas que ya está listo.`,
                }
              : { estado: "no_se_pudo", error: editError }
            : build
            ? {
                estado: "construyendo",
                nota: `El socio ve una tarjeta con el avance del generador premium (plan, ${build.kind === "juego" ? "código del juego, revisión" : "componentes, compilación"}); tarda unos 2 a 4 minutos y al terminar queda en Proyectos con vista previa${build.kind === "juego" ? " jugable" : ""} y ZIP. Se cobraron ${buildCharge(build.kind, builtLive).price} créditos por el trabajo (se devuelven si falla).${build.kind === "juego" && builtLive ? " El ranking en línea funciona cuando publique el juego en LYRA (/s/…)." : ""} No digas que ya está listo ni pegues código: di en una frase qué vas a construir y que puede seguir platicando mientras tanto.`,
              }
            : { estado: "listo", nota: builderNote ? `${outcome.modelNote} Se entregó la versión básica porque: ${builderNote}` : outcome.modelNote };
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
          response =
            typeof proposed.response.reconectar === "string" && isUserToolkit(String(proposed.response.reconectar))
              ? await withConnectCard(proposed.response)
              : proposed.response;
        } else if (typeof (outcome.response as Record<string, unknown>).reconectar === "string" && isUserToolkit(String((outcome.response as Record<string, unknown>).reconectar))) {
          // La app no está conectada, su conexión venció o le falta un permiso: tarjeta para (re)conectar, sin tumbar el turno.
          response = await withConnectCard(outcome.response as Record<string, unknown>);
        } else response = outcome.response;

        if (gate.delegated) response = { ...response, supuestos: "El socio te dejó decidir: dile en una o dos frases qué supusiste y que puede cambiarlo." };
        responses.push({ functionResponse: { name: call.name, response } });
      }
      contents.push({ role: "user", parts: responses });

      // Las herramientas pueden tardar: vuelve a revisar el tiempo antes de llamar al modelo.
      const stillRoom = budget.canCallModel(modelCalls);
      if (!stillRoom.ok) {
        stopReason = stillRoom.reason;
        break;
      }
      // Varios pasos con herramientas: nivel fuerte (salvo que el socio esté cerca de su tope).
      const next = await openVegaStream(system, contents, tools, {
        timeoutMs: budget.modelTimeoutMs(),
        models: turn.models ?? null,
        generation: chatGeneration,
        tier: turn.degraded ? "rapido" : "fuerte",
        label: `turno:${turn.source ?? "chat"}:paso${modelCalls + 1}`,
      });
      modelCalls += 1;
      if (!next.ok) {
        failed = true;
        saturated = next.error === saturatedMessage;
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

  // Nunca guardar nombres internos de herramientas en lo que ve el socio (chat, WhatsApp, Telegram).
  const content = humanizeToolNames(reply.trim()) || (actionIds.length ? "Te dejé la acción lista para que la confirmes." : "");
  const persist = turn.persistReply !== false;
  const allActionIds = [...(turn.extraActionIds ?? []), ...actionIds];
  if (content && persist) {
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
          ...(allActionIds.length ? { actions: allActionIds } : {}),
          ...(statuses.length ? { statuses } : {}),
          ...(turn.jobId ? { job: turn.jobId } : {}),
        },
      },
    });
    if (!reply.trim()) emit({ t: "text", v: content });
  } else if (!content) {
    await refundCharge(turn.chargeId, "Reembolso: Vega no pudo responder");
    emit({ t: "error", v: saturated ? `${saturatedMessage} No se descontó el crédito.` : "Vega no alcanzó a responder. No se descontó el crédito; intenta de nuevo." });
  }
  await prisma.vegaConversation.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
  if (content && persist) scheduleSummary(chatId);
  emit({ t: "credits", v: await currentCredits(userId) });
  if (turn.capUser) {
    const after = await costStatus(turn.capUser).catch(() => null);
    if (after && after.level !== "unlimited") emit({ t: "usage", v: meterView(after) });
  }
  return { content, actionIds, sources, failed, stopReason, usage: turnUsage, toolCharged };
}
