import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ list: [] as { tool: string; args: Record<string, unknown> }[], handler: null as null | ((tool: string, args: Record<string, unknown>) => unknown) }));
vi.mock("@/lib/ai/composio-user", async (original) => {
  const actual = await original<typeof import("@/lib/ai/composio-user")>();
  return {
    ...actual,
    runUserTool: vi.fn(async (_userId: string, _toolkit: string, tool: string, args: Record<string, unknown>) => {
      calls.list.push({ tool, args });
      return calls.handler ? calls.handler(tool, args) : { ok: true, data: {} };
    }),
  };
});

const gmail = await import("@/lib/vega/gmail-tools");
const { classifyAction, isClassified } = await import("@/lib/vega/policy");
const { vegaTools } = await import("@/lib/vega/tools");
const { noConnections } = await import("@/lib/vega/apps");
const { looksLikeMissingScope, looksLikeExpiredAuth, newestFirst, toolFailure } = await import("@/lib/ai/composio-user");

const labels = [
  { id: "Label_1", name: "Clientes" },
  { id: "Label_2", name: "Facturación/2026" },
];

beforeEach(() => {
  calls.list = [];
  calls.handler = null;
});

describe("etiquetas y acciones de Gmail", () => {
  it("resuelve etiquetas del sistema en español, personalizadas (sin acentos) e ids", () => {
    expect(gmail.resolveLabel("Recibidos", labels)?.id).toBe("INBOX");
    expect(gmail.resolveLabel("Promociones", labels)?.id).toBe("CATEGORY_PROMOTIONS");
    expect(gmail.resolveLabel("no leídos", labels)?.id).toBe("UNREAD");
    expect(gmail.resolveLabel("clientes", labels)?.id).toBe("Label_1");
    expect(gmail.resolveLabel("facturacion/2026", labels)?.id).toBe("Label_2");
    expect(gmail.resolveLabel("Label_2", labels)?.id).toBe("Label_2");
    expect(gmail.resolveLabel("STARRED", labels)?.id).toBe("STARRED");
    expect(gmail.resolveLabel("Proveedores", labels)).toBeNull();
  });

  it.each([
    ["papelera", undefined, undefined, { mode: "trash", add: [], remove: [] }],
    ["eliminar_definitivo", undefined, undefined, { mode: "delete", add: [], remove: [] }],
    ["restaurar", undefined, undefined, { mode: "untrash", add: [], remove: [] }],
    ["archivar", undefined, undefined, { mode: "modify", add: [], remove: ["INBOX"] }],
    ["mover_a_recibidos", undefined, undefined, { mode: "modify", add: ["INBOX"], remove: [] }],
    ["leido", undefined, undefined, { mode: "modify", add: [], remove: ["UNREAD"] }],
    ["no_leido", undefined, undefined, { mode: "modify", add: ["UNREAD"], remove: [] }],
    ["destacar", undefined, undefined, { mode: "modify", add: ["STARRED"], remove: [] }],
    ["quitar_destacado", undefined, undefined, { mode: "modify", add: [], remove: ["STARRED"] }],
    ["importante", undefined, undefined, { mode: "modify", add: ["IMPORTANT"], remove: [] }],
    ["etiquetar", "Label_1", undefined, { mode: "modify", add: ["Label_1"], remove: [] }],
    ["quitar_etiqueta", "Label_1", undefined, { mode: "modify", add: [], remove: ["Label_1"] }],
    ["mover", "Label_1", undefined, { mode: "modify", add: ["Label_1"], remove: ["INBOX"] }],
    ["mover", "Label_2", "Label_1", { mode: "modify", add: ["Label_2"], remove: ["Label_1"] }],
    ["spam", undefined, undefined, { mode: "modify", add: ["SPAM"], remove: ["INBOX"] }],
    ["no_spam", undefined, undefined, { mode: "modify", add: ["INBOX"], remove: ["SPAM"] }],
  ] as const)("%s → %j", (action, label, from, plan) => {
    expect(gmail.gmailPlan(action, label, from)).toEqual(plan);
  });

  it("borrar siempre se confirma; organizar respeta la autonomía", () => {
    const draft = (mode: string, ids: string[]) => ({ op: "gmail_organize", data: { mode, ids } });
    expect(classifyAction("app_action", draft("delete", ["a1b2c3d4e5f6a7b8"]))).toBe("send");
    expect(classifyAction("app_action", draft("trash", ["a1b2c3d4e5f6a7b8"]))).toBe("send");
    expect(classifyAction("app_action", draft("trash", ["a1b2c3d4e5f6a7b8", "a1b2c3d4e5f6a7b9"]))).toBe("send");
    expect(classifyAction("app_action", draft("modify", ["a1b2c3d4e5f6a7b8"]))).toBe("write");
    expect(classifyAction("app_action", draft("untrash", ["a1b2c3d4e5f6a7b8"]))).toBe("write");
    expect(classifyAction("app_action", { op: "gmail_organize" })).toBe("write");
  });

  it("solo acepta ids de Gmail válidos y sin repetir", () => {
    expect(gmail.cleanIds(["18c5f5d1a2b3c4d5", "18c5f5d1a2b3c4d5", "093ca466-2b21-4d5e", "hola", 5])).toEqual(["18c5f5d1a2b3c4d5"]);
  });

  it("las herramientas aparecen solo con Gmail conectado y tienen clase", () => {
    const withGmail = vegaTools({ ...noConnections, gmail: true }, false).map((tool) => tool.name);
    expect(withGmail).toEqual(expect.arrayContaining(["leer_correos", "preparar_correo", "organizar_correos", "ver_etiquetas_gmail"]));
    expect(vegaTools(noConnections, false).map((tool) => tool.name)).not.toContain("organizar_correos");
    expect(isClassified("organizar_correos")).toBe(true);
    expect(isClassified("ver_etiquetas_gmail")).toBe(true);
  });
});

