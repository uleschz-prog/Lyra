import type { PackageType } from "@/lib/types";

export const platformEntryUsd = 29;
export const creditUsd = 1;
export const minimumCreditRecharge = 5;
export const promotionalRechargeCredits = 50;
export const promotionalRechargeBonus = 10;

export function isValidCreditRecharge(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimumCreditRecharge;
}

export function creditRechargeUsdForCredits(credits: number) {
  return credits * creditUsd;
}

export function bonusCreditsForRecharge(credits: number) {
  return credits === promotionalRechargeCredits ? promotionalRechargeBonus : 0;
}

export function creditedRechargeCredits(credits: number) {
  return credits + bonusCreditsForRecharge(credits);
}

/**
 * Planes de entrada de LYRA.
 * Inicio $29 · Negocio $99 · Pro $249.
 * Todos incluyen los mismos servicios. Cambian los créditos, el cupo de video y hasta qué nivel de Órbita se cobra.
 */
export type PlanSpec = {
  id: string;
  label: string;
  subtitle: string;
  points: readonly string[];
  price: number;
  rebuy: number;
  credits: number;
  levels: number;
  rebuyBefore?: number;
  rebuyCredits?: number;
  activationCredits?: number;
  quote?: boolean;
};

const sharedServices = [
  "Todos los agentes, canales y servicios",
  "Academia, creación visual y seguimiento",
] as const;

export const signupPlans: readonly PlanSpec[] = [
  {
    id: "STARTED",
    label: "Inicio",
    subtitle: "150 créditos, 40 s de video por ciclo y Órbita hasta el nivel 2",
    points: [
      "150 créditos de entrada",
      "40 segundos de video por ciclo de 30 días",
      "Cobras Órbita hasta el nivel 2 (20% y 10%)",
      ...sharedServices,
      "Recarga mensual flexible desde 5 créditos",
      "Compra 50 créditos y recibe 60",
    ],
    price: 29,
    rebuy: 19,
    credits: 150,
    levels: 2,
  },
  {
    id: "PRO",
    label: "Negocio",
    subtitle: "300 créditos, 140 s de video por ciclo y Órbita hasta el nivel 4",
    points: [
      "300 créditos de entrada",
      "140 segundos de video por ciclo de 30 días",
      "Cobras Órbita hasta el nivel 4",
      ...sharedServices,
      "Recarga mensual flexible desde 5 créditos",
      "Compra 50 créditos y recibe 60",
    ],
    price: 99,
    rebuy: 49,
    credits: 300,
    levels: 4,
  },
  {
    id: "FOUNDER",
    label: "Pro",
    subtitle: "1,000 créditos, 360 s de video por ciclo y Órbita en los 6 niveles",
    points: [
      "1,000 créditos de entrada",
      "360 segundos de video por ciclo de 30 días",
      "Cobras Órbita en los 6 niveles, hasta el 50%",
      "Con una recarga mensual desde 5 créditos participas en los bonos del mes",
      ...sharedServices,
      "Recarga mensual flexible desde 5 créditos",
      "Compra 50 créditos y recibe 60",
    ],
    price: 249,
    rebuy: 99,
    credits: 1000,
    levels: 6,
  },
] as const;

export type SignupPlanId = (typeof signupPlans)[number]["id"];

/**
 * Créditos de regalo por cada directo activo. Sustituyen a la exención total
 * de recarga mensual flexible: los créditos de bono se mantienen como beneficio.
 */
export const activeDirectBonusCredits = 250;

/**
 * Créditos de regalo máximos por mes (tope del bonus por directos activos).
 * Evita que cuentas grandes acumulen créditos sin límite.
 */
export const activeDirectBonusCap = 1500;

