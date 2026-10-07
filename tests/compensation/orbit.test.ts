import { describe, expect, it } from "vitest";

import { getPackage, signupPlans } from "@/config/compensation-plan";
import { distributeSale, estimateInvitationEarnings, monthlyClose, roundMoney, type CompensationMember } from "@/lib/compensation/engine";

function member(
  id: string,
  sponsorId: string | null,
  packageId: CompensationMember["packageId"],
  status: CompensationMember["status"] = "ACTIVE",
): CompensationMember {
  return { id, name: id, sponsorId, status, packageId, personalVolume: 0, renewalUsd: 0, creditPurchaseUsd: 0 };
}

function chain(packageId: CompensationMember["packageId"], status: CompensationMember["status"] = "ACTIVE") {
  const ids = ["l1", "l2", "l3", "l4", "l5", "l6"];
  return [
    member("buyer", "l1", "STARTED"),
    ...ids.map((id, index) => member(id, ids[index + 1] ?? null, packageId, status)),
  ];
}

describe("bono órbita", () => {
  it("vende Inicio, Negocio y Pro con los créditos y el precio nuevos", () => {
    expect(signupPlans.map((plan) => plan.id)).toEqual(["STARTED", "PRO", "FOUNDER"]);
    expect(getPackage("STARTED")).toMatchObject({ price: 29, credits: 150, levels: 2 });
    expect(getPackage("PRO")).toMatchObject({ price: 99, credits: 300, levels: 4 });
    expect(getPackage("FOUNDER")).toMatchObject({ price: 249, credits: 1000, levels: 6 });
    expect(signupPlans.every((plan) => plan.points.includes("Todos los agentes, canales y servicios"))).toBe(true);
  });

  it("paga 20, 10 y 5 por ciento hasta sumar 50 en seis niveles Pro", () => {
    const lines = distributeSale(chain("FOUNDER"), "buyer", 100, "purchase");
    expect(lines.map((line) => line.amount)).toEqual([20, 10, 5, 5, 5, 5]);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(50);
    expect(lines.every((line) => line.bonus === "orbita" && line.paid)).toBe(true);
  });

  it("paga lo mismo en una recarga de créditos que en el paquete", () => {
    const purchase = distributeSale(chain("FOUNDER"), "buyer", 49, "purchase");
    const rebuy = distributeSale(chain("FOUNDER"), "buyer", 49, "rebuy");
    expect(rebuy.map((line) => line.amount)).toEqual(purchase.map((line) => line.amount));
    expect(rebuy.map((line) => line.amount)).toEqual([9.8, 4.9, 2.45, 2.45, 2.45, 2.45]);
  });

  it("Inicio cobra dos niveles y Negocio cuatro", () => {
    expect(distributeSale(chain("STARTED"), "buyer", 100, "purchase").map((line) => line.amount)).toEqual([
      20, 10, 0, 0, 0, 0,
    ]);
    expect(distributeSale(chain("PRO"), "buyer", 100, "rebuy").map((line) => line.amount)).toEqual([
      20, 10, 5, 5, 0, 0,
    ]);
  });

  it("una cuenta Corporate retirada cobra los seis niveles", () => {
    const lines = distributeSale(chain("CORPORATE"), "buyer", 100, "purchase");
    expect(lines.every((line) => line.paid)).toBe(true);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(50);
  });

  it("no paga a un patrocinador inactivo ni un monto vacío", () => {
    const lines = distributeSale(chain("FOUNDER", "INACTIVE"), "buyer", 100, "purchase");
    expect(lines.every((line) => line.amount === 0 && line.paid === false)).toBe(true);
    expect(distributeSale(chain("FOUNDER"), "buyer", 0, "rebuy")).toEqual([]);
  });

  it("estima la venta y la recarga según la profundidad del paquete", () => {
    const inicio = estimateInvitationEarnings({
      directs: 1,
      invitesEach: 1,
      salePackageId: "STARTED",
      earnerPackageId: "STARTED",
    });
    expect(inicio.levels.map((level) => level.packageUsd)).toEqual([5.8, 2.9, 0, 0, 0, 0]);
    expect(inicio.earnerShare).toBe(0.3);

    const pro = estimateInvitationEarnings({
      directs: 2,
      invitesEach: 3,
      salePackageId: "STARTED",
      earnerPackageId: "FOUNDER",
    });
    expect(pro.levels.every((level) => level.active)).toBe(true);
    expect(pro.level1).toBe(11.6);
    expect(pro.level2).toBe(17.4);
    expect(pro.levels[2]?.packageUsd).toBe(1.45);
    expect(pro.packageTotal).toBe(14.5);
    expect(pro.rebuyTotal).toBe(9.5);
  });

  it("el cierre mensual reparte el 10% entre los Pro que renovaron con 99", () => {
    const members: CompensationMember[] = [
      { ...member("ana", null, "FOUNDER"), personalVolume: 249, renewalUsd: 99 },
      { ...member("beto", null, "FOUNDER"), personalVolume: 249, renewalUsd: 0 },
      { ...member("cata", null, "LYRA_MASTER"), personalVolume: 99, renewalUsd: 99 },
      { ...member("dani", null, "PRO"), personalVolume: 99, renewalUsd: 99 },
      { ...member("eva", null, "CORPORATE"), personalVolume: 99, renewalUsd: 99 },
      { ...member("fran", null, "STARTED"), personalVolume: 29, renewalUsd: 19, creditPurchaseUsd: 19 },
    ];
    const closed = monthlyClose(members);
    expect(closed.sales).toBe(843);
    expect(closed.pool).toBe(84.3);
    expect(closed.shares).toBe(2);
    expect(closed.payouts.map((payout) => payout.userId)).toEqual(["ana", "cata"]);
    expect(closed.payouts.map((payout) => payout.poolPayout)).toEqual([42.15, 42.15]);
    expect(closed.payouts.every((payout) => payout.rankPayout === 0)).toBe(true);
  });

  it("un Pro activo sin la renovación de 99 no cobra el bono mundial", () => {
    const members = [
      { ...member("pro", null, "FOUNDER", "ACTIVE"), personalVolume: 1000, renewalUsd: 98 },
      { ...member("otro", null, "STARTED"), personalVolume: 0, renewalUsd: 0 },
    ];
    const closed = monthlyClose(members);
    expect(closed.pool).toBe(100);
    expect(closed.payouts).toEqual([]);
    expect(closed.shares).toBe(0);
  });

  it("reparte los centavos del fondo sin dejar un resto", () => {
    const members = ["a", "b", "c"].map((id) => ({
      ...member(id, null, "FOUNDER"),
      personalVolume: 10 / 3,
      renewalUsd: 99,
    }));
    const closed = monthlyClose(members);
    const paid = closed.payouts.reduce((sum, payout) => sum + payout.poolPayout, 0);
    expect(closed.pool).toBe(1);
    expect(roundMoney(paid)).toBe(1);
    expect(closed.payouts.map((payout) => payout.poolPayout).sort((left, right) => right - left)).toEqual([
      0.34, 0.33, 0.33,
    ]);
  });
});