describe("preparar organizar_correos", () => {
  it("con búsqueda: toma los ids exactos, muestra asuntos y avisa de la papelera", async () => {
    calls.handler = (tool, args) =>
      tool === "GMAIL_FETCH_EMAILS"
        ? args.ids_only
          ? { ok: true, data: { messages: [{ messageId: "18c5f5d1a2b3c4d5" }, { messageId: "18c5f5d1a2b3c4d6" }] } }
          : { ok: true, data: { messages: [{ messageId: "18c5f5d1a2b3c4d5", subject: "Oferta", sender: "promos@tienda.com" }] } }
        : { ok: true, data: {} };
    const out = await gmail.runGmailTool("u1", "organizar_correos", { accion: "papelera", busqueda: "from:promos@tienda.com", cantidad_max: 100 });
    expect(out.kind).toBe("app");
    if (out.kind !== "app") return;
    expect(out.payload.op).toBe("gmail_organize");
    expect(out.payload.data).toMatchObject({ action: "papelera", mode: "trash", ids: ["18c5f5d1a2b3c4d5", "18c5f5d1a2b3c4d6"], query: "from:promos@tienda.com" });
    expect(out.payload.lines.map((line) => line.value).join(" | ")).toMatch(/2 correos.*Oferta · promos@tienda.com.*30 días/);
    expect(calls.list[0]).toMatchObject({ tool: "GMAIL_FETCH_EMAILS", args: { ids_only: true, max_results: 100 } });
    expect(classifyAction("app_action", out.payload)).toBe("send");
  });

  it("una etiqueta que no existe: lista las que hay o la crea si se pidió", async () => {
    calls.handler = (tool) => (tool === "GMAIL_LIST_LABELS" ? { ok: true, data: { labels } } : { ok: true, data: {} });
    const missing = await gmail.runGmailTool("u1", "organizar_correos", { accion: "mover", ids: ["18c5f5d1a2b3c4d5"], etiqueta: "Proveedores" });
    expect(missing.kind).toBe("invalid");
    if (missing.kind === "invalid") expect(missing.response.etiquetas).toEqual(["Clientes", "Facturación/2026"]);

    const created = await gmail.runGmailTool("u1", "organizar_correos", { accion: "mover", ids: ["18c5f5d1a2b3c4d5"], etiqueta: "Proveedores", crear_etiqueta: true });
    expect(created.kind).toBe("app");
    if (created.kind === "app") {
      expect(created.payload.data).toMatchObject({ createLabel: "Proveedores", add: [], remove: [] });
      expect(classifyAction("app_action", created.payload)).toBe("write");
    }
  });

  it("sin correos elegidos pide ids o búsqueda", async () => {
    const out = await gmail.runGmailTool("u1", "organizar_correos", { accion: "archivar" });
    expect(out.kind).toBe("invalid");
  });

  it("un permiso faltante al leer pide reconectar Gmail", async () => {
    calls.handler = () => ({ ok: false, error: "Gmail está conectado, pero sin el permiso", reconnect: "gmail", scope: true });
    const out = await gmail.runGmailTool("u1", "organizar_correos", { accion: "papelera", busqueda: "older_than:1y" });
    expect(out).toMatchObject({ kind: "invalid", response: { reconectar: "gmail", permiso_extra: true } });
  });
});

