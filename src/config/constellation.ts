export type ConstellationSection =
  | "observatory"
  | "genealogy"
  | "compensation"
  | "academy"
  | "agents"
  | "notebook"
  | "creative"
  | "wallet"
  | "protocol";

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
    line: "Inicio $29, Negocio $99 y Pro $299. Un crédito equivale a $1.",
  },
  academy: {
    star: "Epsilon",
    squad: "Academia",
    line: "Lecciones por rango. Lo que aún no brilla permanece visible y cerrado.",
  },
  agents: {
    star: "Vega",
    squad: "Super agente",
    line: "Un solo super agente, con tus canales y herramientas listas para trabajar.",
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
  protocol: {
    star: "Vega",
    squad: "Protocolo",
    line: "El agente opera USDC en Polygon Amoy y deja el rastro de cada trade.",
  },
};
