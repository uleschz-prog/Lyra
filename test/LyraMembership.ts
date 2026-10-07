import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const USDC = 1_000_000n;

describe("LyraMembership", function () {
  async function deployFixture() {
    const [owner, treasury, root, child, grandchild] = await ethers.getSigners();
    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const membership = await ethers.deployContract("LyraMembership", [await usdc.getAddress(), treasury.address]);
    return { owner, treasury, root, child, grandchild, usdc, membership };
  }

  async function fund(usdc: Awaited<ReturnType<typeof deployFixture>>["usdc"], signer: { address: string }, membership: string, amount: bigint) {
    await usdc.mint(signer.address, amount);
    const connected = usdc.connect(signer as never);
    await connected.approve(membership, amount);
  }

  it("cobra Pro y aparta el 10% sin patrocinador", async function () {
    const { treasury, root, usdc, membership } = await deployFixture();
    const price = 249n * USDC;
    await fund(usdc, root, await membership.getAddress(), price);
    await membership.connect(root).buy(3, ethers.ZeroAddress);
    const poolMonth = await membership.calendarMonth(await networkHelpers.time.latest());
    expect(await membership.monthPool(poolMonth)).to.equal((price * 1000n) / 10000n);
    expect(await usdc.balanceOf(treasury.address)).to.equal(price - (price * 1000n) / 10000n);
    expect((await membership.accounts(root.address)).packageId).to.equal(3);
  });

  it("suelta Órbita al momento, solo hasta el nivel que cobra el patrocinador", async function () {
    const { treasury, root, child, usdc, membership } = await deployFixture();
    const address = await membership.getAddress();
    await fund(usdc, root, address, 29n * USDC);
    await membership.connect(root).buy(1, ethers.ZeroAddress);
    const treasuryAfterRoot = await usdc.balanceOf(treasury.address);

    await fund(usdc, child, address, 29n * USDC);
    const tx = await membership.connect(child).buy(1, root.address);
    await expect(tx).to.emit(membership, "OrbitPaid").withArgs(child.address, root.address, 1, (29n * USDC * 2000n) / 10000n);
    expect(await usdc.balanceOf(root.address)).to.equal((29n * USDC * 2000n) / 10000n);
    const childPrice = 29n * USDC;
    const pool = (childPrice * 1000n) / 10000n;
    const orbit = (childPrice * 2000n) / 10000n;
    expect(await usdc.balanceOf(treasury.address)).to.equal(treasuryAfterRoot + (childPrice - pool - orbit));
  });

  it("un Inicio no cobra el nivel 3", async function () {
    const { root, child, grandchild, usdc, membership } = await deployFixture();
    const address = await membership.getAddress();
    await fund(usdc, root, address, 29n * USDC);
    await membership.connect(root).buy(1, ethers.ZeroAddress);
    await fund(usdc, child, address, 29n * USDC);
    await membership.connect(child).buy(1, root.address);
    await fund(usdc, grandchild, address, 29n * USDC);
    const tx = await membership.connect(grandchild).buy(1, child.address);
    const receipt = await tx.wait();
    const orbit = receipt?.logs.filter((log) => {
      try {
        return membership.interface.parseLog(log)?.name === "OrbitPaid";
      } catch {
        return false;
      }
    });
    expect(orbit).to.have.length(2);
  });

  it("el 10% del mes se reparte entre los Pro que renovaron", async function () {
    const { treasury, root, usdc, membership } = await deployFixture();
    const address = await membership.getAddress();
    const start = (await networkHelpers.time.latest()) + 30;
    await networkHelpers.time.increaseTo(start);
    await fund(usdc, root, address, 249n * USDC);
    await membership.connect(root).buy(3, ethers.ZeroAddress);
    const buyPool = (249n * USDC * 1000n) / 10000n;

    await fund(usdc, root, address, 99n * USDC);
    await membership.connect(root).renew();
    const month = await membership.calendarMonth(start);
    expect(await membership.qualifierCount(month)).to.equal(1);
    expect(await membership.monthPool(month)).to.equal(buyPool + (99n * USDC * 1000n) / 10000n);

    await networkHelpers.time.increase(32 * 24 * 60 * 60);
    const treasuryBefore = await usdc.balanceOf(treasury.address);
    await membership.settleMonth(month);
    const pool = buyPool + (99n * USDC * 1000n) / 10000n;
    expect(await usdc.balanceOf(root.address)).to.equal(pool);
    expect(await usdc.balanceOf(treasury.address)).to.equal(treasuryBefore);
    await expect(membership.settleMonth(month)).to.be.revertedWithCustomError(membership, "MonthAlreadySettled");
  });

  it("conoce octubre de 2026", async function () {
    const { membership } = await deployFixture();
    const october = Math.floor(Date.UTC(2026, 9, 7, 12) / 1000);
    expect(await membership.calendarMonth(october)).to.equal(2026n * 12n + 9n);
  });
});