export const compensationPlan = {
  name: "Bono Órbita",
  /**
   * Cada dólar que entra se convierte en 0.80 puntos.
   * Órbita y el bono mundial se calculan sobre esos puntos.
   * La explicación va solo en los términos, no en el resto del sitio.
   */
  pointsPerUsd: 0.8,
  unilevel: [0.2, 0.1, 0.05, 0.05, 0.05, 0.05],
  galaxyPoolRate: 0,
  /**
   * Bono mundial: el 10 % de las ventas del mes (paquetes y recargas)
   * se reparte en partes iguales entre los Pro de $249 que hicieron una
   * recarga mensual mínima de 5 créditos.
   */
  globalPoolRate: 0.1,
  globalPoolPrice: 249,
  globalPoolMinimumRechargeUsd: minimumCreditRecharge * creditUsd,
  /**
   * Los seis niveles suman el 50 % del dinero pagado (paquete o recarga).
   * No hay un recorte extra: 20 + 10 + 5 + 5 + 5 + 5.
   */
  payoutCap: 0.5,
  /**
   * Los directos activos ya NO exentan la recarga: dan créditos bonus.
   */
  minActiveDirectsForBonus: 3,
  minActiveDirectsForFreeSubscription: 3,
  packages: [] as const,
  ranks: [
    { id: "NOVA", label: "Nova", volume: 2000, payout: 100 },
    { id: "PULSAR", label: "Pulsar", volume: 6000, payout: 300 },
    { id: "QUASAR", label: "Quasar", volume: 20000, payout: 1000 },
    { id: "SUPERNOVA", label: "Supernova", volume: 60000, payout: 3000 },
    { id: "GALAXIA", label: "Galaxia", volume: 200000, payout: 10000 },
  ],
  minLegsRequired: 3,
  maxLegVolumePercentage: 0.4,
  exemptRebuyLabel: "Créditos bonus",
} as const;

export type PackageId =
  | SignupPlanId
  | (typeof legacyPlans)[number]["id"]
  | (typeof aliasPlans)[number]["id"]
  | (typeof retiredPlans)[number]["id"]
  | "NONE";
export type CompensationRankId = (typeof compensationPlan.ranks)[number]["id"];
export type MemberStatus = "ACTIVE" | "INACTIVE";

/**
 * Planes históricos que ya no se venden pero deben seguir resolviéndose
 * para cuentas existentes (compatibilidad). Mapean a la escalera nueva.
 */
const legacyPlans = [
  { id: "FREE" as const, label: "Inicio", subtitle: "Plan anterior", points: [] as string[], price: 29, rebuy: 19, credits: 150, levels: 2 },
];

/** Alias de IDs antiguos (VEGA, POLARIS, LYRA_MASTER, VEGA_PARTNER) a los planes actuales. */
const aliasPlans = [
  { id: "VEGA" as const, label: "Inicio", subtitle: "Plan anterior", points: [] as string[], price: 29, rebuy: 19, credits: 150, levels: 2 },
  { id: "POLARIS" as const, label: "Negocio", subtitle: "Plan anterior", points: [] as string[], price: 99, rebuy: 49, credits: 300, levels: 4 },
  { id: "LYRA_MASTER" as const, label: "Pro", subtitle: "Plan anterior", points: [] as string[], price: 249, rebuy: 99, credits: 1000, levels: 6 },
  { id: "VEGA_PARTNER" as const, label: "Inicio", subtitle: "Plan anterior", points: [] as string[], price: 29, rebuy: 19, credits: 150, levels: 2 },
];

/** Corporate ya no se vende. Las cuentas existentes siguen resolviéndose y cobran como Pro. */
const retiredPlans = [
  { id: "CORPORATE" as const, label: "Corporate", subtitle: "Ya no se ofrece", points: [] as string[], price: 0, rebuy: 0, credits: 0, levels: 6 },
];

const catalog = [...signupPlans, ...legacyPlans, ...aliasPlans, ...retiredPlans];

export function getPackage(id: PackageId) {
  const planPackage = catalog.find((item) => item.id === id);
  if (!planPackage) {
    throw new Error(`Plan desconocido: ${id}`);
  }
  return planPackage as {
    id: string;
    label: string;
    subtitle: string;
    points: readonly string[];
    price: number;
    rebuy: number;
    credits: number;
    levels: number;
    rebuyBefore?: number;
    rebuyCredits?: number;
    activationCredits?: number;
    quote?: boolean;
  };
}

export function isPackageId(value: string): value is PackageId {
  return catalog.some((item) => item.id === value);
}

/** IDs válidos del enum PackageType de Prisma (para validación de runtime). */
const packageTypeIds: readonly PackageType[] = [
  "NONE",
  "FREE",
  "STARTED",
  "PRO",
  "FOUNDER",
  "CORPORATE",
  "VEGA",
  "POLARIS",
  "LYRA_MASTER",
  "VEGA_PARTNER",
];

function isPackageType(value: string): value is PackageType {
  return packageTypeIds.some((id) => id === value);
}

/**
 * Estrecha un string arbitrario al enum PackageType de Prisma.
 * Devuelve el valor si es un plan conocido; "NONE" como fallback seguro.
 * Úsalo en lugar de casts (as PackageType) para no silenciar tipos.
 */
export function toPackageType(value: string | null | undefined): PackageType {
  if (typeof value === "string" && isPackageType(value)) return value;
  return "NONE";
}

