import { constellationAgents } from "@/config/constellation";
import type { Course, DemoUser, NetworkNode, WalletTransaction } from "@/lib/types";

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
    description: "Plan Started · 1,500 créditos",
    amountUsd: 99,
    creditDelta: 1500,
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

export const agents = constellationAgents;

export const courses: Course[] = [
  {
    id: "crs_fundamentos",
    title: "Fundamentos de la red",
    description:
      "Cómo se lee un árbol, qué significa cada rango y cómo presentar LYRA sin improvisar.",
    videoUrl: "lyra://academy/fundamentos/intro",
    rankRequirement: "ASTRA",
    lessons: [
      {
        id: "les_fund_1",
        title: "El mapa de la red",
        description: "Sponsor, directos y profundidad. La lectura mínima antes de invitar.",
        videoUrl: "lyra://academy/fundamentos/mapa",
        rankRequirement: "ASTRA",
        completed: true,
      },
      {
        id: "les_fund_2",
        title: "Rangos y acceso",
        description: "Started $99, Pro $499 y Founder $1,000. Un crédito equivale a $1.",
        videoUrl: "lyra://academy/fundamentos/rangos",
        rankRequirement: "ASTRA",
        completed: true,
      },
      {
        id: "les_fund_3",
        title: "La primera conversación",
        description: "Estructura de tres minutos para presentar la academia y el estudio.",
        videoUrl: "lyra://academy/fundamentos/conversacion",
        rankRequirement: "ASTRA",
        completed: false,
      },
    ],
  },
  {
    id: "crs_prospeccion",
    title: "Prospección con agentes",
    description:
      "Usa el Estudio IA para preparar mensajes y deja el criterio de la conversación en tus manos.",
    videoUrl: "lyra://academy/prospeccion/intro",
    rankRequirement: "ASTRA",
    lessons: [
      {
        id: "les_pros_1",
        title: "Brief para el Prospector",
        description: "Qué contexto sí sirve y qué ruido no debes pegar en el chat.",
        videoUrl: "lyra://academy/prospeccion/brief",
        rankRequirement: "ASTRA",
        completed: true,
      },
      {
        id: "les_pros_2",
        title: "Créditos y criterio",
        description: "Cuándo vale la consulta y cuándo conviene escribirlo tú.",
        videoUrl: "lyra://academy/prospeccion/creditos",
        rankRequirement: "ASTRA",
        completed: false,
      },
      {
        id: "les_pros_3",
        title: "Seguimiento de 48 horas",
        description: "Qué hacer después del primer mensaje si no hay respuesta.",
        videoUrl: "lyra://academy/prospeccion/seguimiento",
        rankRequirement: "ASTRA",
        completed: false,
      },
    ],
  },
  {
    id: "crs_liderazgo",
    title: "Liderazgo de equipos",
    description:
      "Ritmo semanal para acompañar directos sin convertir el grupo en un tablero de presión.",
    videoUrl: "lyra://academy/liderazgo/intro",
    rankRequirement: "ALPHA",
    lessons: [
      {
        id: "les_lid_1",
        title: "La reunión de línea",
        description: "Agenda de 25 minutos: academia, bloqueos y un solo compromiso.",
        videoUrl: "lyra://academy/liderazgo/reunion",
        rankRequirement: "ALPHA",
        completed: true,
      },
      {
        id: "les_lid_2",
        title: "Leer el árbol",
        description: "Dónde hay actividad y dónde hace falta presencia.",
        videoUrl: "lyra://academy/liderazgo/arbol",
        rankRequirement: "ALPHA",
        completed: false,
      },
      {
        id: "les_lid_3",
        title: "Duplicar sin guion rígido",
        description: "Qué se transfiere a un socio nuevo y qué queda en tu criterio.",
        videoUrl: "lyra://academy/liderazgo/duplicar",
        rankRequirement: "ALPHA",
        completed: false,
      },
    ],
  },
  {
    id: "crs_maestria",
    title: "Mesa de maestros",
    description:
      "Diseño de sistemas de equipo, compensación y formación de líderes de líderes.",
    videoUrl: "lyra://academy/maestria/intro",
    rankRequirement: "VEGA",
    lessons: [
      {
        id: "les_mae_1",
        title: "Arquitectura del equipo",
        description: "Cómo repartir mentoría cuando la línea ya tiene varios líderes.",
        videoUrl: "lyra://academy/maestria/arquitectura",
        rankRequirement: "VEGA",
        completed: false,
      },
      {
        id: "les_mae_2",
        title: "Comisiones y narrativa",
        description: "Explicar el dinero con precisión, sin convertirlo en la promesa.",
        videoUrl: "lyra://academy/maestria/comisiones",
        rankRequirement: "VEGA",
        completed: false,
      },
      {
        id: "les_mae_3",
        title: "Formar formadores",
        description: "El paso de operador a quien enseña el sistema completo.",
        videoUrl: "lyra://academy/maestria/formadores",
        rankRequirement: "VEGA",
        completed: false,
      },
    ],
  },
];

export function countDirectAffiliates(node: NetworkNode = networkTree) {
  return node.children.length;
}
