import { writeFileSync } from "node:fs";

import { network } from "hardhat";

// USDC mock en Polygon Amoy (6 decimales), el que tiene liquidez en el router.
// La USDC de Circle en Amoy es 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582.
const DEFAULT_USDC = "0x367220DC34967Ae19e4B904aCF572fB1eC6eB3CD";
// MockSwapRouter ya desplegado, con 1 000 000 USDC para la ganancia simulada.
const DEFAULT_ROUTER = "0x9f7C9Ed6431E45C72f919c089D9686138A541Dd7";

const { ethers, networkName } = await network.create();

let usdcAddress = process.env.AMOY_USDC_ADDRESS?.trim() || DEFAULT_USDC;
let routerAddress = process.env.MOCK_ROUTER_ADDRESS?.trim() || DEFAULT_ROUTER;

if (networkName === "polygonMainnet") {
  usdcAddress = process.env.MAINNET_USDC_ADDRESS?.trim() ?? "";
  routerAddress = process.env.MAINNET_ROUTER_ADDRESS?.trim() ?? "";
  if (!usdcAddress || !routerAddress) {
    throw new Error(
      "polygonMainnet necesita MAINNET_USDC_ADDRESS y MAINNET_ROUTER_ADDRESS. El router tiene que implementar swapUSDCForProfit; no hay una dirección de Uniswap escrita en el script.",
    );
  }
} else if (networkName !== "polygonAmoy") {
  throw new Error("Este script despliega en polygonAmoy o polygonMainnet. Para una red local usa npm run deploy:autonomous:local.");
}

console.log("Desplegando LyraAutonomousAgent...");
console.log(`Red: ${networkName}`);
// El cooldown no es argumento: LyraAutonomousAgent lo fija en 10 minutos.
console.log(`USDC: ${usdcAddress}`);
console.log(`Router: ${routerAddress}`);

const agent = await ethers.deployContract("LyraAutonomousAgent", [
  ethers.getAddress(usdcAddress),
  ethers.getAddress(routerAddress),
]);
await agent.waitForDeployment();
const address = await agent.getAddress();

console.log(`Contrato desplegado en: ${address}`);

writeFileSync("contract-address.json", `${JSON.stringify({ address }, null, 2)}\n`);
