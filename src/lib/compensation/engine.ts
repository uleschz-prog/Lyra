import {
  bonusProfile,
  compensationPlan,
  getPackage,
  isPackageId,
  rebuyStatus,
  toPoints,
  type CompensationRankId,
  type MemberStatus,
  type PackageId,
} from "@/config/compensation-plan";

export type CompensationMember = {
  id: string;
  name: string;
  sponsorId: string | null;
  status: MemberStatus;
  packageId: PackageId | null;
  personalVolume: number;
};

export type BonusKind = "orbita";

export type UnilevelLine = {
  bonus: BonusKind;
  level: number;
  rate: number;
  sponsorId: string;
  sponsorName: string;
  amount: number;
  paid: boolean;
  reason: string | null;
};

export type LegVolume = {
  id: string;
  name: string;
  status: MemberStatus;
  volume: number;
};

export type RankProgress = {
  id: CompensationRankId;
  label: string;
  volume: number;
  payout: number;
  counted: number;
  cap: number;
  progress: number;
  reached: boolean;
  locked: boolean;
};

export type RankEvaluation = {
  legCount: number;
  minLegsRequired: number;
  rawVolume: number;
  achievedRankId: CompensationRankId | null;
  payout: number;
  multiplier: number;
  ranks: RankProgress[];
  legs: LegVolume[];
};

export type Charge = {
  kind: "purchase" | "rebuy";
  amount: number;
  points: number;
  exempt: boolean;
  label: string;
  credits: number;
  activeDirects: number;
};

export type ProcessResult = {
  userId: string;
  userName: string;
  charge: Charge | null;
  unilevel: UnilevelLine[];
  rank: RankEvaluation;
  rankPayout: number;
  poolPayout: number;
};

export type ProcessInput = {
  kind: "purchase" | "rebuy" | "monthly";
  userId: string;
  packageId?: PackageId;
};

type Index = {
  byId: Map<string, CompensationMember>;
  childrenOf: Map<string, CompensationMember[]>;
};

