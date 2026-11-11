export type ConstellationSection =
  | "observatory"
  | "genealogy"
  | "compensation"
  | "academy"
  | "agents"
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
    squad: "Partners",
    line: "Cada partner forma parte de una comunidad que crece conectada.",
  },
  compensation: {
    star: "Sulafat",
    squad: "Partners",
    line: "Órbita paga 20%, 10% y 5% hasta el nivel 6. El bono mundial del 10% se reparte entre las cuentas Pro de $249 que recargaron al menos 5 créditos en el mes.",
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
  wallet: {
    star: "Zeta",
    squad: "Billetera",
    line: "Dólares de comisión y créditos que alimentan la constelación.",
  },
};
