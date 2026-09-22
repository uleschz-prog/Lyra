import type { Rank } from "@/lib/types";

const rankOrder: Record<Rank, number> = {
  SOCIO: 0,
  LIDER: 1,
  MAESTRO: 2,
};

export const rankLabel: Record<Rank, string> = {
  SOCIO: "Socio",
  LIDER: "Líder",
  MAESTRO: "Maestro",
};

export function canAccess(userRank: Rank, required: Rank) {
  return rankOrder[userRank] >= rankOrder[required];
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
