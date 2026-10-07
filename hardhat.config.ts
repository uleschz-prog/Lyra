import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import dotenv from "dotenv";
import { configVariable, defineConfig } from "hardhat/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AMOY_CHAIN_ID, AMOY_DEFAULT_RPC_URL } from "./config/amoy.js";

dotenv.config({ quiet: true });

const root = path.dirname(fileURLToPath(import.meta.url));
const privateKey = process.env.PRIVATE_KEY?.trim();

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.34",
    settings: {
      optimizer: { enabled: true, runs: 1 },
      viaIR: true,
    },
  },
  typechain: {
    outDir: path.join(root, "typechain-types"),
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
    // Nodo local con el chainId de Amoy, para escuchar eventos sin la testnet.
    amoyNode: {
      type: "edr-simulated",
      chainType: "generic",
      chainId: AMOY_CHAIN_ID,
    },
    localhost: {
      type: "http",
      chainType: "generic",
      chainId: AMOY_CHAIN_ID,
      url: "http://127.0.0.1:8545",
      accounts: "remote",
    },
    polygonAmoy: {
      type: "http",
      chainType: "generic",
      chainId: AMOY_CHAIN_ID,
      url: configVariable("POLYGON_AMOY_RPC_URL", {
        default: AMOY_DEFAULT_RPC_URL,
      }),
      ...(privateKey ? { accounts: [configVariable("PRIVATE_KEY")] } : {}),
    },
    polygonMainnet: {
      type: "http",
      chainType: "generic",
      chainId: 137,
      url: configVariable("POLYGON_MAINNET_RPC_URL", {
        default: "https://polygon-bor-rpc.publicnode.com",
      }),
      ...(privateKey ? { accounts: [configVariable("PRIVATE_KEY")] } : {}),
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
