// Briefing antes de crear: preguntas clave por tipo de pieza (sitio, app, agente, video, imagen).
// Lo usan la tarjeta del chat (formulario guiado) y el servidor (las herramientas de creación
// no arrancan ni cobran si faltan respuestas). Sin dependencias de servidor: se importa en el cliente.

export type BriefKind = "sitio" | "app" | "agente" | "video" | "imagen";

export type BriefQuestion = {
  key: string;
  /** Etiqueta corta del campo. */
  label: string;
  /** Pregunta tal como la ve el socio. */
  question: string;
  options: string[];
  required: boolean;
  /** Se pueden elegir varias opciones. */
  multi?: boolean;
  placeholder?: string;
};

export const briefKindLabels: Record<BriefKind, string> = {
  sitio: "sitio web",
  app: "app",
  agente: "agente",
  video: "video",
  imagen: "imagen",
};

export const briefQuestions: Record<BriefKind, BriefQuestion[]> = {
  sitio: [
    { key: "negocio", label: "Negocio", question: "¿Cómo se llama tu negocio y qué ofreces?", options: [], required: true, placeholder: "Ej. Sonríe Pachuca, clínica dental familiar" },
    { key: "objetivo", label: "Objetivo", question: "¿Qué debe lograr el sitio (botón principal)?", options: ["Mensajes por WhatsApp", "Agendar citas", "Vender productos", "Mostrar mi portafolio", "Captar prospectos"], required: true },
    { key: "publico", label: "Público", question: "¿A quién va dirigido?", options: ["Familias", "Jóvenes", "Empresas (B2B)", "Clientes locales", "Turistas"], required: true, placeholder: "Ej. papás de Pachuca con niños pequeños" },
    { key: "estilo", label: "Estilo y secciones", question: "¿Qué estilo, referencias o secciones quieres?", options: ["Moderno y minimalista", "Elegante", "Colorido y divertido", "Oscuro e intenso", "Corporativo", "Servicios", "Precios", "Galería", "Preguntas frecuentes"], required: false, multi: true, placeholder: "Pega un sitio de referencia o describe el estilo" },
    { key: "contacto", label: "Contacto e idioma", question: "¿Qué datos de contacto muestro y en qué idioma?", options: ["Español", "Inglés", "Bilingüe", "Aún no tengo datos: deja campos editables"], required: true, multi: true, placeholder: "WhatsApp, teléfono, correo, dirección, horario" },
  ],
  app: [
    { key: "proposito", label: "Propósito", question: "¿Para qué es la app (qué tarea resuelve)?", options: ["Agendar citas", "Tomar pedidos", "Llevar clientes (CRM)", "Inventario", "Punto de venta"], required: true, placeholder: "Ej. registrar pedidos de mi pastelería" },
    { key: "usuarios", label: "Usuarios", question: "¿Quién la va a usar?", options: ["Solo yo", "Mi equipo", "Mis clientes", "Recepción / mostrador"], required: true, multi: true },
    { key: "datos", label: "Datos", question: "¿Qué información debe guardar?", options: ["Clientes", "Citas", "Pedidos", "Productos", "Pagos", "Tareas"], required: true, multi: true, placeholder: "Ej. pedidos con cliente, fecha de entrega, total y estado" },
    { key: "pantallas", label: "Pantallas", question: "¿Qué pantallas necesitas?", options: ["Tablero", "Lista con búsqueda", "Formulario de alta", "Agenda", "Tablero por etapas", "Reportes", "Caja"], required: false, multi: true },
  ],
  agente: [
    { key: "rol", label: "Rol", question: "¿Qué hace el agente y para qué negocio?", options: ["Atención a clientes", "Ventas", "Agendar citas", "Soporte", "Recepción"], required: true, placeholder: "Ej. atiende dudas y agenda citas de mi clínica" },
    { key: "canal", label: "Canal", question: "¿Dónde va a atender?", options: ["WhatsApp", "Sitio web", "Instagram", "Correo"], required: true, multi: true },
    { key: "tono", label: "Tono", question: "¿Con qué tono habla?", options: ["Cálido y cercano", "Profesional", "Divertido", "Breve y directo"], required: true },
    { key: "conocimiento", label: "Conocimiento", question: "¿Qué debe saber? (servicios, precios, horarios, políticas)", options: [], required: true, placeholder: "Pega tus servicios, precios, horarios y reglas" },
    { key: "acciones", label: "Acciones", question: "¿Qué acciones puede hacer?", options: ["Responder dudas", "Agendar citas", "Tomar pedidos", "Capturar datos del cliente", "Pasar a una persona"], required: false, multi: true },
  ],
  video: [
    { key: "tema", label: "Tema", question: "¿De qué trata el video y qué quieres que la gente haga al verlo?", options: [], required: true, placeholder: "Ej. anunciar la promoción de limpieza dental de noviembre" },
    { key: "estilo", label: "Estilo", question: "¿Qué estilo buscas?", options: ["Anuncio dinámico", "Elegante", "Divertido", "Testimonial", "Explicativo"], required: true },
    { key: "formato", label: "Formato", question: "¿Dónde se va a publicar?", options: ["9:16 (Reels / TikTok)", "1:1 (feed)", "16:9 (YouTube / web)"], required: true },
    { key: "duracion", label: "Duración", question: "¿Cuánto debe durar?", options: ["8 segundos", "15 segundos", "30 segundos"], required: false },
    { key: "voz", label: "Voz", question: "¿Lleva voz?", options: ["Voz femenina", "Voz masculina", "Sin voz, solo texto y música"], required: false },
  ],
  imagen: [
    { key: "tema", label: "Tema", question: "¿Qué debe mostrar la imagen? (y para qué negocio)", options: [], required: true, placeholder: "Ej. logo para Sonríe Pachuca, clínica dental" },
    { key: "estilo", label: "Estilo", question: "¿Qué estilo prefieres?", options: ["Minimalista", "Fotográfico", "Ilustración", "Elegante", "Colorido"], required: true },
    { key: "formato", label: "Formato", question: "¿Qué formato?", options: ["Cuadrada", "Horizontal", "Vertical"], required: true },
    { key: "detalles", label: "Detalles", question: "¿Colores, texto o algo que no deba llevar?", options: [], required: false, placeholder: "Ej. azul y blanco, con el nombre del negocio" },
  ],
};

