import { createPublicClient, decodeEventLog, getAddress, http, isAddress } from "viem";
import { polygon } from "viem/chains";

import { getPackage, isSignupPlanId, type SignupPlanId } from "@/config/compensation-plan";
import { membershipAddress, membershipPackageId, polygonUsdcAddress } from "@/config/membership";
import { payCommissions } from "@/lib/compensation/payout";
import { activateMembership } from "@/lib/payments/activate";
import { lyraMembershipAbi } from "@/lib/payments/membership-abi";
import { getPrisma } from "@/lib/prisma";

const polygonRpc = process.env.NEXT_PUBLIC_POLYGON_RPC_URL?.trim() || "https://polygon-bor-rpc.publicnode.com";

export function polygonClient() {
  return createPublicClient({ chain: polygon, transport: http(polygonRpc) });
}

export async function confirmUsdcSignup(input: { userId: string; hash: string }) {
  const contract = membershipAddress();
  if (!isAddress(contract)) {
    return { ok: false as const, error: "El cobro en USDC todavía no está publicado en Polygon." };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.hash)) {
    return { ok: false as const, error: "El hash de la transacción no es válido." };
  }

  const prisma = getPrisma();
  const externalRef = `usdc:${input.hash.toLowerCase()}`;
  if (await prisma.transaction.findUnique({ where: { externalRef }, select: { id: true } })) {
    return { ok: true as const, already: true };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, sponsorId: true, pendingPackage: true, polygonWallet: true },
  });
  if (!user?.polygonWallet || !isAddress(user.polygonWallet)) {
    return { ok: false as const, error: "Primero vincula MetaMask." };
  }
  if (!user.pendingPackage || !isSignupPlanId(user.pendingPackage)) {
    return { ok: false as const, error: "Elige Inicio, Negocio o Pro antes de pagar." };
  }

  let receipt;
  try {
    receipt = await polygonClient().getTransactionReceipt({ hash: input.hash as `0x${string}` });
  } catch {
    return { ok: false as const, error: "Polygon todavía no tiene esa transacción." };
  }
  if (receipt.status !== "success") {
    return { ok: false as const, error: "Polygon no confirmó ese pago." };
  }
  if (getAddress(receipt.from) !== getAddress(user.polygonWallet)) {
    return { ok: false as const, error: "Ese pago no salió de la MetaMask vinculada." };
  }
  if (!receipt.to || getAddress(receipt.to) !== getAddress(contract)) {
    return { ok: false as const, error: "Ese pago no entró al contrato de LYRA." };
  }

  const plan = user.pendingPackage;
  const expectedPackage = membershipPackageId(plan);
  const expectedAmount = BigInt(Math.round(getPackage(plan).price * 1_000_000));
  let purchased = false;
  const paidWallets = new Set<string>();
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(contract)) continue;
    try {
      const decoded = decodeEventLog({ abi: lyraMembershipAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "Purchased") {
        const buyer = getAddress(decoded.args.buyer);
        if (buyer !== getAddress(user.polygonWallet) || decoded.args.renewal) continue;
        if (Number(decoded.args.packageId) !== expectedPackage || decoded.args.amount !== expectedAmount) {
          return { ok: false as const, error: "El monto en USDC no coincide con el paquete." };
        }
        purchased = true;
      }
      if (decoded.eventName === "OrbitPaid") {
        paidWallets.add(getAddress(decoded.args.sponsor).toLowerCase());
      }
    } catch {
      continue;
    }
  }
  if (!purchased) {
    return { ok: false as const, error: "No encontramos la compra de la membresía en esa transacción." };
  }

  const paidSponsors = await prisma.user.findMany({
    where: { polygonWallet: { in: [...paidWallets] } },
    select: { id: true },
  });
  const skipBalanceFor = new Set(paidSponsors.map((sponsor) => sponsor.id));

  await prisma.$transaction(async (tx) => {
    const activated = await activateMembership(tx, user, plan as SignupPlanId, {
      description: `Inscripción ${getPackage(plan).label} · USDC`,
      externalRef,
      skipCommissions: true,
    });
    if (!activated) return;
    await payCommissions(tx, { ...user, package: plan }, getPackage(plan).price, "purchase", { skipBalanceFor });
  });

  return { ok: true as const, already: false };
}
