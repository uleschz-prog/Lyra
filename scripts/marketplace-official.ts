// Genera las 6 plantillas oficiales y gratuitas del Marketplace (PR H).
// Sitios y apps salen del motor del generador v2 (plan → generar → validar con esbuild) con un
// modelo determinista y contenido escrito a mano; los agentes usan la forma de agente de Vega.
// Uso: npx tsx scripts/marketplace-official.ts   (escribe src/lib/marketplace/official/*.json)
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildPreviewHtml } from "@/lib/builder/bundle";
import { advanceEngine, initialState, type EngineState } from "@/lib/builder/engine";
import { buildProject } from "@/lib/vega/build-project";
import { banks, fixtureModel } from "../tests/builder/fixtures";

type Bank = Parameters<typeof fixtureModel>[0];

const agenda: Bank = {
  id: "agenda",
  kind: "app",
  title: "Agenda Bruma",
  brief: "App de agenda de citas para Bruma Barbería & Spa: registrar citas con cliente, servicio, fecha, hora y barbero; ver la agenda por día, la lista de clientes y reportes de ingresos por servicio.",
  brand: { name: "Bruma", tagline: "Barbería & Spa · agenda del equipo" },
  summary: "Agenda de citas para barbería o spa: citas por día, clientes e ingresos por servicio.",
  hero: { eyebrow: "", title: "", subtitle: "", cta: "" },
  benefits: [],
  services: [],
  steps: [],
  testimonials: [],
  faq: [],
  stats: [],
  closing: { title: "", subtitle: "", cta: "" },
  entities: [
    {
      key: "citas",
      label: "Citas",
      singular: "Cita",
      icon: "CalendarDays",
      fields: [
        { key: "cliente", label: "Cliente", type: "text", required: true },
        { key: "servicio", label: "Servicio", type: "select", options: ["Corte clásico", "Barba", "Corte + barba", "Facial"] },
        { key: "barbero", label: "Barbero", type: "select", options: ["Emilio", "Nadia", "Rafa"] },
        { key: "fecha", label: "Fecha", type: "date" },
        { key: "hora", label: "Hora", type: "time" },
        { key: "precio", label: "Precio", type: "money" },
      ],
      seed: [
        { cliente: "Andrés Molina", servicio: "Corte + barba", barbero: "Emilio", fecha: "2026-11-16", hora: "10:00", precio: 380 },
        { cliente: "Luis Ortega", servicio: "Corte clásico", barbero: "Rafa", fecha: "2026-11-16", hora: "11:30", precio: 250 },
        { cliente: "Camila Reyes", servicio: "Facial", barbero: "Nadia", fecha: "2026-11-16", hora: "13:00", precio: 450 },
        { cliente: "Héctor Vidal", servicio: "Barba", barbero: "Emilio", fecha: "2026-11-17", hora: "09:30", precio: 180 },
        { cliente: "Pablo Núñez", servicio: "Corte + barba", barbero: "Rafa", fecha: "2026-11-17", hora: "17:00", precio: 380 },
      ],
    },
  ],
  screens: {
    "app-dashboard": { title: "Hoy en Bruma", subtitle: "Citas e ingresos de la semana" },
    "app-agenda": { title: "Agenda", subtitle: "Citas por día y hora" },
    "app-table": { title: "Citas", subtitle: "Busca por cliente o servicio" },
    "app-form": { title: "Nueva cita" },
    "app-chart": { title: "Ingresos por servicio" },
    "app-activity": { title: "Movimientos recientes" },
    "app-settings": { title: "Datos de la barbería" },
  },
};

type Official = {
  slug: string;
  kind: "sitio" | "app" | "agente";
  title: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  generator: string;
  files: { path: string; content: string }[];
  previewHtml: string | null;
  agentConfig: { name: string; specialty: string; instructions: string; avatar: string } | null;
};

async function fromBank(bank: Bank, meta: Pick<Official, "slug" | "description" | "category" | "tags">): Promise<Official> {
  const model = fixtureModel(bank);
  let state: EngineState = initialState();
  for (let round = 0; round < 20 && state.status !== "failed" && state.step !== "save"; round += 1) {
    ({ state } = await advanceEngine(state, { brief: bank.brief, kind: bank.kind, title: bank.title }, { model, now: Date.now }, 60_000));
  }
  if (state.step !== "save" || !state.plan) throw new Error(`${bank.id}: ${state.error}`);
  const preview = await buildPreviewHtml(state.plan, state.files);
  if (!preview.ok || !preview.html) throw new Error(`${bank.id}: la vista previa no compiló`);
  return {
    ...meta,
    kind: bank.kind as "sitio" | "app",
    title: bank.title,
    summary: bank.summary,
    generator: "vega-v2",
    files: Object.keys(state.files)
      .sort()
      .map((path) => ({ path, content: state.files[path] })),
    previewHtml: preview.html,
    agentConfig: null,
  };
}