const delegation = /\b(t[uú] decide[s]?|decide t[uú]|elige t[uú]|t[uú] elige[s]?|a tu criterio|como t[uú] quieras|como quieras|lo que quieras|con lo que quieras|lo que t[uú] quieras|sorpr[eé]ndeme|haz lo que creas|lo que creas mejor|improvisa|inv[eé]ntalo)\b/i;

/** El socio dejó explícitamente las decisiones a Vega («tú decide», «hazlo con lo que quieras»). */
export function isDelegation(text: string | null | undefined) {
  return Boolean(text && delegation.test(text));
}

const filler = /^(n\/?a|na|ninguno|ninguna|no s[eé]|por definir|pendiente|tbd|x+|-+|\.+|\?+|default|predeterminado|generico|genérico|ejemplo)$/i;

/** Una respuesta cuenta si tiene contenido real (no vacía ni de relleno). */
export function answered(value: unknown) {
  if (Array.isArray(value)) return value.some(answered);
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text.length >= 2 && !filler.test(text);
}

/** Tipo de briefing de una herramienta de creación (o null si no es de creación). */
export function briefKindForTool(name: string, args: Record<string, unknown>): BriefKind | null {
  if (name === "crear_imagen") return "imagen";
  if (name === "crear_video") return "video";
  if (name === "entregar_proyecto") {
    const tipo = args.tipo;
    return tipo === "sitio" || tipo === "app" || tipo === "agente" ? tipo : null;
  }
  return null;
}

export function missingBrief(kind: BriefKind, briefing: unknown): BriefQuestion[] {
  const answers = briefing && typeof briefing === "object" && !Array.isArray(briefing) ? (briefing as Record<string, unknown>) : {};
  return briefQuestions[kind].filter((question) => question.required && !answered(answers[question.key]));
}

export type BriefRequest = { kind: BriefKind; missing: string[] };

export type BriefGate =
  | { ok: true; delegated: boolean }
  | { ok: false; request: BriefRequest; response: Record<string, unknown> };

/**
 * Regla del servidor: una herramienta de creación solo corre si el briefing trae las respuestas
 * obligatorias, o si el socio dijo explícitamente que Vega decida (en ese caso hay que declarar supuestos).
 */
export function briefGate(name: string, args: Record<string, unknown>, userMessage: string | null | undefined): BriefGate {
  const kind = briefKindForTool(name, args);
  if (!kind) return { ok: true, delegated: false };
  const missing = missingBrief(kind, args.briefing);
  if (missing.length === 0) return { ok: true, delegated: false };
  if (isDelegation(userMessage)) {
    if (answered(args.supuestos)) return { ok: true, delegated: true };
    return {
      ok: false,
      request: { kind, missing: missing.map((question) => question.key) },
      response: {
        estado: "faltan_supuestos",
        error: "El socio te dejó decidir. Vuelve a llamar la herramienta con «supuestos»: una lista corta de lo que elegiste por él (en español) y díselas en tu respuesta.",
      },
    };
  }
  return {
    ok: false,
    request: { kind, missing: missing.map((question) => question.key) },
    response: {
      estado: "needs_brief",
      tipo: kind,
      faltan: missing.map((question) => ({ campo: question.key, pregunta: question.question, opciones: question.options.slice(0, 5) })),
      instruccion:
        "No se creó nada ni se cobró. El socio ve un formulario con estas preguntas. Pregúntale en una frase lo que falta (máximo estas preguntas, con opciones sugeridas) y espera su respuesta. Si dice «tú decide», puedes elegir tú y declarar los supuestos.",
    },
  };
}

/** Texto que manda la tarjeta del chat con las respuestas del socio. */
export function composeBriefPrompt(kind: BriefKind, answers: Record<string, string>, options: { delegate?: boolean } = {}) {
  const lines = briefQuestions[kind]
    .filter((question) => answered(answers[question.key]))
    .map((question) => `- ${question.label}: ${answers[question.key].trim()}`);
  const head = `Quiero crear ${kind === "imagen" ? "una imagen" : kind === "app" ? "una app" : `un ${briefKindLabels[kind]}`}.`;
  const body = lines.length ? `\n${lines.join("\n")}` : "";
  const tail = options.delegate
    ? "\nLo que falte, tú decide con criterio y dime qué supusiste."
    : "\nUsa solo estos datos; si falta algo esencial, pregúntame antes de crear.";
  return `${head}${body}${tail}`;
}

/** Propiedades del parámetro `briefing` para la declaración de cada herramienta. */
export function briefingSchema(kinds: BriefKind[]) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const kind of kinds) {
    for (const question of briefQuestions[kind]) {
      const prev = properties[question.key];
      const text = `${kind}: ${question.question}${question.required ? " (obligatorio)" : ""}`;
      properties[question.key] = { type: "string", description: prev ? `${prev.description} · ${text}` : text };
    }
  }
  return {
    type: "object",
    description:
      "Respuestas del socio a las preguntas clave, con SUS palabras. Nunca las inventes: si faltan, la herramienta responde needs_brief y debes preguntar.",
    properties,
  };
}
