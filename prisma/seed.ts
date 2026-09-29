import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const rootPassword = "Lyra2026!Admin";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: "admin@lyrahub.ai" } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: "LyraMaster",
        package: "CORPORATE",
        role: "ADMIN",
        isSubscriptionExempt: true,
        ...(existing.package === "CORPORATE" ? {} : { activationCredits: 5000 }),
      },
    });
    return;
  }

  const password = await bcrypt.hash(rootPassword, 12);

  await prisma.user.create({
    data: {
      name: "LyraMaster",
      email: "admin@lyrahub.ai",
      username: "lyra-root",
      password,
      role: "ADMIN",
      package: "CORPORATE",
      activationCredits: 5000,
      rank: "CONSTELLATION",
      referralCode: "LYRA-ROOT",
      credits: 0,
      walletBalance: 0,
      isSubscriptionExempt: true,
      wallet: {
        create: {
          balance: 0,
          totalEarnedCommissions: 0,
        },
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
