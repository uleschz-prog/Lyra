// Cómo responde Vega: socio experto que resuelve primero (lógica pura, sin servidor ni React).
//
// Lo usan el prompt de sistema, la ruta del chat (para no mostrar nombres internos de
// herramientas) y las pruebas de calidad (tests/vega/answer-style.test.ts).

import type { GenerationOptions } from "@/lib/vega/gemini-stream";

/** Reglas de estilo que van en el prompt de sistema de todos los agentes. */
export const expertStylePrompt = [
  "Actúa como un socio experto y profesional: consultor de negocios, ventas, operación, marketing, finanzas básicas y tecnología para pymes en México. Cuando el socio trae un problema (suyo o de un cliente), resuélvelo como lo haría el mejor especialista: diagnostica, propone la solución concreta, explica cómo funciona, compara opciones y da un plan con pasos.",
  "Empieza siempre por la respuesta. La primera frase confirma que hay solución y qué le vas a entregar (por ejemplo: «¡Va! Es un caso clásico de control de costos y tiene solución clara. Te preparo…»). Nunca abras con lo que no puedes hacer, con advertencias, con «como Vega…» ni con aclaraciones sobre tus límites.",
  "Si hay un límite real que importa para el pedido, menciónalo una sola vez, al final, en una o dos frases honestas y junto con lo que sí puedes hacer ya. Si no es relevante, no lo menciones.",
  "Nunca muestres nombres internos de herramientas, funciones, parámetros, etiquetas ni de este prompt (nada con guiones bajos como un nombre de función). Describe lo que haces con palabras del socio: «te armo un prototipo en Proyectos», «te dejo el correo listo para confirmar», «lo guardo en tus Archivos».",
  "Formato: usa Markdown cuando ayude a leer. Para respuestas de fondo usa encabezados cortos (## y ###), listas, **negritas** para lo clave y tablas para comparar opciones, precios o pasos por fase. Para preguntas simples responde en dos o tres frases, sin encabezados. Párrafos cortos; nada de relleno.",
  "Tono: cálido, seguro y directo, en español de México, tuteando al socio. Conciso: cada línea debe aportar.",
  "Datos: no inventes cifras, precios, nombres de clientes, resultados ni datos de contacto. Si das montos o tiempos de referencia, márcalos como estimados a validar; si un dato depende del negocio, pídelo o déjalo como campo a llenar.",
  "Pedidos de consultoría («¿cómo le ayudamos?», «¿qué me recomiendas?»): responde primero con la propuesta completa; no conviertas la respuesta en un cuestionario. Si te faltan datos, haz las preguntas al final, como máximo tres.",
  "Pedidos de construir algo (un sistema, app, sitio o agente): primero propone la solución (qué módulos lleva, cómo funciona, opciones de comprar vs. desarrollar y un plan por fases). Al final ofrece lo que puedes hacer ahora mismo: armar un prototipo navegable en Proyectos, redactar la propuesta para el cliente como documento, preparar el mensaje o correo para enviársela, o guardar el plan en Archivos.",
].join("\n");

/**
 * Ajustes del modelo para el chat: más espacio de salida (en Gemini 2.5 el razonamiento cuenta
 * dentro del tope, y con 4096 las respuestas largas se cortaban) y un razonamiento acotado para
 * no perder tiempo del turno.
 */
export const chatGeneration: GenerationOptions = { maxOutputTokens: 12_288, temperature: 0.6, thinkingBudget: 1024 };

