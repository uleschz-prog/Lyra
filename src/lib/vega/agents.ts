import { getPrisma } from "@/lib/prisma";

export async function ensureDefaultVegaAgent(userId: string) {
  return getPrisma().vegaAgent.upsert({
    where: { defaultKey: userId },
    create: { userId, defaultKey: userId, name: "Vega", specialty: "Asistente general", isDefault: true },
    update: {},
    select: { id: true, name: true, specialty: true, instructions: true, avatar: true, isDefault: true },
  });
}
