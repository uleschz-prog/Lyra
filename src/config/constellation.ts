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
    squad: "Partners",
    line: "Órbita paga 20%, 10% y 5% hasta el nivel 6. El 10% de las ventas del mes se reparte entre los Pro de $249 que renovaron con $99.",
  },
  academy: {
    star: "Epsilon",
    squad: "Academia",
    line: "Todos los cursos están abiertos con cualquier membresía.",
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
};
