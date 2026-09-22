export type Role = "MEMBER" | "ADMIN";
export type Rank = "SOCIO" | "LIDER" | "MAESTRO";
export type TransactionKind =
  | "COMMISSION"
  | "CREDIT_PURCHASE"
  | "CREDIT_SPEND"
  | "ADJUSTMENT";

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: Role;
  rank: Rank;
  sponsorId: string | null;
};

export type WalletTransaction = {
  id: string;
  description: string;
  amountUsd: number;
  creditDelta: number;
  kind: TransactionKind;
  createdAt: string;
};

export type NetworkNode = {
  id: string;
  name: string;
  email: string;
  rank: Rank;
  depth: number;
  personalVolume: number;
  sponsorName: string;
  children: NetworkNode[];
};

export type Lesson = {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  rankRequirement: Rank;
  completed: boolean;
};

export type Course = {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  rankRequirement: Rank;
  lessons: Lesson[];
};

export type DemoAgent = {
  id: string;
  name: string;
  description: string;
  category: string;
  promptTemplate: string;
  creditCost: number;
  uses: number;
};
