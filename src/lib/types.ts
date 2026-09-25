export type Role = "ADMIN" | "MEMBER";
export type PackageType = "NONE" | "FREE" | "STARTED" | "PRO" | "FOUNDER" | "CORPORATE" | "VEGA" | "POLARIS" | "LYRA_MASTER";
export type Rank = "ASTRA" | "NOVA" | "ALPHA" | "PULSAR" | "VEGA" | "CONSTELLATION";

export type AuthProfile = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  package: PackageType;
  rank: Rank;
  sponsorId: string | null;
  referralCode: string;
  credits: number;
  walletBalance: number;
  isSubscriptionExempt: boolean;
  alphaFastTrackUntil: string | null;
  fastTrack: boolean;
  activeDirects: number;
  rebuyPaidThisMonth: boolean;
  activationCredits: number;
  pendingPackage: string | null;
  avatar: string | null;
};
export type TransactionKind =
  | "COMMISSION"
  | "CREDIT_PURCHASE"
  | "CREDIT_SPEND"
  | "ADJUSTMENT"
  | "REBUY"
  | "CREDIT_REFUND";

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

export type ChannelId =
  | "whatsapp"
  | "email"
  | "telegram"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "messenger"
  | "sms"
  | "web"
  | "calendar";

export type DemoAgent = {
  id: string;
  name: string;
  star: string;
  description: string;
  category: string;
  promptTemplate: string;
  creditCost: number;
  uses: number;
  channels: ChannelId[];
};
