import { writeFileSync } from "node:fs";

import { network } from "hardhat";

import { AMOY_ETH_USD_FEED, POLYGON_ETH_USD_FEED } from "../config/price-feeds.js";

// USDC mock en Polygon Amoy (6 decimales).
// La USDC de Circle en Amoy es 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582.
const DEFAULT_USDC = "0x367220DC34967Ae19e4B904aCF572fB1eC6eB3CD";

const { ethers, networkName } = await network.create();

let usdcAddress = process.env.AMOY_USDC_ADDRESS?.trim() || DEFAULT_USDC;

if (networkName === "polygonMainnet") {
  usdcAddress = process.env.MAINNET_USDC_ADDRESS?.trim() ?? "";
  if (!usdcAddress) {
    throw new Error("polygonMainnet necesita MAINNET_USDC_ADDRESS.");
  }
} else if (networkName !== "polygonAmoy") {
  throw new Error("Este script despliega en polygonAmoy o polygonMainnet. Para una red local usa npm run deploy:autonomous:local.");
}

const defaultFeed = networkName === "polygonMainnet" ? POLYGON_ETH_USD_FEED : AMOY_ETH_USD_FEED;
const priceFeedAddress = process.env.ETH_USD_PRICE_FEED?.trim() || defaultFeed;
const cooldown = BigInt(process.env.EXECUTION_COOLDOWN?.trim() || "600");

console.log("Desplegando LyraAutonomousAgent...");
console.log(`Red: ${networkName}`);
console.log(`USDC: ${usdcAddress}`);
console.log(`ETH/USD: ${priceFeedAddress}`);
console.log(`Cooldown: ${cooldown.toString()} s`);

const agent = await ethers.deployContract("LyraAutonomousAgent", [
  ethers.getAddress(usdcAddress),
  ethers.getAddress(priceFeedAddress),
  cooldown,
]);
await agent.waitForDeployment();
const address = await agent.getAddress();

console.log(`Contrato desplegado en: ${address}`);

writeFileSync("contract-address.json", `${JSON.stringify({ address }, null, 2)}\n`);
