import type { ChannelId, DemoAgent } from "@/lib/types";

export const masterPrompt = `Eres Vega, el nodo maestro de la constelación LYRA.
Orquestas agentes autónomos para academias, clínicas y redes. Cada agente hereda estas leyes y las adapta a su estrella:

1. Habla en español claro, sobrio y útil. Una idea por frase.
2. Adapta el formato al canal: WhatsApp en burbujas cortas, correo con asunto, Telegram en pasos, Instagram cercano, Facebook comunitario, LinkedIn profesional, Messenger conversacional, SMS en una línea, sitio como widget y calendario como una cita concreta.
3. Nunca prometas ingresos ni resultados médicos. Ofrece el siguiente paso.
4. Si el canal no tiene un destino vinculado, entrega el borrador y di qué falta para enviarlo.
5. Cierra con una sola acción. Firma con la estrella del agente.`;

export type ConstellationSection =
  | "observatory"
  | "genealogy"
  | "compensation"
  | "academy"
  | "agents"
  | "notebook"
  | "creative"
  | "wallet";

export const sectionDesks: Record<
  ConstellationSection,
  { star: string; squad: string; line: string }
> = {
  observatory: {
    star: "Vega",
    squad: "Observatorio",
    line: "Pulso de la red, créditos y agentes que orbitan tu línea.",
  },
  genealogy: {
    star: "Sheliak",
    squad: "Genealogía",
    line: "Cada nodo es una estrella con patrocinador y rango.",
  },
  compensation: {
    star: "Sulafat",
    squad: "Planes",
    line: "Started $99, Pro $499 y Founder $1,000. Un crédito equivale a $1.",
  },
  academy: {
    star: "Epsilon",
    squad: "Academia",
    line: "Lecciones por rango. Lo que aún no brilla permanece visible y cerrado.",
  },
  agents: {
    star: "Vega",
    squad: "Estudio de agentes",
    line: "Prompt maestro, plantillas y canales listos para despachar.",
  },
  notebook: {
    star: "Aladfar",
    squad: "Investigación",
    line: "Fuentes propias, preguntas y síntesis en el mismo cuaderno.",
  },
  creative: {
    star: "Delta",
    squad: "Estudio creativo",
    line: "Video con imagen, sonido y señales de mercado.",
  },
  wallet: {
    star: "Zeta",
    squad: "Billetera",
    line: "Dólares de comisión y créditos que alimentan la constelación.",
  },
};

export const channels: {
  id: ChannelId;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  { id: "whatsapp", label: "WhatsApp", hint: "Conversaciones y citas", placeholder: "+52 55 0000 0000" },
  { id: "email", label: "Correo", hint: "Asunto y seguimiento", placeholder: "hola@tu-marca.com" },
  { id: "telegram", label: "Telegram", hint: "Comunidad y avisos", placeholder: "@tu_canal" },
  { id: "instagram", label: "Instagram", hint: "DM e historias", placeholder: "@tu_marca" },
  { id: "facebook", label: "Facebook", hint: "Página y comentarios", placeholder: "facebook.com/tu-pagina" },
  { id: "linkedin", label: "LinkedIn", hint: "Notas profesionales", placeholder: "linkedin.com/in/tu-perfil" },
  { id: "messenger", label: "Messenger", hint: "Chat de página", placeholder: "Página de Messenger" },
  { id: "sms", label: "SMS", hint: "Recordatorios breves", placeholder: "+52 55 0000 0000" },
  { id: "web", label: "Sitio web", hint: "Widget de la constelación", placeholder: "lyrahub.ai" },
  { id: "calendar", label: "Calendario", hint: "Citas confirmadas", placeholder: "agenda@tu-marca.com" },
];

export const constellationAgents: DemoAgent[] = [
  {
    id: "recepcion",
    name: "Recepción",
    star: "Vega",
    description: "Responde dudas y aparta citas como la recepción de una clínica.",
    category: "Citas",
    promptTemplate: "Atiende como recepción. Confirma disponibilidad, propone una hora y pide el nombre.",
    creditCost: 10,
    uses: 240,
    channels: ["whatsapp", "web", "calendar", "messenger"],
  },
  {
    id: "prospector",
    name: "Prospector",
    star: "Sheliak",
    description: "Abre la primera conversación con un contacto que todavía no conoce la red.",
    category: "Prospección",
    promptTemplate: "Perfila al contacto, escribe un gancho de dos líneas y deja el siguiente paso.",
    creditCost: 12,
    uses: 186,
    channels: ["whatsapp", "linkedin", "instagram", "email"],
  },
  {
    id: "copywriter",
    name: "Copywriter",
    star: "Sulafat",
    description: "Redacta la pieza corta para la red donde vas a publicarla.",
    category: "Contenido",
    promptTemplate: "Escribe gancho, cuerpo y llamado sin promesas de ingreso.",
    creditCost: 8,
    uses: 142,
    channels: ["instagram", "facebook", "linkedin", "email"],
  },
  {
    id: "closer",
    name: "Closer",
    star: "Delta",
    description: "Ordena el seguimiento cuando la conversación ya mostró interés.",
    category: "Ventas",
    promptTemplate: "Resume la duda, responde con sobriedad y cierra con una pregunta de avance.",
    creditCost: 15,
    uses: 97,
    channels: ["whatsapp", "email", "calendar", "linkedin"],
  },
  {
    id: "mentor",
    name: "Mentor",
    star: "Epsilon",
    description: "Convierte una lección de la academia en un plan de siete días.",
    category: "Academia",
    promptTemplate: "Transforma el tema en una práctica diaria durante siete días.",
    creditCost: 6,
    uses: 121,
    channels: ["email", "web", "telegram"],
  },
  {
    id: "comunidad",
    name: "Comunidad",
    star: "Zeta",
    description: "Mantiene vivo el grupo: avisos, bienvenidas y preguntas frecuentes.",
    category: "Comunidad",
    promptTemplate: "Escribe un mensaje de comunidad, claro y sin presión.",
    creditCost: 7,
    uses: 88,
    channels: ["telegram", "facebook", "instagram", "messenger"],
  },
  {
    id: "embajador",
    name: "Embajador",
    star: "Kappa",
    description: "Presenta LYRA a un perfil profesional y propone una conversación breve.",
    category: "Alianzas",
    promptTemplate: "Redacta una nota profesional con contexto, valor y una sola invitación.",
    creditCost: 11,
    uses: 64,
    channels: ["linkedin", "email", "calendar"],
  },
  {
    id: "soporte",
    name: "Soporte",
    star: "Aladfar",
    description: "Resuelve una duda de acceso, créditos o navegación del backoffice.",
    category: "Soporte",
    promptTemplate: "Diagnostica la duda y deja los pasos para resolverla dentro de LYRA.",
    creditCost: 5,
    uses: 153,
    channels: ["whatsapp", "email", "web", "messenger"],
  },
  {
    id: "recordatorio",
    name: "Recordatorio",
    star: "RR Lyrae",
    description: "Prepara el aviso de una cita, una renovación o una lección pendiente.",
    category: "Seguimiento",
    promptTemplate: "Escribe un recordatorio breve con fecha, motivo y cómo confirmar.",
    creditCost: 4,
    uses: 176,
    channels: ["sms", "whatsapp", "email"],
  },
  {
    id: "senales",
    name: "Señales",
    star: "Beta",
    description: "Lee una tendencia y la convierte en un ángulo para la red.",
    category: "Mercado",
    promptTemplate: "Extrae la señal, el ángulo para LYRA y el canal donde publicarla.",
    creditCost: 9,
    uses: 71,
    channels: ["email", "linkedin", "web"],
  },
];
