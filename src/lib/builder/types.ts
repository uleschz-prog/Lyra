// Tipos compartidos del generador v2 (plan, secciones, entidades y archivos).

export type BuildKind = "sitio" | "app";

export type Cta = { label: string; href: string };

export type SectionItem = {
  title: string;
  text?: string;
  icon?: string;
  meta?: string;
  price?: string;
  image?: string;
};

export type SectionContent = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  cta?: Cta;
  secondary?: Cta;
  items?: SectionItem[];
  image?: string;
  note?: string;
  /** Campos de un formulario de sitio (contacto, reservas). */
  fields?: string[];
  /** Apps: llave de la entidad que usa la pantalla. */
  entity?: string;
};

export type PlannedSection = {
  /** Id de la sección en la biblioteca. */
  id: string;
  /** Nombre del componente (PascalCase, único en el proyecto). */
  name: string;
  /** Ancla para enlaces internos (#servicios). */
  anchor?: string;
  content: SectionContent;
  /** Dirección de arte específica que el plan le da al generador. */
  direction?: string;
};

export type PlannedPage = {
  /** Ruta: "/", "/servicios", "/clientes". */
  path: string;
  /** Nombre del componente de página (PascalCase). */
  name: string;
  /** Texto del menú. */
  title: string;
  sections: PlannedSection[];
};

export type FieldType = "text" | "longtext" | "number" | "money" | "date" | "time" | "email" | "phone" | "select" | "boolean";

export type EntityField = { key: string; label: string; type: FieldType; options?: string[]; required?: boolean };

export type SeedValue = string | number | boolean;

export type Entity = {
  key: string;
  label: string;
  singular: string;
  icon: string;
  fields: EntityField[];
  seed: Record<string, SeedValue>[];
};

export type Brand = {
  name: string;
  tagline: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  address?: string;
  hours?: string;
};

export type BuildPlan = {
  version: 1;
  kind: BuildKind;
  title: string;
  summary: string;
  brand: Brand;
  designSystem: string;
  /** Sitios: nav + footer. Apps: shell. */
  chrome: PlannedSection[];
  pages: PlannedPage[];
  entities: Entity[];
  suggestions: string[];
  assumptions: string[];
};

export type ProjectFiles = Record<string, string>;

/** Archivo que escribe el modelo (los demás salen del andamiaje determinista). */
export type FileTask = {
  path: string;
  /** Página y sección (o "chrome") de donde sale. */
  ref: { page: number; section: number } | { chrome: number };
  state: "pending" | "done" | "repair" | "template";
  attempts: number;
  errors?: string[];
};