describe("ejecutar organizar_correos", () => {
  const ids = ["18c5f5d1a2b3c4d5", "18c5f5d1a2b3c4d6"];

  it("eliminar para siempre: uno con DELETE_MESSAGE, varios con BATCH_DELETE", async () => {
    expect((await gmail.executeGmailOrganize("u1", { action: "eliminar_definitivo", mode: "delete", ids: ids.slice(0, 1) })).ok).toBe(true);
    expect(calls.list.at(-1)).toMatchObject({ tool: "GMAIL_DELETE_MESSAGE", args: { message_id: ids[0] } });
    const many = await gmail.executeGmailOrganize("u1", { action: "eliminar_definitivo", mode: "delete", ids });
    expect(many).toEqual({ ok: true, message: "Listo, eliminé para siempre 2 correos." });
    expect(calls.list.at(-1)).toMatchObject({ tool: "GMAIL_BATCH_DELETE_MESSAGES", args: { messageIds: ids } });
  });

  it("papelera y restaurar: uno por uno con las herramientas de Gmail", async () => {
    const trashed = await gmail.executeGmailOrganize("u1", { action: "papelera", mode: "trash", ids });
    expect(trashed.message).toMatch(/moví a la papelera 2 correos/);
    expect(calls.list.map((call) => call.tool)).toEqual(["GMAIL_MOVE_TO_TRASH", "GMAIL_MOVE_TO_TRASH"]);
    calls.list = [];
    await gmail.executeGmailOrganize("u1", { action: "restaurar", mode: "untrash", ids });
    expect(calls.list.map((call) => call.tool)).toEqual(["GMAIL_UNTRASH_MESSAGE", "GMAIL_UNTRASH_MESSAGE"]);
  });

  it("archivar, leído, etiquetas y mover: BATCH_MODIFY con las etiquetas exactas", async () => {
    const done = await gmail.executeGmailOrganize("u1", { action: "mover", mode: "modify", ids, add: ["Label_1"], remove: ["INBOX"], labelName: "Clientes" });
    expect(done).toEqual({ ok: true, message: "Listo, moví 2 correos a «Clientes»." });
    expect(calls.list.at(-1)).toEqual({ tool: "GMAIL_BATCH_MODIFY_MESSAGES", args: { userId: "me", messageIds: ids, addLabelIds: ["Label_1"], removeLabelIds: ["INBOX"] } });
    await gmail.executeGmailOrganize("u1", { action: "leido", mode: "modify", ids, add: [], remove: ["UNREAD"] });
    expect(calls.list.at(-1)?.args).toEqual({ userId: "me", messageIds: ids, removeLabelIds: ["UNREAD"] });
  });

  it("crea la etiqueta nueva antes de mover", async () => {
    calls.handler = (tool) => (tool === "GMAIL_CREATE_LABEL" ? { ok: true, data: { id: "Label_9", name: "Proveedores" } } : { ok: true, data: {} });
    const done = await gmail.executeGmailOrganize("u1", { action: "mover", mode: "modify", ids, add: [], remove: [], createLabel: "Proveedores", labelName: "Proveedores" });
    expect(done.ok).toBe(true);
    expect(calls.list.map((call) => call.tool)).toEqual(["GMAIL_CREATE_LABEL", "GMAIL_BATCH_MODIFY_MESSAGES"]);
    expect(calls.list.at(-1)?.args).toMatchObject({ addLabelIds: ["Label_9"] });
  });

  it("si Gmail dice que falta el permiso, regresa reconnect para la tarjeta", async () => {
    calls.handler = () => ({ ok: false, error: "sin permiso", reconnect: "gmail", scope: true });
    const done = await gmail.executeGmailOrganize("u1", { action: "papelera", mode: "trash", ids });
    expect(done).toMatchObject({ ok: false, reconnect: "gmail" });
  });
});

describe("permisos de la conexión", () => {
  it("reconoce errores de permiso de Google sin confundirlos con una conexión vencida", () => {
    expect(looksLikeMissingScope(403, "Request had insufficient authentication scopes.")).toBe(true);
    expect(looksLikeMissingScope(403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT")).toBe(true);
    expect(looksLikeMissingScope(400, "Metadata scope does not support 'q' parameter")).toBe(true);
    expect(looksLikeMissingScope(400, "Invalid id value")).toBe(false);
    expect(looksLikeMissingScope(404, "Requested entity was not found.")).toBe(false);
    expect(looksLikeExpiredAuth(403, "Request had insufficient authentication scopes.")).toBe(false);
    expect(toolFailure({ error: "x", reconnect: "gmail", scope: true })).toEqual({ error: "x", reconectar: "gmail", permiso_extra: true });
  });

  it("al reconectar usa la cuenta activa más reciente", () => {
    const sorted = newestFirst([
      { id: "old", created_at: "2026-01-01T00:00:00Z" },
      { id: "new", created_at: "2026-11-21T00:00:00Z" },
      { id: "sin-fecha" },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["new", "old", "sin-fecha"]);
  });
});
