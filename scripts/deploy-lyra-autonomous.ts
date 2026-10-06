import { network } from "hardhat";

import { AMOY_EXPLORER_URL, AMOY_USDC_ADDRESS, resolveAmoyUsdcAddress } from "../config/amoy.js";
import { AMOY_ETH_USD_FEED } from "../config/price-feeds.js";

const LOCAL_NETWORKS = new Set(["hardhat", "localhost", "default", "node", "amoyNode"]);
const LOCAL_COOLDOWN = 600n;

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
let priceFeedAddress: string;
let cooldown = LOCAL_COOLDOWN;

if (isLocalNetwork(networkName)) {
  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  await usdc.waitForDeployment();
  usdcAddress = await usdc.getAddress();

  const feed = await ethers.deployContract("MockV3Aggregator", [8, 2_000_00000000n]);
  await feed.waitForDeployment();
  priceFeedAddress = await feed.getAddress();
  console.log("MockERC20 y MockV3Aggregator desplegados solo en red local.");
} else {
  if (networkName !== "polygonAmoy") {
    throw new Error(`Red ${networkName} no soportada. Usa hardhat, localhost, amoyNode o polygonAmoy.`);
  }

  usdcAddress = ethers.getAddress(resolveAmoyUsdcAddress());
  priceFeedAddress = ethers.getAddress(process.env.ETH_USD_PRICE_FEED?.trim() || AMOY_ETH_USD_FEED);
  cooldown = BigInt(process.env.EXECUTION_COOLDOWN?.trim() || "600");

  if (usdcAddress.toLowerCase() === AMOY_USDC_ADDRESS.toLowerCase()) {
    console.log("USDC de Circle en Amoy (default).");
  }
}

const agent = await ethers.deployContract("LyraAutonomousAgent", [usdcAddress, priceFeedAddress, cooldown]);
await agent.waitForDeployment();
const agentAddress = await agent.getAddress();

console.log(`LyraAutonomousAgent: ${agentAddress}`);
console.log(`USDC: ${usdcAddress}`);
console.log(`ETH/USD: ${priceFeedAddress}`);
console.log(`Cooldown: ${cooldown.toString()} s`);
if (networkName === "polygonAmoy") {
  console.log(`Explorer: ${AMOY_EXPLORER_URL}/address/${agentAddress}`);
}
