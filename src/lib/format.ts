import type { PackageType, Rank } from "@/lib/types";

const rankOrder: Record<Rank, number> = {
  ASTRA: 0,
  NOVA: 1,
  ALPHA: 2,
  PULSAR: 3,
  VEGA: 4,
  CONSTELLATION: 5,
};

export const rankLabel: Record<Rank, string> = {
  ASTRA: "Astra",
  NOVA: "Nova",
  ALPHA: "Alpha",
  PULSAR: "Pulsar",
  VEGA: "Vega",
  CONSTELLATION: "Constellation",
};

export const packageLabel: Record<PackageType, string> = {
  NONE: "Sin plan",
  FREE: "Free",
  STARTED: "Started",
  PRO: "Pro",
  FOUNDER: "Founder",
  CORPORATE: "Corporate",
  VEGA: "Free",
  POLARIS: "Started",
  LYRA_MASTER: "Pro",
};

export function canAccess(userRank: Rank, required: Rank) {
  return rankOrder[userRank] >= rankOrder[required];
}

export function rankBadge(rank: Rank): "default" | "violet" | "cyan" {
  if (rankOrder[rank] >= rankOrder.VEGA) return "cyan";
  if (rankOrder[rank] >= rankOrder.ALPHA) return "violet";
  return "default";
}

export function formatCredits(value: number) {
  return new Intl.NumberFormat("es-MX").format(value);
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
