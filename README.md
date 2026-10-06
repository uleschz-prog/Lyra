# Lyra Autonomous Protocol

Agente en Solidity dentro de LYRA. El owner deposita y retira USDC. Un keeper llama `executeStrategy()` (sin `onlyOwner`) cuando pasó el cooldown. El contrato lee el precio ETH/USD de Chainlink. Si hay saldo y el precio está fresco, anota una ganancia simulada del 0.1 % y emite `StrategyExecuted` con action `PROFIT_CAPTURED` y el campo `profit`. El USDC no se mueve. Si no hay saldo, revierte.

En Polygon Amoy el agente desplegado es `0x3C50c13B237F1c6c8fA43a399dCa321e7D4aD17F`, con cooldown de 300 segundos y el feed `0xF0d50568e3A7e8259E16663972b11910F89BD8e7`.

La sección vive en el dashboard, ruta `/dashboard/protocol`.

## Compile y test

```bash
npm run compile
npm run test:contracts
```

## Deploy

```bash
cp .env.example .env
npm run deploy:autonomous:local
npm run deploy:autonomous
```

`npm run deploy` ejecuta `scripts/deploy.js` en Polygon Amoy. El feed sale de `ETH_USD_PRICE_FEED` (vacío usa el ETH/USD de Amoy) y el cooldown de `EXECUTION_COOLDOWN` (vacío usa 600 segundos). La USDC por defecto es el mock ya desplegado en Amoy. El script escribe `contract-address.json`. Hace falta `PRIVATE_KEY`.

`deploy:autonomous:local` despliega `MockERC20` y un agregador de precio en Hardhat. `deploy:autonomous` usa el script TypeScript equivalente en Amoy.

Para escuchar eventos en local: `npx hardhat node --network amoyNode` y apunta `NEXT_PUBLIC_LYRA_RPC_URL` a `http://127.0.0.1:8545`.

## Variables

Sin secretos en el repositorio. En `.env`:

- `POLYGON_AMOY_RPC_URL` — RPC de Amoy. Vacío usa `https://rpc-amoy.polygon.technology`.
- `PRIVATE_KEY` — cuenta que despliega en Amoy. No la subas.
- `AMOY_USDC_ADDRESS` — opcional. Vacío usa el mock de Amoy `0x367220DC34967Ae19e4B904aCF572fB1eC6eB3CD`.
- `ETH_USD_PRICE_FEED` — opcional. Vacío usa el ETH/USD de Chainlink en la red del deploy.
- `EXECUTION_COOLDOWN` — segundos entre ejecuciones. Vacío usa 600. El agente de Amoy se desplegó con 300.
- `NEXT_PUBLIC_LYRA_AUTONOMOUS_AGENT_ADDRESS` — dirección del agente en el dashboard. Si falta, usa `CONTRACT_ADDRESS`. Una dirección inválida deja la sección en «Sin contrato configurado».
- `NEXT_PUBLIC_LYRA_RPC_URL` — opcional. Vacío usa el RPC público de Amoy.

Red: Polygon Amoy, chainId `80002`. Explorer: https://amoy.polygonscan.com.

## Gelato

En [app.gelato.cloud](https://app.gelato.cloud/), que abre el login en [app.gelato.cloud/sign-in](https://app.gelato.cloud/sign-in). `app.gelato.network` responde 404. Con la sesión iniciada y MetaMask en Polygon Amoy:

1. Crea una tarea. Target: `0x3C50c13B237F1c6c8fA43a399dCa321e7D4aD17F`.
2. Función: `executeStrategy()`. No recibe argumentos.
3. Trigger **Time-Based**. Intervalo `3600` segundos, o `300` para una prueba. El cooldown on-chain es 300 segundos; un intervalo menor revierte.
4. Pago: POL de Amoy. La interfaz a veces dice MATIC.
5. Gelato muestra la billetera de esa tarea. Envíale POL de testnet. Esa dirección no está en este repo: cópiala de la consola.

El detalle está en `docs/GELATO_SETUP.md`. Sin USDC depositado, la llamada revierte con `No funds to operate`.
