export const platformEntryUsd = 99;
export const creditUsd = 1;

export const signupPlans = [
  {
    id: "STARTED",
    label: "Started",
    subtitle: "Recarga mínima desde el mes siguiente",
    points: [
      "150 créditos de entrada",
      "Chispa de 10% y Órbita de 2 niveles",
      "Notebook, academia y creación de video e imágenes",
      "Recarga mínima de $25 al mes siguiente",
    ],
    price: 99,
    rebuy: 25,
    credits: 150,
    levels: 2,
  },
  {
    id: "PRO",
    label: "Pro",
    subtitle: "Promoción por tiempo limitado: recarga de $50 de por vida",
    points: [
      "1,500 créditos de entrada",
      "Chispa de 20% y Órbita de 4 niveles",
      "Todo lo de Started y agentes autónomos",
      "Recarga mínima de $50 de por vida",
    ],
    price: 499,
    rebuy: 50,
    rebuyBefore: 100,
    credits: 1500,
    levels: 4,
  },
  {
    id: "FOUNDER",
    label: "Founder",
    subtitle: "2,000 créditos y mensualidad de $29 con 40 créditos",
    points: [
      "2,000 créditos de entrada",
      "Chispa de 30%, Órbita de 6 niveles y Espejo de 10%",
      "Lyra superagente y Fondo Galaxia",
      "Mensualidad de $29 con 40 créditos desde el mes siguiente",
    ],
    price: 1000,
    rebuy: 29,
    rebuyCredits: 40,
    credits: 2000,
    levels: 6,
  },
  {
    id: "CORPORATE",
    label: "Corporate",
    subtitle: "10,000 créditos para crear y activar a tu equipo",
    points: [
      "10,000 créditos, el doble de tu inversión",
      "5,000 créditos para activar cuentas de tu equipo",
      "Recuperas tu capital desde las primeras activaciones",
      "Chispa de 40%, Órbita de 6 niveles y Espejo de 20%",
      "Bono de rango ×1.5 hasta Galaxia y Fondo Galaxia",
      "Libre de recompra de por vida",
      "Todo lo de Pro y agentes autónomos",
    ],
    price: 5000,
    rebuy: 0,
    credits: 10000,
    activationCredits: 5000,
    levels: 6,
  },
] as const;

export type SignupPlanId = (typeof signupPlans)[number]["id"];

export const compensationPlan = {
  name: "Plan Constelación LYRA",
  pointsPerUsd: 0.8,
  unilevel: [0.05, 0.05, 0.04, 0.03, 0.02, 0.01],
  galaxyPoolRate: 0.02,
  payoutCap: 0.55,
  minActiveDirectsForFreeSubscription: 3,
  packages: [
    {
      id: "VEGA",
      label: "VEGA",
      subtitle: "Para creadores y profesionistas.",
      points: ["500 Créditos de IA Multimodal", "Acceso a Agentes Especializados", "Soporte Estándar"],
      price: 49,
      rebuy: 10,
      credits: 500,
      levels: 2,
    },
    {
      id: "POLARIS",
      label: "POLARIS",
      subtitle: "El estándar de oro para creadores y negocios.",
      points: ["1,500 Créditos de IA (3x Poder)", "Estudio Multimodal + Lyra Notebook RAG", "Fast-Track de Beneficios"],
      price: 99,
      rebuy: 25,
      credits: 1500,
      levels: 4,
      popular: true,
    },
    {
      id: "LYRA_MASTER",
      label: "LYRA MASTER",
      subtitle: "Para agencias, empresas y líderes de expansión.",
      points: ["10,000 Créditos de IA de Alto Rendimiento", "Licencia Studio Full Unlocked", "Asistencia Prioritaria VIP"],
      price: 499,
      rebuy: 100,
      credits: 10000,
      levels: 6,
    },
  ],
  ranks: [
    { id: "NOVA", label: "Nova", volume: 2000, payout: 100 },
    { id: "PULSAR", label: "Pulsar", volume: 6000, payout: 300 },
    { id: "QUASAR", label: "Quasar", volume: 20000, payout: 1000 },
    { id: "SUPERNOVA", label: "Supernova", volume: 60000, payout: 3000 },
    { id: "GALAXIA", label: "Galaxia", volume: 200000, payout: 10000 },
  ],
  minLegsRequired: 3,
  maxLegVolumePercentage: 0.4,
  exemptRebuyLabel: "Exento de recompra",
} as const;