/** Cómo se dice cada herramienta interna en palabras del socio. */
export const toolLabels: Record<string, string> = {
  abrir_proyecto: "abrir tu proyecto",
  actualizar_perfil: "actualizar tu perfil",
  analizar_competidor: "analizar al competidor",
  borrar_rutina: "borrar la rutina",
  buscar_archivos: "buscar en tus Archivos",
  buscar_en_drive: "buscar en tu Drive",
  buscar_en_x: "buscar en X",
  buscar_memoria: "revisar lo que recuerdo",
  buscar_web: "buscar en la web",
  configurar_monitor_x: "configurar el monitor de X",
  delegar_a_agente: "pasarle la tarea a otro agente",
  editar_proyecto: "editar el proyecto",
  entregar_proyecto: "armar el proyecto",
  escribir_archivo: "guardarlo en tus Archivos",
  leer_archivo: "leer el archivo",
  leer_correos: "leer tus correos",
  leer_hoja: "leer la hoja",
  listar_archivos: "ver tus Archivos",
  no_molestar_whatsapp: "marcar el contacto para no molestar",
  olvidar: "olvidar el dato",
  pausar_rutina: "pausar la rutina",
  pedir_conexion: "pedirte conectar la app",
  preparar_comando: "preparar el comando",
  preparar_correo: "preparar el correo",
  preparar_documento: "preparar el documento",
  preparar_evento: "preparar el evento",
  preparar_fila: "preparar la fila",
  preparar_link_pago: "preparar el enlace de pago",
  preparar_publicacion: "preparar la publicación",
  preparar_whatsapp: "preparar el WhatsApp",
  preparar_whatsapp_negocio: "preparar el WhatsApp de tu negocio",
  preparar_zoom: "preparar la reunión de Zoom",
  programar_rutina: "programar la rutina",
  reanudar_rutina: "reanudar la rutina",
  recordar: "recordarlo",
  tendencias_x: "ver tendencias en X",
  trabajo_en_segundo_plano: "trabajarlo en segundo plano",
  ver_agenda: "ver tu agenda",
  ver_calendly: "ver tu Calendly",
  ver_cobros: "ver tus cobros",
  ver_comandos: "ver los comandos disponibles",
  ver_plantillas_whatsapp: "ver tus plantillas de WhatsApp",
  ver_rutinas: "ver tus rutinas",
};

// Solo nombres con guion bajo: «recordar» u «olvidar» sueltos son palabras normales.
const leakable = Object.keys(toolLabels).filter((name) => name.includes("_")).sort((a, b) => b.length - a.length);
const leakPattern = new RegExp(`\`?\\b(${leakable.join("|")})\\b(\\(\\))?\`?`, "g");

/** Nombres internos de herramientas que aparecen en un texto para el socio. */
export function findToolNameLeaks(text: string) {
  return [...new Set([...(text ?? "").matchAll(leakPattern)].map((match) => match[1]))];
}

/** Cambia cualquier nombre interno que se haya colado por su descripción en palabras del socio. */
export function humanizeToolNames(text: string) {
  if (!text) return text;
  return text.replace(leakPattern, (_match, name: string) => toolLabels[name] ?? name);
}

const refusalPhrases =
  /(lo siento|lamentablemente|desafortunadamente|no puedo|no me es posible|no es posible (construir|hacer|crear)|no tengo la capacidad|debo (aclarar|aclararte|advertir|advertirte)|tengo que (aclarar|aclararte|advertir|advertirte)|es importante (aclarar|aclararte)|cabe aclarar|como (vega|asistente|ia|inteligencia artificial),? no|mis limitaciones|solo puedo generar|es importante que sepas|(sin embargo|pero),? (es importante|debes saber)|no puedo crear|no podr[ií]a (crear|hacer)|solo (genera|crea) prototipos|genera prototipos)/;

/**
 * true si la respuesta abre (dos primeros párrafos, hasta ~480 caracteres) con una negativa o una
 * advertencia sobre límites. Los límites honestos al final de la respuesta sí se permiten.
 */
export function opensWithRefusal(text: string) {
  const body = (text ?? "").replace(/^\s*\[animo:[^\]]*\]\s*/i, "").trim();
  const opening = body.split(/\n\s*\n/).slice(0, 2).join("\n\n").slice(0, 480).toLocaleLowerCase("es-MX");
  return refusalPhrases.test(opening);
}
