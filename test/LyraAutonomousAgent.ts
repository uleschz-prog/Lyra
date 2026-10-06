import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const TEN_MINUTES = 600n;
const PROFIT_BPS = 1000n;
const DEPOSIT = 1_000_000_000n; // 1000 USDC con 6 decimales

describe("LyraAutonomousAgent", function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();

    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const router = await ethers.deployContract("MockSwapRouter", [await usdc.getAddress(), PROFIT_BPS]);
    await usdc.mint(await router.getAddress(), ethers.parseUnits("1000000", 6));

    const price = 2_000_00000000n; // 2000 USD con 8 decimales
    const feed = await ethers.deployContract("MockV3Aggregator", [8, price]);

    const agent = await ethers.deployContract("LyraAutonomousAgent", [
      await usdc.getAddress(),
      await router.getAddress(),
      await feed.getAddress(),
    ]);

    return { owner, other, usdc, router, feed, agent };
  }

  async function fundAndApprove(
    usdc: Awaited<ReturnType<typeof deployFixture>>["usdc"],
    owner: Awaited<ReturnType<typeof deployFixture>>["owner"],
    agentAddress: string,
    amount: bigint,
  ) {
    await usdc.mint(owner.address, amount);
    await usdc.connect(owner).approve(agentAddress, amount);
  }

  async function passCooldown(lastExecutionTime: bigint) {
    await networkHelpers.time.increaseTo(lastExecutionTime + TEN_MINUTES + 1n);
  }

  it("el deposit mueve USDC al contrato y falla si no es el owner", async function () {
    const { owner, other, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();

    await usdc.mint(owner.address, DEPOSIT);
    await expect(agent.depositUSDC(DEPOSIT)).to.be.revertedWith("MockERC20: insufficient allowance");
    await expect(agent.depositUSDC(0)).to.be.revertedWith("LyraAutonomousAgent: zero amount");

    await usdc.mint(other.address, DEPOSIT);
    await usdc.connect(other).approve(agentAddress, DEPOSIT);
    await expect(agent.connect(other).depositUSDC(DEPOSIT)).to.be.revertedWith("LyraAutonomousAgent: not owner");

    await usdc.connect(owner).approve(agentAddress, DEPOSIT);
    await expect(agent.depositUSDC(DEPOSIT)).to.emit(agent, "Deposit").withArgs(owner.address, DEPOSIT);
    expect(await usdc.balanceOf(agentAddress)).to.equal(DEPOSIT);
    expect(await agent.owner()).to.equal(owner.address);
  });

  it("executeStrategy respeta un cooldown de 10 minutos", async function () {
    const { owner, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);

    const [tooSoon] = await agent.checker();
    expect(tooSoon).to.equal(false);
    await expect(agent.executeStrategy()).to.be.revertedWith("LyraAutonomousAgent: cooldown");

    const last = await agent.lastExecutionTime();
    await networkHelpers.time.increaseTo(last + TEN_MINUTES);
    const [atExact] = await agent.checker();
    expect(atExact).to.equal(false);

    await passCooldown(last);
    const [canExec, payload] = await agent.checker();
    expect(canExec).to.equal(true);
    expect(payload).to.equal(agent.interface.encodeFunctionData("executeStrategy"));
  });

  it("executeStrategy revierte si no hay saldo", async function () {
    const { agent } = await networkHelpers.loadFixture(deployFixture);
    await passCooldown(await agent.lastExecutionTime());
    await expect(agent.executeStrategy()).to.be.revertedWith("LyraAutonomousAgent: no balance");
  });

  it("executeStrategy hace el swap simulado, aumenta el saldo y emite StrategyExecuted", async function () {
    const { owner, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    const amountOut = DEPOSIT + (DEPOSIT * PROFIT_BPS) / 10_000n;
    const tx = await agent.executeStrategy();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);

    await expect(tx)
      .to.emit(agent, "StrategyExecuted")
      .withArgs(agentAddress, "BUY", "ETH", DEPOSIT, amountOut, BigInt(block!.timestamp));

    expect(await usdc.balanceOf(agentAddress)).to.equal(amountOut);
    expect(amountOut).to.be.greaterThan(DEPOSIT);
    expect(await agent.lastEthPrice()).to.equal(2_000_00000000n);

    const [readPrice, decimals, updatedAt] = await agent.latestEthUsd();
    expect(readPrice).to.equal(2_000_00000000n);
    expect(decimals).to.equal(8);
    expect(updatedAt).to.be.greaterThan(0n);
  });

  it("executeStrategy revierte si el precio de Chainlink está viejo o incompleto", async function () {
    const { owner, usdc, feed, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await feed.setRound(2_000_00000000n, now - (3n * 60n * 60n) - 1n, 1, 1);
    const [stale] = await agent.checker();
    expect(stale).to.equal(false);
    await expect(agent.executeStrategy()).to.be.revertedWith("LyraAutonomousAgent: stale price");

    await feed.setRound(-1n, now, 1, 1);
    await expect(agent.latestEthUsd()).to.be.revertedWith("LyraAutonomousAgent: stale price");

    await feed.setRound(2_000_00000000n, now, 4, 3);
    await expect(agent.executeStrategy()).to.be.revertedWith("LyraAutonomousAgent: stale price");
  });

  it("el retiro solo lo hace el owner y no por encima del balance", async function () {
    const { owner, other, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());
    await agent.executeStrategy();

    const balance = await usdc.balanceOf(agentAddress);
    await expect(agent.withdraw(0)).to.be.revertedWith("LyraAutonomousAgent: zero amount");
    await expect(agent.connect(other).withdraw(balance)).to.be.revertedWith("LyraAutonomousAgent: not owner");
    await expect(agent.withdraw(balance + 1n)).to.be.revertedWith("LyraAutonomousAgent: insufficient balance");

    await expect(agent.withdraw(balance)).to.emit(agent, "Withdraw").withArgs(owner.address, balance);
    expect(await usdc.balanceOf(agentAddress)).to.equal(0n);
    expect(await usdc.balanceOf(owner.address)).to.equal(balance);
  });
});