export type PackageId = SignupPlanId | (typeof legacyPlans)[number]["id"] | (typeof compensationPlan.packages)[number]["id"];
export type CompensationRankId = (typeof compensationPlan.ranks)[number]["id"];
export type MemberStatus = "ACTIVE" | "INACTIVE";

const legacyPlans = [
  {
    id: "FREE" as const,
    label: "Free",
    subtitle: "Plan anterior",
    points: [] as string[],
    price: 99,
    rebuy: 25,
    credits: 100,
    levels: 1,
  },
];

const catalog = [...signupPlans, ...legacyPlans, ...compensationPlan.packages];

export function getPackage(id: PackageId) {
  const planPackage = catalog.find((item) => item.id === id);
  if (!planPackage) {
    throw new Error(`Plan desconocido: ${id}`);
  }
  return planPackage;
}

export function isPackageId(value: string): value is PackageId {
  return catalog.some((item) => item.id === value);
}

export function isSignupPlanId(value: string): value is SignupPlanId {
  return signupPlans.some((item) => item.id === value);
}

export const rebuyExemptionRule = `Con ${compensationPlan.minActiveDirectsForFreeSubscription} directos activos quedas exento de recompra.`;

export function rebuyStatus(packageId: string | null | undefined, activeDirects: number) {
  const amount = packageId && isPackageId(packageId) ? getPackage(packageId).rebuy : 0;
  const required = compensationPlan.minActiveDirectsForFreeSubscription;
  if (packageId === "CORPORATE") {
    return { amount: 0, exempt: true, remaining: 0, label: "Corporate · libre de recompra de por vida" };
  }
  if (activeDirects >= required) {
    return { amount: 0, exempt: true, remaining: 0, label: `${required} directos activos · exento de recompra` };
  }
  return {
    amount,
    exempt: amount === 0,
    remaining: required - activeDirects,
    label: amount > 0 ? `Recompra de $${amount} al mes` : "Sin recompra",
  };
}

export type BonusProfile = {
  chispa: number;
  orbitaLevels: number;
  rankMultiplier: number;
  maxRank: CompensationRankId;
  espejo: number;
  galaxyPool: boolean;
};

const bonusProfiles: Record<"STARTED" | "PRO" | "FOUNDER" | "CORPORATE", BonusProfile> = {
  STARTED: { chispa: 0.1, orbitaLevels: 2, rankMultiplier: 0.25, maxRank: "NOVA", espejo: 0, galaxyPool: false },
  PRO: { chispa: 0.2, orbitaLevels: 4, rankMultiplier: 0.5, maxRank: "QUASAR", espejo: 0, galaxyPool: false },
  FOUNDER: { chispa: 0.3, orbitaLevels: 6, rankMultiplier: 1, maxRank: "SUPERNOVA", espejo: 0.1, galaxyPool: true },
  CORPORATE: { chispa: 0.4, orbitaLevels: 6, rankMultiplier: 1.5, maxRank: "GALAXIA", espejo: 0.2, galaxyPool: true },
};

export function bonusProfile(packageId: string | null | undefined): BonusProfile | null {
  if (!packageId || packageId === "NONE") return null;
  if (packageId === "STARTED" || packageId === "FREE" || packageId === "VEGA" || packageId === "POLARIS") return bonusProfiles.STARTED;
  if (packageId === "PRO" || packageId === "LYRA_MASTER") return bonusProfiles.PRO;
  if (packageId === "FOUNDER" || packageId === "CORPORATE") return bonusProfiles[packageId];
  return null;
}

export function toPoints(usd: number) {
  return Math.round(usd * compensationPlan.pointsPerUsd * 100) / 100;
}

export function isFounderPackage(packageId: string | null | undefined) {
  return packageId === "FOUNDER";
}

export function rebuyCredits(packageId: string | null | undefined, amountUsd: number) {
  if (packageId && isSignupPlanId(packageId)) {
    const plan = getPackage(packageId);
    if ("rebuyCredits" in plan) return plan.rebuyCredits;
  }
  return amountUsd;
}

export function creditRechargeUsd(packageId: string | null | undefined) {
  if (packageId === "CORPORATE") return 100;
  if (packageId === "PRO" || packageId === "FOUNDER") return 50;
  if (packageId === "LYRA_MASTER") return 100;
  if (packageId === "STARTED" || packageId === "POLARIS" || packageId === "VEGA" || packageId === "FREE") return 25;
  return null;
}
