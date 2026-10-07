import { writeFileSync } from "node:fs";

import { network } from "hardhat";

import { AMOY_ETH_USD_FEED, POLYGON_ETH_USD_FEED } from "../config/price-feeds.js";

const DEFAULT_USDC = "0x367220DC34967Ae19e4B904aCF572fB1eC6eB3CD";
const PREVIOUS_AGENT = "0x3C50c13B237F1c6c8fA43a399dCa321e7D4aD17F";

const { ethers, networkName } = await network.create();

let usdcAddress = process.env.AMOY_USDC_ADDRESS?.trim() || DEFAULT_USDC;
if (networkName === "polygonMainnet") {
  usdcAddress = process.env.MAINNET_USDC_ADDRESS?.trim() ?? "";
  if (!usdcAddress) throw new Error("polygonMainnet necesita MAINNET_USDC_ADDRESS.");
} else if (networkName !== "polygonAmoy") {
  throw new Error("Este script despliega en polygonAmoy o polygonMainnet. Para una red local usa npm run deploy:autonomous:local.");
}

const defaultFeed = networkName === "polygonMainnet" ? POLYGON_ETH_USD_FEED : AMOY_ETH_USD_FEED;
const priceFeedAddress = process.env.ETH_USD_PRICE_FEED?.trim() || defaultFeed;
const cooldown = BigInt(process.env.EXECUTION_COOLDOWN?.trim() || "300");
const pauser = process.env.LYRA_KEEPER_ADDRESS?.trim() || "";
if (!pauser) throw new Error("Falta LYRA_KEEPER_ADDRESS. Esa cuenta podrá pausar y activar, no retirar.");

const [deployer] = await ethers.getSigners();
const usdc = ethers.getAddress(usdcAddress);
const feed = ethers.getAddress(priceFeedAddress);
const pauserAddress = ethers.getAddress(pauser);

console.log("Desplegando agente con intercambio real...");
console.log(`Red: ${networkName}`);
console.log(`Deployer: ${deployer.address}`);
console.log(`USDC: ${usdc}`);
console.log(`ETH/USD: ${feed}`);
console.log(`Pauser: ${pauserAddress}`);
console.log(`Cooldown: ${cooldown.toString()} s`);

const factory = await ethers.getContractFactory("LyraAutonomousAgent");
const inventoryWeth = (10n ** 17n) * 2n;
const unsigned = await factory.getDeployTransaction(usdc, feed, pauserAddress, cooldown, inventoryWeth);
const gas = await ethers.provider.estimateGas({ ...unsigned, from: deployer.address });
const tip = 25_000_000_000n;
const overrides = { maxFeePerGas: tip, maxPriorityFeePerGas: tip };
const approveGas = 52_000n;
const deployGas = gas + 5_000n;
const balance = await ethers.provider.getBalance(deployer.address);
console.log(`Gas estimado: ${gas.toString()}`);
console.log(`POL: ${balance.toString()}`);
if (balance < approveGas * tip + deployGas * tip) {
  throw new Error("No hay POL suficiente para aprobar el libro y desplegar.");
}

const nonce = await deployer.getNonce();
const predicted = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 1 });
const token = await ethers.getContractAt("MockERC20", usdc);
const priceFeed = new ethers.Contract(
  feed,
  [
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
    "function decimals() view returns (uint8)",
  ],
  ethers.provider,
);
const round = await priceFeed.latestRoundData();
const price = round[1];
const decimals = BigInt(await priceFeed.decimals());
const fair = (price * 1_000_000n) / 10n ** decimals;
if (fair <= 0n) throw new Error("Chainlink devolvió un precio vacío.");
const usdcReserve = (fair * 120n) / 100n;

const keeperKey = process.env.LYRA_KEEPER_PRIVATE_KEY?.trim();
if (!keeperKey) throw new Error("Falta la llave del pauser para fondear el libro.");
const keeper = new ethers.Wallet(keeperKey, ethers.provider);
await (await token.connect(keeper).mint(deployer.address, usdcReserve, overrides)).wait();

await (await token.approve(predicted, ethers.MaxUint256, { ...overrides, gasLimit: approveGas })).wait();
const agent = await ethers.deployContract(
  "LyraAutonomousAgent",
  [usdc, feed, pauserAddress, cooldown, inventoryWeth],
  { ...overrides, gasLimit: deployGas },
);
await agent.waitForDeployment();
const address = await agent.getAddress();
if (address.toLowerCase() !== predicted.toLowerCase()) {
  throw new Error("La dirección desplegada no coincidió con la aprobación.");
}
console.log(`Contrato desplegado en: ${address}`);

if (networkName === "polygonAmoy") {
  const previous = process.env.PREVIOUS_AGENT_ADDRESS?.trim() || PREVIOUS_AGENT;
  const old = new ethers.Contract(previous, ["function withdraw(uint256 amount)"], deployer);
  const left = await ethers.provider.getBalance(deployer.address);
  const moveGas = 180_000n;
  try {
    const oldBalance = await token.balanceOf(previous);
    if (oldBalance > 0n && left > moveGas * tip) {
      await (await old.withdraw(oldBalance, overrides)).wait();
      await (await agent.depositUSDC(oldBalance, overrides)).wait();
      console.log(`USDC movido del agente anterior: ${oldBalance.toString()}`);
    } else if (oldBalance > 0n) {
      console.log("El USDC anterior sigue en el contrato viejo: no alcanzó el POL para moverlo.");
    }
  } catch {
    console.log("No se movió el USDC del agente anterior.");
  }

  console.log(`Precio: ${price.toString()}`);
  console.log(`Reserva USDC del libro: ${usdcReserve.toString()}`);
  console.log(`WETH del agente: ${inventoryWeth.toString()}`);
}

writeFileSync("contract-address.json", `${JSON.stringify({ address }, null, 2)}\n`);
