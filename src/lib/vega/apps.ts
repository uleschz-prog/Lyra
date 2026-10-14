export const userToolkits = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "zoom",
  "calendly",
  "instagram",
  "facebook",
  "linkedin",
  "stripe",
  "whatsapp",
] as const;

export type UserToolkit = (typeof userToolkits)[number];

export type VegaConnections = Record<UserToolkit, boolean>;

export const toolkitLabels: Record<UserToolkit, string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googledrive: "Google Drive",
  zoom: "Zoom",
  calendly: "Calendly",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  stripe: "Stripe",
  whatsapp: "WhatsApp Business",
};

export const toolkitHints: Record<UserToolkit, string> = {
  gmail: "Lee tus correos y prepara envíos que tú confirmas.",
  googlecalendar: "Revisa tu agenda y prepara eventos, con enlace de Google Meet si lo pides.",
  googledrive: "Busca tus archivos, lee y llena tus hojas de Sheets y crea documentos de Docs.",
  zoom: "Crea reuniones de Zoom para tus llamadas con prospectos.",
  calendly: "Te dice quién agendó contigo y te pasa tu enlace para agendar.",
  instagram: "Publica fotos con su texto en tu cuenta de empresa o creador, cuando confirmas.",
  facebook: "Publica en las páginas de Facebook que administras, cuando confirmas.",
  linkedin: "Publica en tu perfil de LinkedIn, cuando confirmas.",
  stripe: "Revisa tus cobros y crea enlaces de pago para tus productos.",
  whatsapp: "Envía mensajes y plantillas desde tu número de WhatsApp Business API, cuando confirmas.",
};

export const noConnections = Object.fromEntries(userToolkits.map((toolkit) => [toolkit, false])) as VegaConnections;

export function isUserToolkit(value: string): value is UserToolkit {
  return (userToolkits as readonly string[]).includes(value);
}
