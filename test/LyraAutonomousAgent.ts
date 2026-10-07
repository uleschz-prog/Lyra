import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const TEN_MINUTES = 600n;
const DEPOSIT = 1_000_000_000n; // 1000 USDC con 6 decimales
const ETH_PRICE = 2_000_00000000n; // 2000 USD con 8 decimales

describe("LyraAutonomousAgent", function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();

    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const feed = await ethers.deployContract("MockV3Aggregator", [8, ETH_PRICE]);
    const agent = await ethers.deployContract("LyraAutonomousAgent", [
      await usdc.getAddress(),
      await feed.getAddress(),
      TEN_MINUTES,
    ]);

    return { owner, other, usdc, feed, agent };
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
    await networkHelpers.time.increaseTo(lastExecutionTime + TEN_MINUTES);
  }

  it("el deposit mueve USDC al contrato y falla si no es el owner", async function () {
    const { owner, other, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();

    await usdc.mint(owner.address, DEPOSIT);
    await expect(agent.depositUSDC(DEPOSIT)).to.be.revertedWith("MockERC20: insufficient allowance");
    await expect(agent.depositUSDC(0)).to.be.revertedWith("LyraAutonomousAgent: zero amount");

    await usdc.mint(other.address, DEPOSIT);
    await usdc.connect(other).approve(agentAddress, DEPOSIT);
    await expect(agent.connect(other).depositUSDC(DEPOSIT))
      .to.be.revertedWithCustomError(agent, "OwnableUnauthorizedAccount")
      .withArgs(other.address);

    await usdc.connect(owner).approve(agentAddress, DEPOSIT);
    await expect(agent.depositUSDC(DEPOSIT)).to.emit(agent, "Deposit").withArgs(owner.address, DEPOSIT);
    expect(await usdc.balanceOf(agentAddress)).to.equal(DEPOSIT);
    expect(await agent.owner()).to.equal(owner.address);
  });

  it("executeStrategy respeta el cooldown del constructor", async function () {
    const { owner, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);

    const [tooSoon] = await agent.checker();
    expect(tooSoon).to.equal(false);
    await expect(agent.executeStrategy()).to.be.revertedWith("Cooldown active");

    const last = await agent.lastExecutionTime();
    await networkHelpers.time.increaseTo(last + TEN_MINUTES - 1n);
    const [almost] = await agent.checker();
    expect(almost).to.equal(false);

    await passCooldown(last);
    const [canExec, payload] = await agent.checker();
    expect(canExec).to.equal(true);
    expect(payload).to.equal(agent.interface.encodeFunctionData("executeStrategy"));
  });

  it("executeStrategy revierte si no hay saldo", async function () {
    const { agent } = await networkHelpers.loadFixture(deployFixture);
    await passCooldown(await agent.lastExecutionTime());
    await expect(agent.executeStrategy()).to.be.revertedWith("No funds to operate");
  });

  it("getLatestPrice devuelve el feed y executeStrategy registra el 0.1 % sin mover USDC", async function () {
    const { owner, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    expect(await agent.getLatestPrice()).to.equal(ETH_PRICE);

    const profit = DEPOSIT / 1000n;
    const tx = await agent.executeStrategy();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);

    await expect(tx)
      .to.emit(agent, "StrategyExecuted")
      .withArgs(BigInt(block!.timestamp), "PROFIT_CAPTURED", profit);

    expect(await usdc.balanceOf(agentAddress)).to.equal(DEPOSIT);
    expect(await agent.tradeCount()).to.equal(1n);
    const log = await agent.tradeHistory(0);
    expect(log.action).to.equal("ARB_TRADE");
    expect(log.amount).to.equal(profit);
    expect(log.status).to.equal("SUCCESS");
  });

  it("executeStrategy revierte si el precio de Chainlink está viejo o incompleto", async function () {
    const { owner, usdc, feed, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await feed.setRound(ETH_PRICE, now - (3n * 60n * 60n) - 1n, 1, 1);
    const [stale] = await agent.checker();
    expect(stale).to.equal(false);
    await expect(agent.executeStrategy()).to.be.revertedWith("LyraAutonomousAgent: stale price");

    await feed.setRound(-1n, now, 1, 1);
    await expect(agent.executeStrategy()).to.be.revertedWith("LyraAutonomousAgent: bad price");

    await feed.setRound(ETH_PRICE, now, 4, 3);
    await expect(agent.executeStrategy()).to.be.revertedWith("LyraAutonomousAgent: stale price");
  });

  it("el retiro solo lo hace el owner y no por encima del balance", async function () {
    const { owner, other, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);

    const balance = await usdc.balanceOf(agentAddress);
    await expect(agent.withdraw(0)).to.be.revertedWith("LyraAutonomousAgent: zero amount");
    await expect(agent.connect(other).withdraw(balance))
      .to.be.revertedWithCustomError(agent, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(agent.withdraw(balance + 1n)).to.be.revertedWith("LyraAutonomousAgent: insufficient balance");

    await expect(agent.withdraw(balance)).to.emit(agent, "Withdraw").withArgs(owner.address, balance);
    expect(await usdc.balanceOf(agentAddress)).to.equal(0n);
    expect(await usdc.balanceOf(owner.address)).to.equal(balance);
  });
});
