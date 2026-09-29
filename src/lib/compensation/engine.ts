import {
  bonusProfile,
  compensationPlan,
  getPackage,
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

export type BonusKind = "chispa" | "orbita" | "espejo";

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
  chispa: "Bono Chispa",
  orbita: "Bono Órbita",
  espejo: "Bono Espejo",
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
  const pulsarIndex = compensationPlan.ranks.findIndex((rank) => rank.id === "PULSAR");
  const evaluated = members
    .filter((member) => member.status === "ACTIVE" && bonusProfile(member.packageId))
    .map((member) => ({ member, rank: evaluateRank(members, member.id) }));
  const qualified = evaluated.filter(({ member, rank }) => {
    if (!bonusProfile(member.packageId)?.galaxyPool || !rank.achievedRankId) return false;
    return compensationPlan.ranks.findIndex((item) => item.id === rank.achievedRankId) >= pulsarIndex;
  });
  const points = roundMoney(members.reduce((total, member) => total + toPoints(member.personalVolume), 0));
  const pool = roundMoney(points * compensationPlan.galaxyPoolRate);
  const share = qualified.length ? roundMoney(pool / qualified.length) : 0;
  const pooled = new Set(qualified.map(({ member }) => member.id));

  const payouts = evaluated
    .map(({ member, rank }) => ({
      userId: member.id,
      name: member.name,
      rankId: rank.achievedRankId,
      rankLabel: compensationPlan.ranks.find((item) => item.id === rank.achievedRankId)?.label ?? null,
      rankPayout: rank.payout,
      poolPayout: pooled.has(member.id) ? share : 0,
    }))
    .filter((payout) => payout.rankPayout > 0 || payout.poolPayout > 0);

  return { payouts, points, pool };
}

export function galaxyPoolShare(members: CompensationMember[], userId: string) {
  const pulsarIndex = compensationPlan.ranks.findIndex((rank) => rank.id === "PULSAR");
  const qualified = members.filter((member) => {
    if (member.status !== "ACTIVE" || !bonusProfile(member.packageId)?.galaxyPool) return false;
    const achieved = evaluateRank(members, member.id).achievedRankId;
    return achieved !== null && compensationPlan.ranks.findIndex((rank) => rank.id === achieved) >= pulsarIndex;
  });
  if (!qualified.some((member) => member.id === userId)) return 0;
  const points = members.reduce((total, member) => total + toPoints(member.personalVolume), 0);
  return roundMoney((points * compensationPlan.galaxyPoolRate) / qualified.length);
}

export function rebuyMessage(packageId: PackageId | null, directs = 0) {
  if (!packageId) return "Elige Started, Pro, Founder o Corporate.";
  const planPackage = getPackage(packageId);
  const status = rebuyStatus(packageId, directs);
  if (packageId === "CORPORATE") {
    return "Corporate entra con 10,000 créditos: 5,000 para crear y 5,000 para activar cuentas de tu equipo. Libre de recompra de por vida.";
  }
  if (status.exempt) {
    return `Tienes ${compensationPlan.minActiveDirectsForFreeSubscription} directos activos: quedas exento de recompra mientras se mantengan activos.`;
  }
  const pending = `Te faltan ${status.remaining} ${status.remaining === 1 ? "directo activo" : "directos activos"} para quedar exento.`;
  if (packageId === "FOUNDER") {
    return `Founder paga una mensualidad de $29 desde el mes siguiente y recibe 40 créditos cada mes. ${pending}`;
  }
  if (packageId === "PRO") {
    return `Pro recarga 50 créditos al mes de por vida gracias a la promoción de lanzamiento. ${pending}`;
  }
  return `${planPackage.label} recarga ${planPackage.rebuy} créditos al mes siguiente de la inscripción. ${pending}`;
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

export function distributeSale(
  members: CompensationMember[],
  userId: string,
  amountUsd: number,
  kind: "purchase" | "rebuy",
): UnilevelLine[] {
  const points = toPoints(amountUsd);
  if (points <= 0) return [];

  const index = indexMembers(members);
  const chain = upline(index, userId, compensationPlan.unilevel.length + 1);
  const lines: UnilevelLine[] = [];

  const direct = chain[0];
  if (kind === "purchase" && direct) {
    const rate = bonusProfile(direct.packageId)?.chispa ?? 0;
    const reason = blockReason(direct);
    lines.push({
      bonus: "chispa",
      level: 1,
      rate,
      sponsorId: direct.id,
      sponsorName: direct.name,
      amount: reason ? 0 : points * rate,
      paid: reason === null,
      reason,
    });
  }

  chain.slice(0, compensationPlan.unilevel.length).forEach((sponsor, position) => {
    const level = position + 1;
    const rate = compensationPlan.unilevel[position] ?? 0;
    const profile = bonusProfile(sponsor.packageId);
    let reason = blockReason(sponsor);
    if (!reason && profile && profile.orbitaLevels < level) {
      reason = `${getPackage(sponsor.packageId as PackageId).label} cobra Órbita hasta el nivel ${profile.orbitaLevels}`;
    }
    const orbita = reason ? 0 : points * rate;
    lines.push({
      bonus: "orbita",
      level,
      rate,
      sponsorId: sponsor.id,
      sponsorName: sponsor.name,
      amount: orbita,
      paid: reason === null,
      reason,
    });

    const mentor = chain[position + 1];
    const espejo = mentor ? (bonusProfile(mentor.packageId)?.espejo ?? 0) : 0;
    if (orbita > 0 && mentor && espejo > 0 && !blockReason(mentor)) {
      lines.push({
        bonus: "espejo",
        level: level + 1,
        rate: espejo,
        sponsorId: mentor.id,
        sponsorName: mentor.name,
        amount: orbita * espejo,
        paid: true,
        reason: null,
      });
    }
  });

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const limit = points * compensationPlan.payoutCap;
  const factor = total > limit ? limit / total : 1;

  return lines.map((line) => ({ ...line, amount: roundMoney(line.amount * factor) }));
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
  const chispaRate = profile?.chispa ?? 0;
  const level2Rate = profile && profile.orbitaLevels >= 2 ? orbita2 : 0;
  const salePoints = toPoints(sale.price);
  const rebuyPoints = toPoints(sale.rebuy);
  const chispa = roundMoney(input.directs * salePoints * chispaRate);
  const level1 = roundMoney(input.directs * (salePoints + rebuyPoints) * orbita1);
  const level2 = roundMoney(input.directs * input.invitesEach * (salePoints + rebuyPoints) * level2Rate);

  return {
    chispa,
    level1,
    level2,
    total: roundMoney(chispa + level1 + level2),
    chispaRate,
    level1Rate: orbita1,
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
        rankPayout: member.status === "ACTIVE" ? rank.payout : 0,
        poolPayout: member.status === "ACTIVE" ? galaxyPoolShare(members, member.id) : 0,
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
