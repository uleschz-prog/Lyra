import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const TEN_MINUTES = 600n;
const DEPOSIT = 1_000_000_000n;
const ETH_PRICE = 2_000_00000000n;
const WETH_UNIT = 10n ** 18n;
const MAX = 2n ** 256n - 1n;

describe("LyraAutonomousAgent", function () {
  async function deployFixture() {
    const [owner, other, pauser] = await ethers.getSigners();
    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const feed = await ethers.deployContract("MockV3Aggregator", [8, ETH_PRICE]);
    const agent = await ethers.deployContract("LyraAutonomousAgent", [
      await usdc.getAddress(),
      await feed.getAddress(),
      pauser.address,
      TEN_MINUTES,
      0n,
    ]);
    return { owner, other, pauser, usdc, feed, agent };
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

  async function openRichBook(env: Awaited<ReturnType<typeof deployFixture>>) {
    const fair = ETH_PRICE / 100n;
    const reserveUsdc = (fair * 110n) / 100n;
    await env.agent.setPool(reserveUsdc, WETH_UNIT);
    await env.agent.mintInventory(WETH_UNIT / 5n);
    await env.usdc.mint(env.owner.address, reserveUsdc);
    await env.usdc.connect(env.owner).approve(await env.agent.getAddress(), MAX);
  }

  it("el deposit mueve USDC al contrato y falla si no es el owner", async function () {
    const { owner, other, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();

    await usdc.mint(owner.address, DEPOSIT);
    await expect(agent.depositUSDC(DEPOSIT)).to.be.revertedWith("MockERC20: insufficient allowance");
    await expect(agent.depositUSDC(0)).to.be.revertedWith("zero amount");

    await usdc.mint(other.address, DEPOSIT);
    await usdc.connect(other).approve(agentAddress, DEPOSIT);
    await expect(agent.connect(other).depositUSDC(DEPOSIT)).to.be.revertedWithCustomError(agent, "NotOwner");

    await usdc.connect(owner).approve(agentAddress, DEPOSIT);
    await expect(agent.depositUSDC(DEPOSIT)).to.emit(agent, "Deposit").withArgs(owner.address, DEPOSIT);
    expect(await usdc.balanceOf(agentAddress)).to.equal(DEPOSIT);
    expect(await agent.owner()).to.equal(owner.address);
    expect(await agent.wethToken()).to.equal(agentAddress);
  });

  it("executeStrategy respeta el cooldown del constructor", async function () {
    const env = await networkHelpers.loadFixture(deployFixture);
    const { agent } = env;
    await openRichBook(env);

    const [tooSoon] = await agent.checker();
    expect(tooSoon).to.equal(false);
    await expect(agent.executeStrategy()).to.be.revertedWith("Cooldown active");

    const last = await agent.lastExecutionTime();
    await networkHelpers.time.increaseTo(last + TEN_MINUTES - 1n);
    expect((await agent.checker())[0]).to.equal(false);

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

  it("vende WETH cuando el libro está caro y el USDC que entra es real", async function () {
    const env = await networkHelpers.loadFixture(deployFixture);
    const { owner, usdc, agent } = env;
    const agentAddress = await agent.getAddress();
    await openRichBook(env);
    await usdc.mint(owner.address, DEPOSIT);
    await usdc.connect(owner).approve(agentAddress, MAX);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    const before = await usdc.balanceOf(agentAddress);
    const ownerBefore = await usdc.balanceOf(owner.address);
    const edge = await agent.tradingEdge();
    expect(edge).to.be.gt(0n);
    expect(edge).to.not.equal(before / 1000n);

    const tx = await agent.executeStrategy();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const after = await usdc.balanceOf(agentAddress);

    expect(after).to.be.gt(before);
    expect(await usdc.balanceOf(owner.address)).to.be.lt(ownerBefore);
    await expect(tx).to.emit(agent, "StrategyExecuted").withArgs(BigInt(block!.timestamp), "Venta", edge);
  });

  it("no anota ganancia si el libro está en el precio de Chainlink", async function () {
    const env = await networkHelpers.loadFixture(deployFixture);
    const { owner, usdc, agent } = env;
    const agentAddress = await agent.getAddress();
    const fair = ETH_PRICE / 100n;
    await agent.setPool(fair, WETH_UNIT);
    await agent.mintInventory(WETH_UNIT / 5n);
    await usdc.mint(owner.address, fair);
    await usdc.connect(owner).approve(agentAddress, MAX);
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    const before = await usdc.balanceOf(agentAddress);
    expect((await agent.checker())[0]).to.equal(false);
    expect(await agent.tradingEdge()).to.equal(0n);
    await expect(agent.executeStrategy()).to.be.revertedWith("no spread");
    expect(await usdc.balanceOf(agentAddress)).to.equal(before);
  });

  it("no vende si el libro está barato respecto a Chainlink", async function () {
    const env = await networkHelpers.loadFixture(deployFixture);
    const { owner, usdc, agent } = env;
    const agentAddress = await agent.getAddress();
    const fair = ETH_PRICE / 100n;
    await agent.setPool((fair * 80n) / 100n, WETH_UNIT);
    await agent.mintInventory(WETH_UNIT / 5n);
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    const before = await usdc.balanceOf(agentAddress);
    expect(await agent.tradingEdge()).to.equal(0n);
    await expect(agent.executeStrategy()).to.be.revertedWith("no spread");
    expect(await usdc.balanceOf(agentAddress)).to.equal(before);
  });

  it("el owner y el pauser pausan y reactivan; un extraño no", async function () {
    const env = await networkHelpers.loadFixture(deployFixture);
    const { owner, other, pauser, usdc, agent } = env;
    const agentAddress = await agent.getAddress();
    await openRichBook(env);
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    await expect(agent.connect(other).pauseAgent()).to.be.revertedWithCustomError(agent, "NotOperator");
    await expect(agent.connect(pauser).pauseAgent()).to.emit(agent, "Paused").withArgs(pauser.address);
    expect(await agent.paused()).to.equal(true);
    expect((await agent.checker())[0]).to.equal(false);
    await expect(agent.executeStrategy()).to.be.revertedWithCustomError(agent, "EnforcedPause");

    const balance = await usdc.balanceOf(agentAddress);
    await expect(agent.withdraw(balance)).to.emit(agent, "Withdraw").withArgs(owner.address, balance);

    await expect(agent.connect(other).resumeAgent()).to.be.revertedWithCustomError(agent, "NotOperator");
    await expect(agent.connect(owner).pauseAgent()).to.be.revertedWithCustomError(agent, "EnforcedPause");
    await expect(agent.resumeAgent()).to.emit(agent, "Unpaused").withArgs(owner.address);
    expect(await agent.paused()).to.equal(false);
    expect((await agent.checker())[0]).to.equal(true);
  });

  it("executeStrategy revierte si el precio de Chainlink está viejo o incompleto", async function () {
    const { owner, usdc, feed, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);
    await passCooldown(await agent.lastExecutionTime());

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await feed.setRound(ETH_PRICE, now - (3n * 60n * 60n) - 1n, 1, 1);
    expect((await agent.checker())[0]).to.equal(false);
    await expect(agent.executeStrategy()).to.be.revertedWith("stale price");

    await feed.setRound(-1n, now, 1, 1);
    await expect(agent.executeStrategy()).to.be.revertedWith("bad price");

    await feed.setRound(ETH_PRICE, now, 4, 3);
    await expect(agent.executeStrategy()).to.be.revertedWith("stale price");
  });

  it("el retiro solo lo hace el owner y no por encima del balance", async function () {
    const { owner, other, usdc, agent } = await networkHelpers.loadFixture(deployFixture);
    const agentAddress = await agent.getAddress();
    await fundAndApprove(usdc, owner, agentAddress, DEPOSIT);
    await agent.depositUSDC(DEPOSIT);

    const balance = await usdc.balanceOf(agentAddress);
    await expect(agent.withdraw(0)).to.be.revertedWith("zero amount");
    await expect(agent.connect(other).withdraw(balance)).to.be.revertedWithCustomError(agent, "NotOwner");
    await expect(agent.withdraw(balance + 1n)).to.be.revertedWith("insufficient balance");

    await expect(agent.withdraw(balance)).to.emit(agent, "Withdraw").withArgs(owner.address, balance);
    expect(await usdc.balanceOf(agentAddress)).to.equal(0n);
    expect(await usdc.balanceOf(owner.address)).to.equal(balance);
  });
});
