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
- `CRON_SECRET` — bearer de `GET /api/protocol/execute`.
- `LYRA_KEEPER_PRIVATE_KEY` — llave que solo paga el gas. No es el owner y no puede retirar.

Red: Polygon Amoy, chainId `80002`. Explorer: https://amoy.polygonscan.com.

## Keeper

Gelato ya no abre cuentas nuevas, así que Lyra llama `executeStrategy()` sola.

`GET /api/protocol/execute` con `Authorization: Bearer CRON_SECRET` lee `checker()`. Si el cooldown pasó, hay USDC y el precio ETH/USD está fresco, la billetera de `LYRA_KEEPER_PRIVATE_KEY` envía la transacción. Si no toca, responde 200 y no gasta gas. La llave del owner se rechaza.

Vercel Hobby solo admite un cron al día. En `vercel.json` el respaldo es `15 11 * * *` (11:15 UTC). Un cron cada hora en ese archivo hace fallar el deploy.

Cada hora lo intenta GitHub Actions (`.github/workflows/lyra-keeper.yml`, minuto 5). GitHub solo programa workflows de la rama `main`. El archivo está en esta rama; el horario no corre hasta copiarlo a `main`. No hace falta fusionar el resto del protocolo: producción ya se publica desde esta rama.

El detalle está en `docs/GELATO_SETUP.md`. Sin USDC depositado, la llamada no se envía.
