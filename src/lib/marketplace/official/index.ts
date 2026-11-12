// Plantillas oficiales y gratuitas del Marketplace. Se regeneran con scripts/marketplace-official.ts.
import agendaCitas from "./oficial-agenda-citas.json";
import agenteSoporte from "./oficial-agente-soporte-faq.json";
import agenteVentas from "./oficial-agente-ventas-whatsapp.json";
import clinicaDental from "./oficial-clinica-dental-premium.json";
import crmKanban from "./oficial-crm-kanban.json";
import restaurante from "./oficial-restaurante-taqueria.json";

export type OfficialTemplate = {
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

export const officialTemplates = [clinicaDental, restaurante, crmKanban, agendaCitas, agenteVentas, agenteSoporte] as OfficialTemplate[];