function agent(input: {
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  avatar: string;
  specialty: string;
  color: string;
  mision: string;
  reglas: string[];
  ejemplos: { persona: string; respuesta: string }[];
  flujo: string[];
  preguntas: { titulo: string; texto: string }[];
}): Official {
  const built = buildProject({
    titulo: input.title,
    tipo: "agente",
    resumen: input.summary,
    color: input.color,
    secciones: [
      { tipo: "portada", titulo: input.title, texto: input.mision, boton: "Probar conversación" },
      { tipo: "agente", nombre: input.title, mision: input.mision, reglas: input.reglas, ejemplos: input.ejemplos },
      { tipo: "pasos", titulo: "Flujo de atención", items: input.flujo.map((texto, index) => ({ titulo: `Paso ${index + 1}`, texto })) },
      { tipo: "preguntas", titulo: "Lo que resuelve", items: input.preguntas },
    ],
    sugerencias: ["Conectar el agente a WhatsApp Business", "Agregar tu catálogo y horarios reales"],
  });
  if (!built.ok) throw new Error(`${input.slug}: ${built.error}`);
  const instructions = [
    `Misión: ${input.mision}`,
    `Reglas:\n${input.reglas.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}`,
    `Flujo:\n${input.flujo.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
  ].join("\n\n");
  return {
    slug: input.slug,
    kind: "agente",
    title: input.title,
    summary: input.summary,
    description: input.description,
    category: input.category,
    tags: input.tags,
    generator: "vega-v1",
    files: built.project.files,
    previewHtml: null,
    agentConfig: { name: input.title.slice(0, 40), specialty: input.specialty.slice(0, 80), instructions: instructions.slice(0, 2000), avatar: input.avatar },
  };
}

async function main() {
  const dental = banks.find((bank) => bank.id === "dental")!;
  const tacos = banks.find((bank) => bank.id === "tacos")!;
  const crm = banks.find((bank) => bank.id === "crm")!;
  const out: Official[] = [
    await fromBank(dental, {
      slug: "oficial-clinica-dental-premium",
      description:
        "Sitio premium para clínica dental: portada con propuesta de valor, tratamientos, proceso de la primera cita, equipo, historia, testimonios, preguntas frecuentes y botón de WhatsApp en todas las páginas. Varias páginas (inicio, servicios, nosotros y contacto) en React + Tailwind. Cambia nombre, tratamientos, equipo y datos de contacto por los tuyos.",
      category: "Salud",
      tags: ["clínica", "dental", "salud", "whatsapp", "citas"],
    }),
    await fromBank(tacos, {
      slug: "oficial-restaurante-taqueria",
      description:
        "Sitio para restaurante, taquería o cafetería: menú con precios por categoría, diferenciadores, servicio para eventos, reseñas, preguntas frecuentes y pedidos por WhatsApp. Multipágina en React + Tailwind, lista para poner tu carta y tu horario.",
      category: "Restaurantes",
      tags: ["restaurante", "menú", "comida", "eventos", "whatsapp"],
    }),
    await fromBank(crm, {
      slug: "oficial-crm-kanban",
      description:
        "App CRM para agencias y equipos de ventas: tablero con el valor del embudo, lista de prospectos con búsqueda y filtro, alta con validación, kanban por etapa para avanzar tratos, gráfica de valor por etapa y actividad reciente. Los datos de ejemplo viven en el navegador; con Vega puedes adaptar campos y etapas.",
      category: "Ventas",
      tags: ["crm", "kanban", "ventas", "prospectos", "embudo"],
    }),
    await fromBank(agenda, {
      slug: "oficial-agenda-citas",
      description:
        "App de agenda para barberías, spas, consultorios o estudios: citas agrupadas por día con alta rápida, lista de citas con búsqueda, formulario con cliente, servicio, profesional, fecha, hora y precio, e ingresos por servicio. Datos de ejemplo locales, listos para cambiar.",
      category: "Servicios",
      tags: ["agenda", "citas", "barbería", "spa", "reservas"],
    }),
    agent({
      slug: "oficial-agente-ventas-whatsapp",
      title: "Agente de ventas por WhatsApp",
      summary: "Califica prospectos que llegan por WhatsApp, responde precios del catálogo y agenda una llamada o visita.",
      description:
        "Agente comercial para WhatsApp: saluda, entiende qué busca el cliente, responde con los precios y paquetes que tú le des, califica al prospecto (necesidad, presupuesto, fecha) y propone el siguiente paso: llamada, visita o pago. Nunca inventa precios ni promete descuentos. Al usarla se crea el agente en Vega y un proyecto con su especificación.",
      category: "Ventas",
      tags: ["whatsapp", "ventas", "prospectos", "agente"],
      avatar: "💬",
      specialty: "Ventas y calificación de prospectos por WhatsApp",
      color: "#047857",
      mision: "Convertir conversaciones de WhatsApp en prospectos calificados y citas de venta, respondiendo rápido y con datos reales del negocio.",
      reglas: [
        "Responde en mensajes cortos (máximo 3 líneas) y termina con una sola pregunta.",
        "Usa solo precios, paquetes y promociones que estén en la información del negocio; si no aparece, di que lo confirmas con el equipo.",
        "Califica con tres datos antes de proponer cita: qué necesita, para cuándo y presupuesto aproximado.",
        "Propón un siguiente paso concreto (llamada, visita o liga de pago) y confirma día y hora.",
        "Si el cliente pide hablar con una persona, se queja o pide factura, pasa la conversación al equipo con un resumen.",
      ],
      ejemplos: [
        { persona: "Hola, ¿cuánto cuesta el paquete de fotos para boda?", respuesta: "¡Hola! Con gusto te ayudo. ¿Para qué fecha es tu boda y en qué ciudad? Así te digo qué paquetes tenemos disponibles." },
        { persona: "Es el 14 de marzo en Pachuca, somos como 120 invitados.", respuesta: "¡Gracias! Para esa fecha tenemos cupo. ¿Tienes un presupuesto aproximado? Te comparto el paquete que mejor encaje." },
        { persona: "¿Me hacen descuento si pago hoy?", respuesta: "No tengo una promoción vigente que pueda confirmarte, pero le pregunto al equipo y te respondo hoy mismo. ¿Te parece si agendamos una llamada de 10 minutos para revisar opciones?" },
      ],
      flujo: [
        "Saluda y pregunta qué busca.",
        "Pide fecha, lugar y presupuesto aproximado.",
        "Responde con la opción del catálogo que encaja, sin inventar precios.",
        "Propón llamada, visita o pago y confirma día y hora.",
        "Resume el caso y avisa al equipo si hace falta una persona.",
      ],
      preguntas: [
        { titulo: "Respuestas en minutos", texto: "Atiende mensajes fuera de horario y deja al prospecto listo para cerrar." },
        { titulo: "Prospectos calificados", texto: "Cada conversación termina con necesidad, fecha y presupuesto." },
        { titulo: "Sin promesas falsas", texto: "Solo usa los precios y políticas que tú le das." },
      ],
    }),
    agent({
      slug: "oficial-agente-soporte-faq",
      title: "Agente de soporte y preguntas frecuentes",
      summary: "Resuelve dudas frecuentes de clientes (horarios, envíos, cambios y pagos) y escala los casos difíciles a una persona.",
      description:
        "Agente de atención al cliente para sitio web o WhatsApp: responde preguntas frecuentes sobre horarios, envíos, cambios, devoluciones y formas de pago usando solo tus políticas; pide el número de pedido cuando hace falta y escala quejas o casos especiales con un resumen. Al usarla se crea el agente en Vega y un proyecto con su especificación.",
      category: "Atención al cliente",
      tags: ["soporte", "faq", "atención", "agente"],
      avatar: "🛟",
      specialty: "Soporte al cliente y preguntas frecuentes",
      color: "#1D4ED8",
      mision: "Resolver en el primer mensaje las dudas frecuentes de los clientes con las políticas del negocio y pasar a una persona lo que no se puede resolver.",
      reglas: [
        "Contesta con la política exacta del negocio; si no existe, dilo y ofrece pasar el caso al equipo.",
        "Para dudas de un pedido, pide primero el número de pedido y el nombre de quien compró.",
        "Nunca prometas reembolsos, fechas de entrega ni excepciones que no estén en las políticas.",
        "Si el cliente está molesto, reconoce el problema en una frase y propone la solución o la escalación.",
        "Escala a una persona: quejas, cobros duplicados, productos dañados o cuando el cliente lo pida.",
      ],
      ejemplos: [
        { persona: "¿A qué hora abren el sábado?", respuesta: "Los sábados abrimos de 10:00 a 14:00. ¿Te ayudo con algo más?" },
        { persona: "Mi pedido no ha llegado y ya pasaron 5 días.", respuesta: "Lamento la espera. ¿Me compartes tu número de pedido y el nombre de quien compró? Reviso el estado y te digo qué sigue." },
        { persona: "Me cobraron dos veces.", respuesta: "Entiendo, eso no debería pasar. Paso tu caso al equipo de pagos con tu número de pedido para que lo revisen hoy. ¿Me lo compartes?" },
      ],
      flujo: [
        "Identifica el tipo de duda (horario, envío, cambio, pago u otra).",
        "Responde con la política del negocio.",
        "Si es sobre un pedido, pide número de pedido y nombre.",
        "Confirma si quedó resuelto.",
        "Si no, escala a una persona con un resumen del caso.",
      ],
      preguntas: [
        { titulo: "Horarios y ubicación", texto: "Respuestas inmediatas a lo que más preguntan." },
        { titulo: "Envíos y cambios", texto: "Explica plazos y políticas tal como las definiste." },
        { titulo: "Escalación con contexto", texto: "El equipo recibe el caso resumido, sin repetir preguntas." },
      ],
    }),
  ];
  const dir = join(process.cwd(), "src/lib/marketplace/official");
  for (const item of out) {
    writeFileSync(join(dir, `${item.slug}.json`), JSON.stringify(item) + "\n");
    const bytes = Buffer.byteLength(JSON.stringify(item));
    console.log(item.slug, item.files.length, "archivos", Math.round(bytes / 1024), "KB");
  }
}

void main();