export function isSignupPlanId(value: string): value is SignupPlanId {
  return signupPlans.some((item) => item.id === value);
}

export function isQuotePlan(id: string | null | undefined) {
  return id === "CORPORATE";
}

export const rebuyExemptionRule = `Recarga desde ${minimumCreditRecharge} créditos al mes para mantener la actividad y recibir comisiones.`;

export function activeDirectBonusCreditsFor(activeDirects: number) {
  if (activeDirects < compensationPlan.minActiveDirectsForBonus) return 0;
  const raw = activeDirects * activeDirectBonusCredits;
  return Math.min(raw, activeDirectBonusCap);
}

export function rebuyStatus(packageId: string | null | undefined, activeDirects: number) {
  const required = compensationPlan.minActiveDirectsForBonus;
  const bonus = activeDirectBonusCreditsFor(activeDirects);
  if (packageId === "CORPORATE") {
    return { amount: 0, exempt: true, remaining: 0, bonusCredits: bonus, label: "Corporate ya no se ofrece" };
  }
  return {
    amount: 0,
    exempt: false,
    remaining: Math.max(required - activeDirects, 0),
    bonusCredits: bonus,
    label: `Recarga flexible desde ${minimumCreditRecharge} créditos al mes`,
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

const bonusProfiles: Record<"STARTED" | "PRO" | "FOUNDER", BonusProfile> = {
  STARTED: { chispa: 0, orbitaLevels: 2, rankMultiplier: 0, maxRank: "NOVA", espejo: 0, galaxyPool: false },
  PRO: { chispa: 0, orbitaLevels: 4, rankMultiplier: 0, maxRank: "NOVA", espejo: 0, galaxyPool: false },
  FOUNDER: { chispa: 0, orbitaLevels: 6, rankMultiplier: 0, maxRank: "NOVA", espejo: 0, galaxyPool: false },
};

export function bonusProfile(packageId: string | null | undefined): BonusProfile | null {
  if (!packageId || packageId === "NONE") return null;
  if (packageId === "STARTED" || packageId === "FREE" || packageId === "VEGA" || packageId === "VEGA_PARTNER") return bonusProfiles.STARTED;
  if (packageId === "PRO" || packageId === "POLARIS") return bonusProfiles.PRO;
  if (packageId === "FOUNDER" || packageId === "LYRA_MASTER" || packageId === "CORPORATE") return bonusProfiles.FOUNDER;
  return null;
}

export function toPoints(usd: number) {
  return Math.round(usd * compensationPlan.pointsPerUsd * 100) / 100;
}

/**
 * Puntos generados SOLO por el precio del producto (membresía/recarga).
 * Los créditos que se regalan (entrada o bonus) no generan puntos de red:
 * no se puede pagar comisión sobre algo que cuesta centavos.
 */
export function productPoints(usd: number) {
  return toPoints(usd);
}

/** Pago máximo de red para un monto de producto, aplicando payoutCap. */
export function maxNetworkPayout(usd: number) {
  return Math.round(productPoints(usd) * compensationPlan.payoutCap * 100) / 100;
}

/** Créditos de los 1,000 iniciales que un Pro de $249 puede convertir en códigos de alta. */
export const founderSignupCodeCredits = 500;

export function founderCodeBudget(input: { spentUsd: number; credits: number; activationCredits: number }) {
  const remainingCap = Math.max(0, founderSignupCodeCredits - input.spentUsd);
  return input.activationCredits + Math.min(remainingCap, Math.max(0, input.credits));
}

/**
 * El Pro que pagó con dinero puede convertir 500 créditos en códigos.
 * Una cuenta que entró con código conserva su plan y sus créditos, y no puede repetir el regalo.
 */
export function canSpendSignupCreditsOnCodes(input: {
  packageId: string | null | undefined;
  activatedWithCode: boolean;
}) {
  return isFounderPackage(input.packageId) && !input.activatedWithCode;
}

export function isFounderPackage(packageId: string | null | undefined) {
  return packageId === "FOUNDER";
}

/** Cualquier membresía distinta de «sin plan» abre los mismos servicios. */
export function hasActiveMembership(packageId: string | null | undefined) {
  return Boolean(packageId && packageId !== "NONE");
}

export function rebuyCredits(packageId: string | null | undefined, amountUsd: number) {
  if (packageId && isSignupPlanId(packageId)) {
    const plan = getPackage(packageId);
    if (typeof plan.rebuyCredits === "number") return plan.rebuyCredits;
  }
  return amountUsd;
}