export const bonusLabels: Record<BonusKind, string> = {
  orbita: "Bono Órbita",
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function indexMembers(members: CompensationMember[]): Index {
  const byId = new Map(members.map((member) => [member.id, member]));
  const childrenOf = new Map<string, CompensationMember[]>();

  for (const member of members) {
    if (!member.sponsorId || !byId.has(member.sponsorId)) continue;
    const list = childrenOf.get(member.sponsorId) ?? [];
    list.push(member);
    childrenOf.set(member.sponsorId, list);
  }

  return { byId, childrenOf };
}

export function activeDirects(members: CompensationMember[], userId: string) {
  const { childrenOf } = indexMembers(members);
  return (childrenOf.get(userId) ?? []).filter((member) => member.status === "ACTIVE");
}

function groupVolume(memberId: string, index: Index, depth: number, seen: Set<string>): number {
  if (seen.has(memberId) || depth > compensationPlan.unilevel.length) return 0;
  seen.add(memberId);
  const member = index.byId.get(memberId);
  if (!member) return 0;

  return (index.childrenOf.get(memberId) ?? []).reduce(
    (total, child) => total + groupVolume(child.id, index, depth + 1, seen),
    toPoints(member.personalVolume),
  );
}

export function legVolumes(members: CompensationMember[], userId: string): LegVolume[] {
  const index = indexMembers(members);
  return (index.childrenOf.get(userId) ?? []).map((child) => ({
    id: child.id,
    name: child.name,
    status: child.status,
    volume: roundMoney(groupVolume(child.id, index, 1, new Set())),
  }));
}

export function evaluateRank(members: CompensationMember[], userId: string): RankEvaluation {
  const member = members.find((item) => item.id === userId);
  const profile = bonusProfile(member?.packageId);
  const maxIndex = profile ? compensationPlan.ranks.findIndex((rank) => rank.id === profile.maxRank) : -1;
  const multiplier = profile?.rankMultiplier ?? 0;
  const legs = legVolumes(members, userId).filter((leg) => leg.volume > 0);
  const rawVolume = roundMoney(legs.reduce((total, leg) => total + leg.volume, 0));
  const ranks = compensationPlan.ranks.map((rank, index) => {
    const cap = roundMoney(rank.volume * compensationPlan.maxLegVolumePercentage);
    const counted = roundMoney(legs.reduce((total, leg) => total + Math.min(leg.volume, cap), 0));
    const locked = index > maxIndex;
    const reached = !locked && legs.length >= compensationPlan.minLegsRequired && counted >= rank.volume;

    return {
      id: rank.id,
      label: rank.label,
      volume: rank.volume,
      payout: roundMoney(rank.payout * multiplier),
      counted,
      cap,
      progress: Math.min(100, (counted / rank.volume) * 100),
      reached,
      locked,
    };
  });
  const achieved = [...ranks].reverse().find((rank) => rank.reached) ?? null;

  return {
    legCount: legs.length,
    minLegsRequired: compensationPlan.minLegsRequired,
    rawVolume,
    achievedRankId: achieved?.id ?? null,
    payout: achieved?.payout ?? 0,
    multiplier,
    ranks,
    legs,
  };
}

export type MonthlyPayout = {
  userId: string;
  name: string;
  rankId: CompensationRankId | null;
  rankLabel: string | null;
  rankPayout: number;
  poolPayout: number;
};

export function monthlyClose(members: CompensationMember[]): { payouts: MonthlyPayout[]; points: number; pool: number } {
  const points = roundMoney(members.reduce((total, member) => total + toPoints(member.personalVolume), 0));
  return { payouts: [], points, pool: 0 };
}

export function galaxyPoolShare(_members: CompensationMember[], _userId: string) {
  return 0;
}

export function rebuyMessage(packageId: PackageId | null, directs = 0) {
  if (!packageId) return "Elige Inicio, Negocio o Pro.";
  const planPackage = getPackage(packageId);
  const status = rebuyStatus(packageId, directs);
  if (packageId === "CORPORATE") {
    return "Tu cuenta Corporate conserva Órbita en los 6 niveles. Ese paquete ya no se ofrece.";
  }
  if (status.exempt) {
    return `Tienes ${compensationPlan.minActiveDirectsForBonus} directos activos: ganas créditos bonus cada mes mientras se mantengan activos.`;
  }
  const pending = `Te faltan ${status.remaining} ${status.remaining === 1 ? "directo activo" : "directos activos"} para tus créditos bonus.`;
  if (packageId === "FOUNDER") {
    return `Pro recarga desde $99 al mes siguiente. ${pending}`;
  }
  if (packageId === "PRO") {
    return `Negocio recarga desde $49 al mes siguiente. ${pending}`;
  }
  return `${planPackage.label} recarga desde $${planPackage.rebuy} al mes siguiente de la inscripción. ${pending}`;
}

function upline(index: Index, userId: string, limit: number = compensationPlan.unilevel.length) {
  const chain: CompensationMember[] = [];
  const seen = new Set<string>([userId]);
  let sponsorId = index.byId.get(userId)?.sponsorId ?? null;

  while (sponsorId && chain.length < limit && !seen.has(sponsorId)) {
    const sponsor = index.byId.get(sponsorId);
    if (!sponsor) break;
    seen.add(sponsor.id);
    chain.push(sponsor);
    sponsorId = sponsor.sponsorId;
  }

  return chain;
}

function blockReason(sponsor: CompensationMember) {
  if (sponsor.status !== "ACTIVE") return "Patrocinador inactivo";
  if (!bonusProfile(sponsor.packageId)) return "Sin plan activo";
  return null;
}

function sponsorLabel(packageId: PackageId | null) {
  if (packageId && isPackageId(packageId)) return getPackage(packageId).label;
  return "Este plan";
}

export function distributeSale(
  members: CompensationMember[],
  userId: string,
  amountUsd: number,
  _kind: "purchase" | "rebuy",
): UnilevelLine[] {
  if (!(amountUsd > 0)) return [];

  const index = indexMembers(members);
  const chain = upline(index, userId, compensationPlan.unilevel.length);

  return chain.map((sponsor, position) => {
    const level = position + 1;
    const rate = compensationPlan.unilevel[position] ?? 0;
    const profile = bonusProfile(sponsor.packageId);
    let reason = blockReason(sponsor);
    if (!reason && profile && profile.orbitaLevels < level) {
      reason = `${sponsorLabel(sponsor.packageId)} cobra Órbita hasta el nivel ${profile.orbitaLevels}`;
    }
    return {
      bonus: "orbita" as const,
      level,
      rate,
      sponsorId: sponsor.id,
      sponsorName: sponsor.name,
      amount: reason ? 0 : roundMoney(amountUsd * rate),
      paid: reason === null,
      reason,
    };
  });
}

export function estimateInvitationEarnings(input: {
  directs: number;
  invitesEach: number;
  salePackageId: PackageId;
  earnerPackageId: PackageId;
}) {
  const sale = getPackage(input.salePackageId);
  const profile = bonusProfile(input.earnerPackageId);
  const [orbita1 = 0, orbita2 = 0] = compensationPlan.unilevel;
  const level1Rate = profile && profile.orbitaLevels >= 1 ? orbita1 : 0;
  const level2Rate = profile && profile.orbitaLevels >= 2 ? orbita2 : 0;
  const paid = sale.price + sale.rebuy;
  const level1 = roundMoney(input.directs * paid * level1Rate);
  const level2 = roundMoney(input.directs * input.invitesEach * paid * level2Rate);

  return {
    level1,
    level2,
    total: roundMoney(level1 + level2),
    level1Rate,
    level2Rate,
    price: sale.price,
    earnerLevels: profile?.orbitaLevels ?? 0,
  };
}

export function memberPlan(members: CompensationMember[], userId: string) {
  const member = members.find((item) => item.id === userId);
  if (!member) return null;

  const directs = activeDirects(members, userId);
  const planPackage = member.packageId ? getPackage(member.packageId) : null;
  const status = rebuyStatus(member.packageId, directs.length);

  return {
    userId: member.id,
    name: member.name,
    packageId: member.packageId,
    packageLabel: planPackage?.label ?? "Sin plan",
    activeDirects: directs.length,
    requiredDirects: compensationPlan.minActiveDirectsForFreeSubscription,
    remainingDirects: status.remaining,
    exempt: status.exempt,
    exemptLabel: status.label,
    rebuyUsd: planPackage?.rebuy ?? 0,
    message: rebuyMessage(member.packageId, directs.length),
    rank: evaluateRank(members, userId),
  };
}

export type MemberPlanView = NonNullable<ReturnType<typeof memberPlan>>;

export function processCommission(
  members: CompensationMember[],
  input: ProcessInput,
): { ok: true; result: ProcessResult } | { ok: false; status: number; error: string } {
  const member = members.find((item) => item.id === input.userId);
  if (!member) {
    return { ok: false, status: 404, error: "No existe ese socio en la red." };
  }

  const rank = evaluateRank(members, member.id);
  const directs = activeDirects(members, member.id);

  if (input.kind === "monthly") {
    return {
      ok: true,
      result: {
        userId: member.id,
        userName: member.name,
        charge: null,
        unilevel: [],
        rank,
        rankPayout: 0,
        poolPayout: galaxyPoolShare(members, member.id),
      },
    };
  }

  const packageId = input.kind === "purchase" ? input.packageId : (input.packageId ?? member.packageId);
  if (!packageId) {
    return { ok: false, status: 400, error: "Indica el plan de la compra o la recarga." };
  }

  const planPackage = getPackage(packageId);
  const status = rebuyStatus(packageId, directs.length);
  const exempt = input.kind === "rebuy" && status.exempt;
  const amount = input.kind === "purchase" ? planPackage.price : status.amount;
  const charge: Charge = {
    kind: input.kind,
    amount,
    points: toPoints(amount),
    exempt,
    label:
      input.kind === "rebuy" && exempt
        ? status.label
        : input.kind === "purchase"
          ? `Plan ${planPackage.label}`
          : `${packageId === "FOUNDER" ? "Mensualidad" : "Recompra"} ${planPackage.label}`,
    credits: input.kind === "purchase" ? planPackage.credits : 0,
    activeDirects: directs.length,
  };

  return {
    ok: true,
    result: {
      userId: member.id,
      userName: member.name,
      charge,
      unilevel: distributeSale(members, member.id, amount, input.kind),
      rank,
      rankPayout: 0,
      poolPayout: 0,
    },
  };
}
