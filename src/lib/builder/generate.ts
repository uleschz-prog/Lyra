// Paso «generate» del generador v2: un archivo por sección con el modelo de constructor.
import { designBrief, getDesignSystem } from "@/lib/builder/design-systems";
import { allowedIcons } from "@/lib/builder/icons";
import { getSectionDef, sectionTemplates } from "@/lib/builder/sections";
import { sectionForTask } from "@/lib/builder/scaffold";
import type { BuildPlan, FileTask, PlannedSection } from "@/lib/builder/types";

export function fileSystemPrompt(kind: BuildPlan["kind"]) {
  return [
    "Eres ingeniero front-end senior y diseñador de producto. Escribes UN archivo TSX de React 19 con Tailwind CSS v4 para un proyecto premium generado por LYRA.",
    "Devuelve SOLO el código dentro de un bloque ```tsx, sin explicaciones.",
    "Reglas técnicas obligatorias:",
    "- Exporta por defecto una función componente con el nombre indicado. Sin props (salvo el marco Shell, que recibe { children }).",
    "- Imports permitidos: \"react\", \"lucide-react\" (solo íconos de la lista), \"../lib/router\" ({ Link, useRoute, navigate }; Link recibe to=\"/ruta\" o to=\"#ancla\" y opcional onNavigate)" +
      (kind === "app"
        ? ", \"../lib/data\" ({ useCollection, readSettings, writeSettings }), \"../data/stores\" ({ schema, stores, type Row }) y \"../lib/format\" ({ formatValue, formatMoney, inputType, primaryField })."
        : "."),
    "- Prohibido: fetch, XMLHttpRequest, WebSocket, eval, new Function, dangerouslySetInnerHTML, localStorage/sessionStorage directos, import(), require, process.env, <script>, <iframe>, window.top/parent.",
    "- No escribas URLs externas salvo wa.me para WhatsApp e images.unsplash.com si el contenido ya trae la imagen. Nada de imágenes inventadas: usa degradados, formas, íconos y tipografía.",
    "- Usa SOLO las clases de color del sistema (bg-bg, bg-surface, bg-surface-2, text-ink, text-muted, border-line, bg-primary, text-primary, text-primary-ink, bg-accent, text-accent, text-accent-ink, con opacidades /10 /20…) y rounded-card, rounded-btn, rounded-input, shadow-card, font-display, font-body. Nada de colores fijos como bg-blue-500.",
    "- TypeScript válido y autocontenido: declara el contenido como const dentro del archivo. Accesible: alt, aria-label, labels en formularios, foco visible.",
    "Calidad: diseño premium y específico de este negocio, mobile-first, jerarquía tipográfica clara, ritmo de espacios generoso (py-20 sm:py-28 en secciones), estados hover/focus, microinteracciones sutiles con transition. Copia final en español de México; usa exactamente el contenido dado y mejóralo solo en estilo.",
  ].join("\n");
}

function templateFor(plan: BuildPlan, section: PlannedSection) {
  const system = getDesignSystem(plan.designSystem);
  const template = sectionTemplates[section.id];
  if (!system || !template) throw new Error(`Sección sin plantilla: ${section.id}`);
  return template(section, { plan, system });
}

/** Código de respaldo de la biblioteca para un archivo (determinista). */
export function templateSource(plan: BuildPlan, task: FileTask) {
  return templateFor(plan, sectionForTask(plan, task));
}

function appContext(plan: BuildPlan) {
  if (plan.kind !== "app") return "";
  const entities = plan.entities.map((entity) => ({ key: entity.key, label: entity.label, singular: entity.singular, fields: entity.fields }));
  return [
    "Capa de datos (ya existe, no la reescribas):",
    "- stores[key]: DataStore con list(), get(id), create(values), update(id, values), remove(id), subscribe(fn).",
    "- useCollection(stores[key]) devuelve Row[] reactivo (Row = { id, createdAt, updatedAt, [campo]: unknown }).",
    "- schema[key] = { key, label, singular, icon, fields: [{ key, label, type, options?, required? }] }.",
    `Entidades: ${JSON.stringify(entities)}`,
  ].join("\n");
}

export function filePrompt(plan: BuildPlan, task: FileTask) {
  const section = sectionForTask(plan, task);
  const def = getSectionDef(section.id);
  const system = getDesignSystem(plan.designSystem);
  const reference = plan.kind === "app" || def?.role === "shell" ? templateFor(plan, section) : "";
  const pages = plan.pages.map((page) => `${page.path} (${page.title})`).join(", ");
  return [
    `Archivo: ${task.path}. Componente: ${section.name}.`,
    `Proyecto: ${plan.title} — ${plan.summary}`,
    `Marca: ${JSON.stringify(plan.brand)}`,
    `Páginas: ${pages}`,
    system ? designBrief(system) : "",
    `Sección: ${def?.label ?? section.id}. Receta: ${def?.recipe ?? ""}`,
    section.direction ? `Dirección de arte: ${section.direction}` : "",
    section.anchor ? `Usa id="${section.anchor}" en el elemento raíz <section>.` : "",
    `Contenido (úsalo tal cual): ${JSON.stringify(section.content)}`,
    appContext(plan),
    reference ? `Implementación de referencia que funciona (respeta su API de datos y mejora el diseño):\n\`\`\`tsx\n${reference}\`\`\`` : "",
    `Íconos permitidos: ${allowedIcons.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function repairPrompt(plan: BuildPlan, task: FileTask, code: string, errors: string[]) {
  const section = sectionForTask(plan, task);
  return [
    `Corrige el archivo ${task.path} (componente ${section.name}). Falló la validación del servidor con estos errores:`,
    errors.map((error) => `- ${error}`).join("\n"),
    "Devuelve el archivo COMPLETO corregido en un bloque ```tsx. Mantén el diseño y el contenido; cambia solo lo necesario.",
    appContext(plan),
    `Íconos permitidos: ${allowedIcons.join(", ")}.`,
    `Código actual:\n\`\`\`tsx\n${code}\`\`\``,
  ]
    .filter(Boolean)
    .join("\n\n");
}
