import type { DemoUser, NetworkNode, WalletTransaction } from "@/lib/types";

export const demoUser: DemoUser = {
  id: "usr_elena",
  name: "Elena Voss",
  email: "elena.voss@lyra.app",
  avatar: null,
  role: "MEMBER",
  rank: "ALPHA",
  sponsorId: "usr_aurora",
};

export const demoTransactions: WalletTransaction[] = [
  {
    id: "txn_commission_week",
    description: "Comisión de equipo · semana 37",
    amountUsd: 640,
    creditDelta: 0,
    kind: "COMMISSION",
    createdAt: "2026-09-15T15:00:00.000Z",
  },
  {
    id: "txn_credit_pack",
    description: "Plan Negocio · 300 créditos",
    amountUsd: 99,
    creditDelta: 300,
    kind: "CREDIT_PURCHASE",
    createdAt: "2026-09-12T18:30:00.000Z",
  },
  {
    id: "txn_direct",
    description: "Comisión directa · Sofía Chen",
    amountUsd: 180,
    creditDelta: 0,
    kind: "COMMISSION",
    createdAt: "2026-09-08T11:10:00.000Z",
  },
  {
    id: "txn_copy",
    description: "Agente Copywriter · secuencia de historias",
    amountUsd: 0,
    creditDelta: -8,
    kind: "CREDIT_SPEND",
    createdAt: "2026-09-06T09:40:00.000Z",
  },
];

export const demoWallet = {
  balance: 1280,
  totalEarnedCommissions: 4820.5,
  transactions: demoTransactions,
};

export const networkTree: NetworkNode = {
  id: demoUser.id,
  name: demoUser.name,
  email: demoUser.email,
  rank: demoUser.rank,
  depth: 0,
  personalVolume: 1840,
  sponsorName: "Aurora Keene",
  children: [
    {
      id: "usr_mateo",
      name: "Mateo Ruiz",
      email: "mateo.ruiz@lyra.app",
      rank: "ASTRA",
      depth: 1,
      personalVolume: 420,
      sponsorName: "Elena Voss",
      children: [
        {
          id: "usr_ana",
          name: "Ana Sol",
          email: "ana.sol@lyra.app",
          rank: "ASTRA",
          depth: 2,
          personalVolume: 160,
          sponsorName: "Mateo Ruiz",
          children: [],
        },
        {
          id: "usr_leo",
          name: "Leo Kim",
          email: "leo.kim@lyra.app",
          rank: "ASTRA",
          depth: 2,
          personalVolume: 90,
          sponsorName: "Mateo Ruiz",
          children: [],
        },
      ],
    },
    {
      id: "usr_sofia",
      name: "Sofía Chen",
      email: "sofia.chen@lyra.app",
      rank: "ALPHA",
      depth: 1,
      personalVolume: 980,
      sponsorName: "Elena Voss",
      children: [
        {
          id: "usr_nora",
          name: "Nora Díaz",
          email: "nora.diaz@lyra.app",
          rank: "ASTRA",
          depth: 2,
          personalVolume: 240,
          sponsorName: "Sofía Chen",
          children: [],
        },
      ],
    },
    {
      id: "usr_ivan",
      name: "Iván Hale",
      email: "ivan.hale@lyra.app",
      rank: "ASTRA",
      depth: 1,
      personalVolume: 310,
      sponsorName: "Elena Voss",
      children: [],
    },
    {
      id: "usr_lina",
      name: "Lina Ortega",
      email: "lina.ortega@lyra.app",
      rank: "VEGA",
      depth: 1,
      personalVolume: 2120,
      sponsorName: "Elena Voss",
      children: [
        {
          id: "usr_gael",
          name: "Gael Mora",
          email: "gael.mora@lyra.app",
          rank: "ALPHA",
          depth: 2,
          personalVolume: 760,
          sponsorName: "Lina Ortega",
          children: [],
        },
      ],
    },
  ],
};

export function countDirectAffiliates(node: NetworkNode = networkTree) {
  return node.children.length;
}
