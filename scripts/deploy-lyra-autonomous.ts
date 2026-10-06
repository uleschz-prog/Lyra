import { network } from "hardhat";

import { AMOY_EXPLORER_URL, AMOY_USDC_ADDRESS, resolveAmoyUsdcAddress } from "../config/amoy.js";
import { AMOY_ETH_USD_FEED } from "../config/price-feeds.js";

const LOCAL_NETWORKS = new Set(["hardhat", "localhost", "default", "node", "amoyNode"]);
const LOCAL_LIQUIDITY = 1_000_000_000_000n; // 1_000_000 USDC (6 decimales)
const LOCAL_PROFIT_BPS = 1000n;

const { ethers, networkName } = await network.create();

function isLocalNetwork(name: string): boolean {
  return LOCAL_NETWORKS.has(name);
}

const [deployer] = await ethers.getSigners();
if (!deployer) {
  throw new Error(
    "No hay cuenta para desplegar. En Polygon Amoy define PRIVATE_KEY en .env y no la subas al repositorio.",
  );
}

console.log(`Red: ${networkName}`);
console.log(`Deployer: ${deployer.address}`);

let usdcAddress: string;
let routerAddress: string;
let priceFeedAddress: string;

if (isLocalNetwork(networkName)) {
  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  await usdc.waitForDeployment();
  usdcAddress = await usdc.getAddress();

  const router = await ethers.deployContract("MockSwapRouter", [usdcAddress, LOCAL_PROFIT_BPS]);
  await router.waitForDeployment();
  routerAddress = await router.getAddress();

  const mintTx = await usdc.mint(routerAddress, LOCAL_LIQUIDITY);
  await mintTx.wait();

  const feed = await ethers.deployContract("MockV3Aggregator", [8, 2_000_00000000n]);
  await feed.waitForDeployment();
  priceFeedAddress = await feed.getAddress();
  console.log("MockERC20, MockSwapRouter y MockV3Aggregator desplegados solo en red local.");
} else {
  if (networkName !== "polygonAmoy") {
    throw new Error(`Red ${networkName} no soportada. Usa hardhat, localhost, amoyNode o polygonAmoy.`);
  }

  const mockRouter = process.env.MOCK_ROUTER_ADDRESS?.trim();
  if (!mockRouter) {
    throw new Error(
      "En Polygon Amoy define MOCK_ROUTER_ADDRESS: un MockSwapRouter ya desplegado y con USDC para pagar la ganancia simulada.",
    );
  }

  usdcAddress = ethers.getAddress(resolveAmoyUsdcAddress());
  routerAddress = ethers.getAddress(mockRouter);
  priceFeedAddress = ethers.getAddress(process.env.ETH_USD_PRICE_FEED?.trim() || AMOY_ETH_USD_FEED);

  if (usdcAddress.toLowerCase() === AMOY_USDC_ADDRESS.toLowerCase()) {
    console.log("USDC de Circle en Amoy (default).");
  }
}

const agent = await ethers.deployContract("LyraAutonomousAgent", [usdcAddress, routerAddress, priceFeedAddress]);
await agent.waitForDeployment();
const agentAddress = await agent.getAddress();

console.log(`LyraAutonomousAgent: ${agentAddress}`);
console.log(`USDC: ${usdcAddress}`);
console.log(`Router: ${routerAddress}`);
console.log(`ETH/USD: ${priceFeedAddress}`);
if (networkName === "polygonAmoy") {
  console.log(`Explorer: ${AMOY_EXPLORER_URL}/address/${agentAddress}`);
}
